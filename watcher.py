#!/usr/bin/env python3
"""Job queue watcher - processes chat-relay jobs via Claude CLI with streaming"""

import json
import subprocess
import time
import base64
import os
import pty
import re
import select
import signal
import fcntl
import tempfile
import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, Future
from pathlib import Path
from typing import Dict, Optional, Tuple, Set

# Configure logging - write to both stderr and log file
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def _setup_file_logging(log_path: Path):
    """Add a rotating file handler to capture logs to disk."""
    from logging.handlers import RotatingFileHandler
    handler = RotatingFileHandler(
        log_path, maxBytes=5 * 1024 * 1024, backupCount=3  # 5MB, keep 3 backups
    )
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S'
    ))
    logging.getLogger().addHandler(handler)

# Multi-instance support: RELAY_USER env var determines which user's queue to watch
RELAY_USER = os.environ.get("RELAY_USER", "axion")
RELAY_DIR = Path(__file__).parent

def _user_dir(base_name):
    """Get user-specific directory path. Axion uses original names for compat."""
    if RELAY_USER == "axion":
        return RELAY_DIR / base_name
    return RELAY_DIR / f"{base_name}-{RELAY_USER}"

QUEUE_DIR = _user_dir(".queue")
HISTORY_DIR = _user_dir(".history")
HISTORY_DIR.mkdir(exist_ok=True)
TEMP_DIR = _user_dir(".temp")
TEMP_DIR.mkdir(exist_ok=True)
SCREENSHOTS_DIR = _user_dir(".screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

# Heartbeat for health monitoring
HEARTBEAT_FILE = QUEUE_DIR / "watcher.heartbeat"
JOBS_PROCESSED = 0
CURRENT_JOB = None

# Parallel processing - one job per project at a time
MAX_PARALLEL_PROJECTS = 4  # Max different projects running simultaneously
_active_projects: Set[str] = set()
_active_projects_lock = threading.Lock()
_jobs_lock = threading.Lock()

# Job timeout settings
MAX_JOB_RUNTIME_SECONDS = 30 * 60  # 30 minutes max per job
PROCESS_CHECK_INTERVAL = 0.5  # seconds

# Activity update batching (reduce file I/O)
ACTIVITY_UPDATE_INTERVAL = 2.0  # seconds between job activity file updates
_last_activity_update = 0.0

# Session cache for faster lookups
class SessionCache:
    """Cache for relay sessions with TTL."""
    def __init__(self, ttl_seconds: int = 30):
        self.ttl = ttl_seconds
        self._cache: Dict[str, str] = {}
        self._cache_time: float = 0

    def get(self, project: str) -> Optional[str]:
        if time.time() - self._cache_time > self.ttl:
            return None
        return self._cache.get(project)

    def set(self, project: str, session_id: str) -> None:
        self._cache[project] = session_id
        self._cache_time = time.time()

    def reload_from_file(self, filepath: Path) -> None:
        """Reload cache from sessions file."""
        if filepath.exists():
            try:
                with open(filepath) as f:
                    self._cache = json.load(f)
                self._cache_time = time.time()
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to reload session cache: {e}")

_session_cache = SessionCache(ttl_seconds=30)


def is_project_busy(project: str) -> bool:
    """Check if a project already has a job running."""
    with _active_projects_lock:
        return project in _active_projects


def mark_project_active(project: str) -> bool:
    """Mark a project as having an active job. Returns False if already active."""
    with _active_projects_lock:
        if project in _active_projects:
            return False
        if len(_active_projects) >= MAX_PARALLEL_PROJECTS:
            return False
        _active_projects.add(project)
        logger.info(f"Project '{project}' marked active (total: {len(_active_projects)})")
        return True


def mark_project_idle(project: str) -> None:
    """Mark a project as no longer having an active job."""
    with _active_projects_lock:
        _active_projects.discard(project)
        logger.info(f"Project '{project}' marked idle (remaining: {len(_active_projects)})")


def atomic_write_json(filepath: Path, data: dict):
    """Write JSON atomically using temp file + rename to prevent corruption."""
    temp_fd, temp_path = tempfile.mkstemp(dir=filepath.parent, suffix='.tmp')
    try:
        with os.fdopen(temp_fd, 'w') as f:
            json.dump(data, f)
        os.rename(temp_path, filepath)
    except Exception as e:
        logger.error(f"atomic_write_json failed for {filepath}: {e}")
        try:
            os.unlink(temp_path)
        except:
            pass
        raise


def save_to_history(project: str, user_msg: str, assistant_msg: str):
    """Save a chat entry to project history (server-side, browser-independent).

    This ensures history is preserved even if the browser is closed/asleep
    when the job completes.
    """
    if not project or project == "default":
        return
    try:
        history_file = HISTORY_DIR / f"{project}.json"
        history_data = {"entries": []}
        if history_file.exists():
            try:
                with open(history_file) as f:
                    history_data = json.load(f)
            except (json.JSONDecodeError, IOError):
                history_data = {"entries": []}

        history_data["entries"].append({
            "user": user_msg,
            "assistant": assistant_msg,
            "timestamp": time.time()
        })
        # Keep last 100 entries
        history_data["entries"] = history_data["entries"][-100:]
        atomic_write_json(history_file, history_data)
        logger.info(f"Saved history entry for project '{project}'")
    except Exception as e:
        logger.error(f"Failed to save history for project '{project}': {e}")


def should_update_activity() -> bool:
    """Check if enough time has passed to update activity (batching)."""
    global _last_activity_update
    now = time.time()
    if now - _last_activity_update >= ACTIVITY_UPDATE_INTERVAL:
        _last_activity_update = now
        return True
    return False


def lock_file(filepath: Path, exclusive=True):
    """Acquire a file lock. Returns file handle (caller must close)."""
    lock_path = filepath.with_suffix(filepath.suffix + '.lock')
    f = open(lock_path, 'w')
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        return f
    except Exception as e:
        f.close()
        raise


def unlock_file(lock_handle):
    """Release a file lock."""
    if lock_handle:
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
            lock_handle.close()
        except Exception as e:
            logger.warning(f"unlock_file error: {e}")


def write_heartbeat(current_job=None, activity=None):
    """Write heartbeat file so health monitor knows we're alive."""
    global CURRENT_JOB
    CURRENT_JOB = current_job
    try:
        data = {
            "timestamp": time.time(),
            "pid": os.getpid(),
            "jobs_processed": JOBS_PROCESSED,
            "current_job": current_job,
            "activity": activity
        }
        atomic_write_json(HEARTBEAT_FILE, data)
    except Exception as e:
        logger.warning(f"Failed to write heartbeat: {e}")

# Project directory - auto-detect from /opt/clawd/projects
PROJECTS_BASE = Path("/opt/clawd/projects")

def get_project_dir(project: str) -> str:
    """Get the directory for a project (auto-detect from projects folder).

    Handles both simple project names ('relay') and user-scoped paths ('xfg6gb/myproject').
    Returns the project directory path, or None if not found.
    """
    if not project or project == "default":
        return None

    # Check exact match first (handles both 'relay' and 'user/project')
    # Path('/opt/clawd/projects') / 'user/project' correctly resolves to '/opt/clawd/projects/user/project'
    project_path = PROJECTS_BASE / project
    if project_path.exists():
        return str(project_path)

    # Check case-insensitive (only for simple names without /)
    # Don't do case-insensitive matching for user/project paths to avoid confusion
    if "/" not in project:
        for p in PROJECTS_BASE.iterdir():
            if p.is_dir() and p.name.lower() == project.lower():
                return str(p)

        # Check common aliases
        aliases = {
            "hubai": "HUBAi",
            "claimsai": "ClaimsAI",
            "claims": "ClaimsAI",
        }
        if project.lower() in aliases:
            alias_path = PROJECTS_BASE / aliases[project.lower()]
            if alias_path.exists():
                return str(alias_path)

    # Project not found - log warning and return None
    # The caller will handle this (e.g., use parent process cwd or show error)
    logger.warning(f"Project directory not found: {project} (full path would be: {project_path})")
    return None


# Relay session tracking (separate from terminal sessions)
RELAY_SESSIONS_FILE = QUEUE_DIR / "relay_sessions.json"

def get_or_create_relay_session_id(project: str) -> Tuple[str, bool]:
    """Get or create a dedicated relay session ID for a project.
    Returns: (session_id, is_new) - is_new is True if this is a new session
    Uses caching to reduce file I/O.
    """
    # Check cache first
    cached_id = _session_cache.get(project)
    if cached_id:
        # Verify session still exists
        project_dir = get_project_dir(project)
        if project_dir:
            encoded_path = project_dir.replace("/", "-")
            session_file = Path.home() / ".claude" / "projects" / encoded_path / f"{cached_id}.jsonl"
            if session_file.exists():
                logger.debug(f"Using cached session for {project}: {cached_id[:8]}...")
                return cached_id, False

    # Cache miss or invalid - load from file
    sessions = {}
    if RELAY_SESSIONS_FILE.exists():
        try:
            with open(RELAY_SESSIONS_FILE) as f:
                sessions = json.load(f)
            _session_cache.reload_from_file(RELAY_SESSIONS_FILE)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Failed to load relay sessions: {e}")
            sessions = {}

    if project in sessions:
        session_id = sessions[project]
        # Verify the session still exists in Claude's storage
        project_dir = get_project_dir(project)
        if project_dir:
            encoded_path = project_dir.replace("/", "-")
            session_file = Path.home() / ".claude" / "projects" / encoded_path / f"{session_id}.jsonl"
            if not session_file.exists():
                # Session was deleted, create a new one
                logger.info(f"Session {session_id[:8]}... no longer exists, creating new session")
                new_id = str(uuid.uuid4())
                sessions[project] = new_id
                atomic_write_json(RELAY_SESSIONS_FILE, sessions)
                _session_cache.set(project, new_id)
                logger.info(f"Created new relay session for {project}: {new_id[:8]}...")
                return new_id, True
        logger.info(f"Resuming relay session for {project}: {session_id[:8]}...")
        _session_cache.set(project, session_id)
        return session_id, False

    # Create new session ID for this project
    new_id = str(uuid.uuid4())
    sessions[project] = new_id
    atomic_write_json(RELAY_SESSIONS_FILE, sessions)
    _session_cache.set(project, new_id)
    logger.info(f"Created new relay session for {project}: {new_id[:8]}...")
    return new_id, True

def get_relay_session_id(project: str) -> str:
    """Get the dedicated relay session ID for a project, or None if no session exists yet."""
    sessions = {}
    if RELAY_SESSIONS_FILE.exists():
        try:
            with open(RELAY_SESSIONS_FILE) as f:
                sessions = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Failed to load relay sessions: {e}")
            sessions = {}

    session_id = sessions.get(project)

    # Verify the session still exists in Claude's storage
    if session_id:
        project_dir = get_project_dir(project)
        if project_dir:
            # Check if session file exists
            encoded_path = project_dir.replace("/", "-")
            session_file = Path.home() / ".claude" / "projects" / encoded_path / f"{session_id}.jsonl"
            if not session_file.exists():
                # Session was deleted, clear it
                logger.info(f"Session {session_id} no longer exists, starting fresh")
                return None
            else:
                logger.info(f"Resuming session {session_id[:8]}... for {project}")

    return session_id

def save_relay_session_id(project: str, session_id: str):
    """Save the relay session ID for a project."""
    sessions = {}
    if RELAY_SESSIONS_FILE.exists():
        try:
            with open(RELAY_SESSIONS_FILE) as f:
                sessions = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Failed to load relay sessions for save: {e}")
            sessions = {}

    sessions[project] = session_id
    try:
        atomic_write_json(RELAY_SESSIONS_FILE, sessions)
        logger.info(f"Saved relay session for {project}: {session_id}")
    except Exception as e:
        logger.error(f"Failed to save relay session: {e}")


def get_latest_session_id(project: str) -> str:
    """Get the most recent session ID from Claude's session index for a project."""
    project_dir = get_project_dir(project)
    if not project_dir:
        return None

    encoded_path = project_dir.replace("/", "-")
    index_file = Path.home() / ".claude" / "projects" / encoded_path / "sessions-index.json"

    if not index_file.exists():
        return None

    try:
        with open(index_file) as f:
            index = json.load(f)

        # Get the most recent session (format: entries with sessionId and modified)
        entries = index.get("entries", [])
        if entries:
            # Sort by modified date (ISO format string)
            sorted_entries = sorted(entries, key=lambda s: s.get("modified", ""), reverse=True)
            return sorted_entries[0].get("sessionId")
    except Exception as e:
        logger.error(f"Error reading session index: {e}")

    return None

def save_images(images: list, job_id: str) -> list:
    """Save base64 images to temp files and return file paths."""
    image_paths = []
    for i, img in enumerate(images):
        if not img.get("data"):
            continue
        data = img["data"]
        if "," in data:
            data = data.split(",", 1)[1]
        img_type = img.get("type", "image/png")
        ext = "png"
        if "jpeg" in img_type or "jpg" in img_type:
            ext = "jpg"
        elif "gif" in img_type:
            ext = "gif"
        elif "webp" in img_type:
            ext = "webp"
        img_path = TEMP_DIR / f"{job_id}_img{i}.{ext}"
        try:
            with open(img_path, "wb") as f:
                f.write(base64.b64decode(data))
            image_paths.append(str(img_path))
        except Exception as e:
            logger.error(f"Failed to save image {i}: {e}")
    return image_paths

def cleanup_images(job_id: str):
    """Remove temp images for a job."""
    for img_file in TEMP_DIR.glob(f"{job_id}_img*"):
        try:
            img_file.unlink()
        except Exception as e:
            logger.warning(f"Failed to cleanup image {img_file}: {e}")

def parse_stream_json_status(json_lines: list) -> tuple:
    """Parse stream-json output to extract status and accumulated text.
    Returns: (status_string, accumulated_text)

    Enhanced to provide natural language descriptions for voice capability.
    """
    status = "Thinking..."
    text_parts = []
    current_tool = None
    active_agents = []  # Track active sub-agents
    tool_count = 0

    for line in json_lines:
        try:
            obj = json.loads(line)
            msg_type = obj.get("type", "")

            # Handle different message types
            if msg_type == "assistant" and "message" in obj:
                msg = obj["message"]
                content = msg.get("content", [])

                # Process content array for tool_use and text
                for item in content:
                    item_type = item.get("type", "")

                    if item_type == "tool_use":
                        # Tool being called
                        tool_name = item.get("name", "unknown")
                        tool_input = item.get("input", {})
                        tool_id = item.get("id", "")[:8]  # Short ID for tracking
                        current_tool = tool_name
                        tool_count += 1

                        if tool_name == "Read":
                            path = tool_input.get("file_path", "file")
                            filename = Path(path).name
                            status = f"Reading file {filename}"
                        elif tool_name == "Edit":
                            path = tool_input.get("file_path", "file")
                            filename = Path(path).name
                            status = f"Editing file {filename}"
                        elif tool_name == "Write":
                            path = tool_input.get("file_path", "file")
                            filename = Path(path).name
                            status = f"Creating file {filename}"
                        elif tool_name == "Bash":
                            cmd = tool_input.get("command", "")
                            desc = tool_input.get("description", "")
                            if desc:
                                status = desc[:60]
                            elif cmd.startswith("git "):
                                status = f"Running git {cmd.split()[1] if len(cmd.split()) > 1 else 'command'}"
                            elif cmd.startswith("npm ") or cmd.startswith("yarn "):
                                status = f"Running {cmd.split()[0]} {cmd.split()[1] if len(cmd.split()) > 1 else ''}"
                            elif cmd.startswith("python") or cmd.startswith("node"):
                                status = f"Executing script"
                            else:
                                status = f"Running command: {cmd[:50]}"
                        elif tool_name == "Grep":
                            pattern = tool_input.get("pattern", "")[:40]
                            path = tool_input.get("path", "")
                            if path:
                                status = f"Searching for '{pattern}' in {Path(path).name}"
                            else:
                                status = f"Searching codebase for '{pattern}'"
                        elif tool_name == "Glob":
                            pattern = tool_input.get("pattern", "")[:40]
                            status = f"Finding files matching {pattern}"
                        elif tool_name == "Task":
                            desc = tool_input.get("description", "")
                            prompt = tool_input.get("prompt", "")[:100]
                            agent_type = tool_input.get("subagent_type", "general")
                            agent_id = tool_id

                            # Create natural language description
                            if agent_type == "Explore":
                                agent_desc = f"Explorer agent ({agent_id})"
                            elif agent_type == "Plan":
                                agent_desc = f"Planning agent ({agent_id})"
                            elif agent_type == "general-purpose":
                                agent_desc = f"Research agent ({agent_id})"
                            else:
                                agent_desc = f"Agent {agent_id}"

                            if desc:
                                status = f"{agent_desc}: {desc}"
                            elif prompt:
                                # Extract key action from prompt
                                first_line = prompt.split('\n')[0][:60]
                                status = f"{agent_desc}: {first_line}"
                            else:
                                status = f"Starting {agent_desc}"

                            active_agents.append({"id": agent_id, "type": agent_type, "desc": desc or "working"})
                        elif tool_name == "TodoWrite":
                            status = "Updating task checklist"
                        elif tool_name == "WebFetch":
                            url = tool_input.get("url", "")
                            if url:
                                # Extract domain
                                domain = url.split("//")[-1].split("/")[0][:30]
                                status = f"Fetching content from {domain}"
                            else:
                                status = "Fetching web page"
                        elif tool_name == "WebSearch":
                            query = tool_input.get("query", "")[:40]
                            status = f"Searching the web for '{query}'"
                        elif tool_name == "AskUserQuestion":
                            status = "Waiting for your response"
                        elif tool_name == "EnterPlanMode":
                            status = "Entering planning mode"
                        elif tool_name == "ExitPlanMode":
                            status = "Plan ready for review"
                        else:
                            status = f"Using {tool_name}"

                    elif item_type == "text":
                        text_parts.append(item.get("text", ""))

            elif msg_type == "user":
                # Tool result returned - could update to show progress
                content = obj.get("message", {}).get("content", [])
                for item in content:
                    if item.get("type") == "tool_result":
                        result_content = item.get("content", "")
                        # Check if this is an agent completing
                        if isinstance(result_content, str) and "agentId:" in result_content:
                            # Agent completed - extract ID
                            pass  # Keep current status

            elif msg_type == "result":
                status = "Complete"
                # Final result text - only use if we didn't get text from assistant messages
                # (avoid duplication since result often repeats the assistant text)
                if "result" in obj and not text_parts:
                    text_parts.append(obj["result"])

        except json.JSONDecodeError:
            continue

    # If we have active agents, mention them in status
    if active_agents and len(active_agents) > 1:
        status = f"{len(active_agents)} agents working: {active_agents[-1]['desc'][:30]}"

    return status, ''.join(text_parts)


def parse_stream_status(text: str) -> str:
    """Parse Claude's stream output to extract what it's currently doing (legacy text mode)."""
    if not text:
        return "Starting..."

    # Get the last portion of text (most recent activity)
    recent = text[-3000:] if len(text) > 3000 else text

    # Look for tool invocations (Claude Code format)
    # Pattern: tool name followed by parameters
    tool_patterns = [
        (r'Read[^\n]*?file_path["\s:]+([^\s"<>\n]+)', 'Reading {}'),
        (r'Reading\s+([^\s\n]+\.[\w]+)', 'Reading {}'),
        (r'Edit[^\n]*?file_path["\s:]+([^\s"<>\n]+)', 'Editing {}'),
        (r'Write[^\n]*?file_path["\s:]+([^\s"<>\n]+)', 'Writing {}'),
        (r'Bash[^\n]*?command["\s:]+([^\n"]{10,60})', 'Running: {}'),
        (r'Grep[^\n]*?pattern["\s:]+([^\n"]{5,40})', 'Searching for {}'),
        (r'Glob[^\n]*?pattern["\s:]+([^\n"]{5,40})', 'Finding files: {}'),
        (r'WebFetch[^\n]*?url["\s:]+([^\s"<>\n]+)', 'Fetching {}'),
        (r'WebSearch[^\n]*?query["\s:]+([^\n"]{5,50})', 'Searching web: {}'),
    ]

    # Check for tool patterns (reverse to get most recent)
    for pattern, template in tool_patterns:
        matches = re.findall(pattern, recent, re.IGNORECASE)
        if matches:
            # Get the last match (most recent)
            match = matches[-1]
            # Truncate long matches
            if len(match) > 50:
                match = match[:47] + "..."
            return template.format(match)

    # Look for thinking/analysis patterns
    thinking_patterns = [
        (r"Let me (\w+ \w+ \w+)", "{}..."),
        (r"I'll (\w+ \w+ \w+)", "{}..."),
        (r"I need to (\w+ \w+)", "{}..."),
        (r"Looking at (.{10,40})", "Looking at {}"),
        (r"Checking (.{10,40})", "Checking {}"),
        (r"Investigating (.{10,30})", "Investigating {}"),
        (r"Analyzing (.{10,30})", "Analyzing {}"),
    ]

    for pattern, template in thinking_patterns:
        matches = re.findall(pattern, recent)
        if matches:
            match = matches[-1]
            if len(match) > 40:
                match = match[:37] + "..."
            return template.format(match)

    # Check for common activities
    if 'playwright' in recent.lower():
        return "Running Playwright test..."
    if 'npm ' in recent.lower() or 'npx ' in recent.lower():
        return "Running npm command..."
    if 'git ' in recent.lower():
        return "Git operation..."
    if 'test' in recent.lower() and ('running' in recent.lower() or 'pass' in recent.lower() or 'fail' in recent.lower()):
        return "Running tests..."

    # Default: show line count
    line_count = text.count('\n')
    if line_count > 0:
        return f"Processing... ({line_count} lines)"
    return "Thinking..."


def detect_questions(text: str) -> tuple:
    """Detect questions in Claude's output that need user answers."""
    questions = []
    should_wait = False

    # Pattern 0: Explicit [[ASK]] marker
    ask_pattern = re.compile(r'\[\[ASK\]\](.*?)\[\[/ASK\]\]', re.DOTALL)
    ask_matches = ask_pattern.findall(text)
    if ask_matches:
        should_wait = True
        for i, content in enumerate(ask_matches, 1):
            opt_pattern = re.compile(r'(?:^|\n)\s*(?:(\d+)|([a-z]))[.):]\s*(.+?)(?=(?:\n\s*(?:\d+|[a-z])[.):])|\Z)', re.DOTALL | re.IGNORECASE)
            options = opt_pattern.findall(content)
            if len(options) >= 2:
                questions.append({
                    "id": f"Q{i}",
                    "text": content.strip(),
                    "type": "choice",
                    "options": [{"key": num or letter, "text": txt.strip()} for num, letter, txt in options]
                })
            else:
                questions.append({
                    "id": f"Q{i}",
                    "text": content.strip(),
                    "type": "open"
                })
        return questions, should_wait

    # Pattern 1: Numbered options with question indicators
    option_indicators = [
        r'which (?:option|approach|one|would you)',
        r'would you (?:like|prefer)',
        r'please (?:choose|select|pick)',
        r'what (?:would you|do you) (?:prefer|like|want)',
        r'do you want me to',
        r'should i',
        r'let me know (?:which|if|what)',
    ]
    indicator_pattern = '|'.join(option_indicators)
    if re.search(indicator_pattern, text.lower()):
        numbered_opts = re.findall(r'(?:^|\n)\s*(?:Option\s*)?(\d+)[.):]\s*(.+?)(?=(?:\n\s*(?:Option\s*)?\d+[.):])|\n\n|\Z)', text, re.DOTALL | re.IGNORECASE)
        if len(numbered_opts) >= 2:
            should_wait = True
            questions.append({
                "id": "Q1",
                "text": "Please select an option:",
                "type": "choice",
                "options": [{"key": num, "text": txt.strip()[:200]} for num, txt in numbered_opts[:6]]
            })
            return questions, should_wait

    # Pattern 2: **Q1:** style
    q_pattern = re.compile(r'\*\*Q(\d+):\*\*\s*(.+?)(?=\*\*(?:Q\d+:|Answer:)|$)', re.DOTALL)
    matches = q_pattern.findall(text)
    if matches:
        should_wait = True
        for num, content in matches:
            questions.append({
                "id": f"Q{num}",
                "text": content.strip(),
                "type": "open"
            })
            options = re.findall(r'[-•]\s*\(([a-z])\)\s*(.+?)(?=[-•]\s*\([a-z]\)|$|\n\n)', content, re.DOTALL)
            if options:
                questions[-1]["options"] = [{"key": key, "text": txt.strip()} for key, txt in options]
                questions[-1]["type"] = "choice"
    return questions, should_wait


def kill_process_tree(pid):
    """Kill a process and all its children."""
    try:
        import subprocess
        # Use pkill to kill process group
        subprocess.run(['pkill', '-P', str(pid)], capture_output=True)
        os.kill(pid, signal.SIGKILL)
    except Exception as e:
        logger.warning(f"Error killing process {pid}: {e}")


def process_external_api_job(job_id: str, model: str, message: str, project: str,
                              images: list, stream_file: Path, job_file: Path, job: dict) -> bool:
    """Process a job using external API (NVIDIA NIM or OpenAI) instead of Claude CLI."""
    import requests
    from dotenv import load_dotenv

    # Load environment variables
    env_path = Path(__file__).parent / ".env"
    load_dotenv(env_path)

    start_time = time.time()
    logger.info(f"Processing job {job_id} with external API: {model}")

    # Determine API configuration
    is_openai = model.startswith("openai/")

    if is_openai:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        base_url = "https://api.openai.com/v1"
        # Map openai/gpt-4o to gpt-4o
        model_id = model.replace("openai/", "")
    else:
        # NVIDIA NIM
        api_key = os.environ.get("NVIDIA_API_KEY", "")
        base_url = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
        model_id = model

    if not api_key:
        error_msg = "API key not configured for " + ("OpenAI" if is_openai else "NVIDIA")
        job["status"] = "error"
        job["error"] = error_msg
        atomic_write_json(job_file, job)
        logger.error(error_msg)
        return True

    # Build messages
    messages = [{"role": "user", "content": message}]

    # Add image support for vision models (if applicable)
    # Note: Not all NVIDIA models support images

    try:
        # Update job status
        job["status"] = "processing"
        job["activity"] = f"Calling {model_id}..."
        atomic_write_json(job_file, job)
        write_heartbeat(job_id, f"Calling {model_id}...")

        # Make streaming API call
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": model_id,
            "messages": messages,
            "stream": True,
            "max_tokens": 8192
        }

        response = requests.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
            stream=True,
            timeout=300  # 5 minute timeout
        )

        if response.status_code != 200:
            error_msg = f"API error: {response.status_code} - {response.text[:200]}"
            job["status"] = "error"
            job["error"] = error_msg
            atomic_write_json(job_file, job)
            logger.error(error_msg)
            return True

        # Process streaming response
        full_response = []
        stream_data = []

        for line in response.iter_lines():
            if not line:
                continue

            line_text = line.decode("utf-8")
            if line_text.startswith("data: "):
                data_str = line_text[6:]
                if data_str == "[DONE]":
                    break

                try:
                    data = json.loads(data_str)
                    if "choices" in data and len(data["choices"]) > 0:
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            full_response.append(content)

                            # Write stream file for live updates
                            # Format as stream-json compatible
                            stream_entry = {
                                "type": "assistant",
                                "message": {
                                    "content": [{"type": "text", "text": content}]
                                }
                            }
                            stream_data.append(json.dumps(stream_entry))

                            # Update stream file
                            try:
                                temp_stream = stream_file.with_suffix('.tmp')
                                with open(temp_stream, "w") as f:
                                    f.write('\n'.join(stream_data))
                                os.rename(temp_stream, stream_file)
                            except Exception as e:
                                pass

                            # Update activity
                            elapsed = int(time.time() - start_time)
                            preview = "".join(full_response)[-50:].replace('\n', ' ')
                            job["activity"] = f"Generating... ({elapsed}s)"
                            write_heartbeat(job_id, f"Generating: ...{preview}")

                except json.JSONDecodeError:
                    continue

        # Complete the job
        result = "".join(full_response)
        elapsed = time.time() - start_time

        job["status"] = "complete"
        job["result"] = result
        job["completed_at"] = time.time()
        job["elapsed"] = elapsed
        job["activity"] = "Complete"
        atomic_write_json(job_file, job)

        # Write result file
        result_file = job_file.with_suffix('.result')
        result_file.write_text(result)

        logger.info(f"Job {job_id} completed via {model} in {elapsed:.1f}s")
        write_heartbeat(job_id, "Complete")

        # Save to history (server-side, browser-independent)
        job_type = job.get("job_type", "chat")
        if job_type not in ("format",):
            save_to_history(project, message, result)

        return True

    except requests.exceptions.Timeout:
        job["status"] = "error"
        job["error"] = "API request timed out"
        atomic_write_json(job_file, job)
        logger.error(f"Job {job_id} timed out")
        return True

    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
        atomic_write_json(job_file, job)
        logger.error(f"Job {job_id} failed: {e}")
        return True


def process_job(job_file: Path) -> bool:
    """Process a single job file with streaming output via PTY.
    Returns True if job was processed, False if skipped.
    """
    global JOBS_PROCESSED

    master_fd = None
    slave_fd = None
    process = None
    lock_handle = None
    job_id = None
    project = None
    start_time = time.time()

    try:
        # Acquire lock on job file to prevent race conditions
        try:
            lock_handle = lock_file(job_file)
        except Exception as e:
            logger.warning(f"Could not lock {job_file}, skipping: {e}")
            return False

        # Check if file still exists (may have been deleted while waiting for lock)
        if not job_file.exists():
            logger.info(f"Job file {job_file} no longer exists, skipping")
            return False

        try:
            with open(job_file) as f:
                job = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to read job file {job_file}: {e}")
            return False

        if job.get("status") not in ("pending", "answers_provided"):
            return False

        job_id = job["id"]
        message = job["message"]
        model = job.get("model", "opus")
        project = job.get("project", "") or "default"
        images = job.get("images", [])
        context_answers = job.get("context_answers", "")
        job_type = job.get("job_type", "chat")  # "chat" or "format"

        # Check if this project already has a job running
        if not mark_project_active(project):
            # Project is busy or max parallel reached, skip for now
            unlock_file(lock_handle)
            lock_handle = None
            return False

        # Update status to processing
        job["status"] = "processing"
        job["activity"] = "Starting Claude..."
        job["started_at"] = start_time
        try:
            atomic_write_json(job_file, job)
        except Exception as e:
            logger.error(f"Failed to update job status: {e}")
            return

        write_heartbeat(job_id, "Starting Claude...")
        logger.info(f"Processing job {job_id} (project={project}): {message[:50]}...")

        # Determine working directory from project
        cwd = get_project_dir(project)
        if not cwd:
            # Project directory not found - use /opt/clawd/projects as fallback
            # This is better than using the watcher's cwd (/opt/clawd/projects/relay)
            logger.warning(f"Project '{project}' not found, using /opt/clawd/projects as cwd")
            cwd = str(PROJECTS_BASE)

        # Stream file for real-time output
        stream_file = QUEUE_DIR / f"{job_id}.stream"

        # Save images to temp files
        image_paths = save_images(images, job_id)
        if image_paths:
            logger.info(f"Attached {len(image_paths)} image(s)")

        # Check if this is an external API model (NVIDIA, OpenAI) or Claude CLI
        is_nvidia_model = model.startswith("nvidia/") or model.startswith("meta/") or \
                          model.startswith("deepseek-ai/") or model.startswith("qwen/") or \
                          model.startswith("mistralai/") or model.startswith("microsoft/") or \
                          model.startswith("google/") or model.startswith("moonshotai/")
        is_openai_model = model.startswith("openai/")

        if is_nvidia_model or is_openai_model:
            # Use external API instead of Claude CLI
            result = process_external_api_job(
                job_id, model, message, project, images, stream_file, job_file, job
            )
            # Mark project as not active anymore
            mark_project_idle(project)
            if lock_handle:
                unlock_file(lock_handle)
            return result

        # Build claude command (for Claude CLI models)
        model_map = {
            "opus": "claude-opus-4-6",
            "sonnet": "claude-sonnet-4-5-20250929",
            "haiku": "claude-haiku-4-5-20251001",
            "claude": "claude-opus-4-6",  # Default to Opus for 'claude' selection
        }
        model_id = model_map.get(model, "claude-sonnet-4-20250514")

        # Use nice to lower CPU priority so system stays responsive
        cmd = [
            "nice", "-n", "10",
            "claude",
            "--dangerously-skip-permissions",
            "--model", model_id,
            "--output-format", "stream-json",  # Enable real-time streaming
            "--verbose",  # Required for stream-json
        ]

        # Format jobs use a fresh session every time (no conversation context needed)
        # Also limit to 1 turn - format should just return text, no tool use
        if job_type == "format":
            format_session_id = str(uuid.uuid4())
            cmd.extend(["--session-id", format_session_id])
            cmd.extend(["--max-turns", "1"])
        else:
            # Use a dedicated session for relay (separate from terminal sessions)
            relay_session_id, is_new = get_or_create_relay_session_id(project)

            if is_new:
                # First time: create session with our ID
                cmd.extend(["--session-id", relay_session_id])
            else:
                # Subsequent times: resume existing session
                cmd.extend(["--resume", relay_session_id])

        # Add message (with any context answers from previous Q&A)
        full_message = message

        # Universal instructions for all jobs (skip format jobs)
        if job_type != "format":
            universal_instructions = """

---
IMPORTANT RESPONSE GUIDELINES:
- When providing URLs in your response, ALWAYS format them as clickable markdown links: [http://example.com](http://example.com) — never as plain text URLs.
- If you create any web pages, HTML files, or web applications, deploy them to /opt/clawd/projects/.preview/ so they are viewable at [http://127.0.0.1:8800/](http://127.0.0.1:8800/). Copy or write files directly into that directory. For multi-page sites, put the main page as index.html.
---

"""
            full_message = universal_instructions + full_message

        # Add image instructions if images were attached
        if image_paths:
            image_instructions = "\n\n---\nThe user has attached the following image(s). Please read and analyze them:\n"
            for img_path in image_paths:
                image_instructions += f"- {img_path}\n"
            full_message = image_instructions + "\n" + message

        # Add screenshot instructions for Playwright/testing tasks (skip for format jobs)
        if job_type != "format" and any(keyword in message.lower() for keyword in ['playwright', 'test', 'screenshot', 'browser', 'login', 'ui test']):
            screenshot_dir = str(SCREENSHOTS_DIR)
            screenshot_instructions = f"""

---
IMPORTANT: When running Playwright or browser tests, ALWAYS capture screenshots to document your testing:

1. Save screenshots to: {screenshot_dir}/
2. Use descriptive filenames like: {job_id}_step1_login_page.png, {job_id}_step2_after_login.png
3. In your Playwright code, use: await page.screenshot({{ path: '{screenshot_dir}/{job_id}_descriptive_name.png', fullPage: true }})
4. Take screenshots at key moments: before actions, after actions, on errors
5. After testing, list the screenshots you captured so they can be displayed to the user

Example Playwright screenshot code:
```javascript
await page.screenshot({{ path: '{screenshot_dir}/{job_id}_initial.png', fullPage: true }});
// ... do action ...
await page.screenshot({{ path: '{screenshot_dir}/{job_id}_result.png', fullPage: true }});
```
"""
            full_message = screenshot_instructions + "\n" + full_message

        # Detect mockup/design requests and inject mockup workflow instructions
        mockup_keywords = [
            'mockup', 'mock up', 'mock-up', 'design mockup', 'html mockup',
            'css mockup', 'web design', 'ui mockup', 'landing page design',
            'page mockup', 'create a design', 'wireframe', 'prototype design',
            'layout mockup', 'design a page', 'design a website', 'page design'
        ]
        is_mockup_request = job_type != "format" and any(kw in message.lower() for kw in mockup_keywords)

        if is_mockup_request:
            screenshot_dir = str(SCREENSHOTS_DIR)
            temp_dir = str(TEMP_DIR)

            # Detect if URL provided for emulation
            import re as _re
            url_match = _re.search(r'https?://[^\s]+', message)
            url_section = ""
            if url_match:
                target_url = url_match.group(0)
                url_section = f"""
**URL REFERENCE WORKFLOW (do this FIRST):**
The user wants designs based on: {target_url}
1. Use Playwright to navigate to {target_url} and screenshot it
2. Save reference screenshot to: {screenshot_dir}/{job_id}_reference.png
3. Read the reference screenshot to analyze the design (colors, layout, typography, spacing)
4. Use page.evaluate() to extract key CSS values if helpful
5. Your 3 mockup variations should be inspired by but NOT copies of the reference
"""

            # Detect if screenshot attached for replication
            screenshot_section = ""
            if image_paths:
                paths_list = "\n".join(f"  - {p}" for p in image_paths)
                screenshot_section = f"""
**SCREENSHOT REPLICATION WORKFLOW (do this FIRST):**
The user has attached screenshot(s) to replicate/restyle:
{paths_list}
1. Read and analyze the attached screenshot(s) carefully
2. Identify: layout structure, components, colors, fonts, spacing, visual hierarchy
3. Variation A should be a faithful recreation of the screenshot
4. Variation B should be an improved version (better spacing, modern typography)
5. Variation C should be an alternative aesthetic (different color scheme or layout)
"""

            mockup_instructions = f"""

---
DESIGN MOCKUP WORKFLOW - Follow these steps precisely:

{url_section}{screenshot_section}
**STEP 1 - Generate 3 HTML Design Variations:**
Create 3 distinct, self-contained HTML files. Each must be complete with DOCTYPE, head, body, and all CSS in a <style> tag.
Include <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"> for clean typography.
Optionally use <script src="https://cdn.tailwindcss.com"></script> if it helps.

Design guidelines:
- Use modern CSS (flexbox, grid, custom properties)
- Good visual hierarchy: clear headings, readable body text, balanced whitespace
- Professional color palettes with proper contrast ratios
- Subtle shadows, rounded corners, smooth gradients where appropriate
- Realistic placeholder content (not lorem ipsum - use believable text)

CRITICAL - Each variation MUST be DRAMATICALLY different. Not subtle tweaks — completely different visual identities:

**Variation A - "Bold & Dark"**:
  - Dark background (deep navy, charcoal, or black)
  - High contrast accent colors (electric blue, hot pink, neon green, or vibrant orange)
  - Large bold typography, dramatic hero sections
  - Full-width sections with strong visual impact

**Variation B - "Light & Clean"**:
  - Bright white/light grey background
  - Soft pastel or earth-tone accent colors (coral, sage green, warm terracotta, soft blue)
  - Elegant thin typography, generous whitespace
  - Card-based layouts with subtle shadows

**Variation C - "Creative & Colorful"**:
  - Gradient backgrounds or split-color sections
  - Rich multi-color palette (2-3 complementary accent colors)
  - Unique layout approach: asymmetric grids, overlapping elements, angled sections
  - Playful but professional, with distinctive personality

Each mockup should look like it was designed by a DIFFERENT designer for a DIFFERENT brand.

Save files to:
  {temp_dir}/{job_id}_mockup_a.html
  {temp_dir}/{job_id}_mockup_b.html
  {temp_dir}/{job_id}_mockup_c.html

**STEP 2 - Screenshot Each Mockup:**
Use this Playwright script (run with: node /tmp/mockup_screenshot.js):

```javascript
const {{ chromium }} = require('playwright');
(async () => {{
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({{ width: 1280, height: 720 }});

  await page.goto('file://{temp_dir}/{job_id}_mockup_a.html');
  await page.waitForTimeout(500);
  await page.screenshot({{ path: '{screenshot_dir}/{job_id}_mockup_a.png', fullPage: true }});

  await page.goto('file://{temp_dir}/{job_id}_mockup_b.html');
  await page.waitForTimeout(500);
  await page.screenshot({{ path: '{screenshot_dir}/{job_id}_mockup_b.png', fullPage: true }});

  await page.goto('file://{temp_dir}/{job_id}_mockup_c.html');
  await page.waitForTimeout(500);
  await page.screenshot({{ path: '{screenshot_dir}/{job_id}_mockup_c.png', fullPage: true }});

  await browser.close();
}})();
```

**STEP 3 - Self-Review (REQUIRED):**
Read EACH screenshot you just created. For each one, analyze:
- Layout and spacing: Is it balanced? Too cramped or too sparse?
- Typography: Is it readable? Good hierarchy?
- Colors: Do they work together? Good contrast?
- Overall polish: Does it look professional and modern?
Write a brief critique for each.

**STEP 4 - Refine the Best:**
Based on your self-review, pick the strongest design (or combine the best elements from all three).
Create a final polished version:
  {temp_dir}/{job_id}_mockup_final.html
Screenshot it:
  {screenshot_dir}/{job_id}_mockup_final.png
Read the final screenshot to verify it meets your quality standards. If not, refine again.

**STEP 5 - Present Results:**
In your response, explicitly list all screenshot paths so they are auto-discovered:
  {screenshot_dir}/{job_id}_mockup_a.png
  {screenshot_dir}/{job_id}_mockup_b.png
  {screenshot_dir}/{job_id}_mockup_c.png
  {screenshot_dir}/{job_id}_mockup_final.png

Explain your design choices for each variation and why you chose/refined the final version.
Include the complete HTML source for the final mockup in a code block.

IMPORTANT: The HTML files will be served for interactive preview. Make sure they are complete, valid HTML documents that render correctly standalone.
---

"""
            full_message = mockup_instructions + "\n" + full_message

        if context_answers:
            full_message = f"{full_message}\n\n---\nPrevious answers from user:\n{context_answers}"
        cmd.extend(["-p", full_message])

        # Use PTY for real-time output (avoids buffering)
        master_fd, slave_fd = pty.openpty()
        logger.debug(f"PTY created: master={master_fd}, slave={slave_fd}")

        try:
            process = subprocess.Popen(
                cmd,
                stdout=slave_fd,
                stderr=slave_fd,
                stdin=subprocess.DEVNULL,
                cwd=cwd,
                close_fds=True
            )
            logger.info(f"Process started: PID={process.pid}")
        except Exception as e:
            logger.error(f"Failed to start Claude process: {e}")
            os.close(slave_fd)
            os.close(master_fd)
            raise

        os.close(slave_fd)  # Close slave in parent
        slave_fd = None  # Mark as closed

        # Read output in real-time with timeout protection
        output_chunks = []
        json_lines = []
        read_count = 0
        timed_out = False

        try:
            while True:
                # Check for timeout
                elapsed = time.time() - start_time
                if elapsed > MAX_JOB_RUNTIME_SECONDS:
                    logger.error(f"Job {job_id} timed out after {elapsed:.0f}s, killing process")
                    timed_out = True
                    kill_process_tree(process.pid)
                    break

                # Check if there's data to read (with timeout)
                ready, _, _ = select.select([master_fd], [], [], PROCESS_CHECK_INTERVAL)

                if ready:
                    try:
                        chunk = os.read(master_fd, 4096)
                        if chunk:
                            read_count += 1
                            text = chunk.decode('utf-8', errors='replace')
                            output_chunks.append(text)

                            # Parse JSON lines for status
                            full_output = ''.join(output_chunks)
                            json_lines = [l for l in full_output.split('\n') if l.strip()]
                            activity, _ = parse_stream_json_status(json_lines)
                            logger.debug(f"Chunk {read_count}: {len(chunk)} bytes - {activity}")

                            # Write to stream file for UI polling (atomic)
                            try:
                                temp_stream = stream_file.with_suffix('.tmp')
                                with open(temp_stream, "w") as f:
                                    f.write(full_output)
                                os.rename(temp_stream, stream_file)
                            except Exception as e:
                                logger.warning(f"Failed to write stream file: {e}")

                            # Update job activity (batched to reduce I/O)
                            try:
                                if should_update_activity():
                                    if job_file.exists():
                                        with open(job_file) as f:
                                            job = json.load(f)
                                        job["activity"] = activity
                                        atomic_write_json(job_file, job)
                                    write_heartbeat(job_id, activity)
                            except Exception as e:
                                logger.warning(f"Failed to update job activity: {e}")
                    except OSError as e:
                        logger.warning(f"OSError reading PTY: {e}")
                        break

                # Check if process finished
                if process.poll() is not None:
                    # Read any remaining output
                    try:
                        while True:
                            ready, _, _ = select.select([master_fd], [], [], 0.1)
                            if not ready:
                                break
                            chunk = os.read(master_fd, 4096)
                            if not chunk:
                                break
                            output_chunks.append(chunk.decode('utf-8', errors='replace'))
                    except OSError:
                        pass
                    break
        finally:
            # Always close master_fd
            if master_fd is not None:
                try:
                    os.close(master_fd)
                    master_fd = None
                except OSError:
                    pass

        # Wait for process with timeout
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            logger.warning(f"Process {process.pid} didn't exit cleanly, killing")
            kill_process_tree(process.pid)
            process.wait(timeout=5)

        # Handle timeout case
        if timed_out:
            response = f"Error: Job timed out after {MAX_JOB_RUNTIME_SECONDS // 60} minutes. The task may be too complex or Claude may be stuck."
        else:
            # Parse stream-json output to extract final response
            full_output = ''.join(output_chunks)
            json_lines = [l for l in full_output.split('\n') if l.strip()]
            _, response = parse_stream_json_status(json_lines)

            # If no response extracted from JSON, try to get from result message
            if not response:
                for line in reversed(json_lines):
                    try:
                        obj = json.loads(line)
                        if obj.get("type") == "result":
                            response = obj.get("result", "")
                            break
                        elif obj.get("type") == "assistant":
                            msg = obj.get("message", {})
                            if msg.get("type") == "text":
                                response = msg.get("text", "")
                    except json.JSONDecodeError:
                        pass

            # Detect API key / auth errors from raw output
            exit_code = process.returncode if process else None
            if not response or response == "No response":
                auth_patterns = [
                    "invalid_api_key", "authentication_error", "Invalid API key",
                    "unauthorized", "401", "api_key", "expired",
                    "Could not resolve API key", "ANTHROPIC_API_KEY",
                    "overloaded_error", "rate_limit",
                ]
                raw = full_output.lower()
                for pattern in auth_patterns:
                    if pattern.lower() in raw:
                        response = f"Error: Claude API key issue detected ({pattern}). Please check/reset your API key and try again.\n\nRaw output: {full_output[:500]}"
                        logger.error(f"API key error detected for job {job_id}: {pattern}")
                        break

            # If process exited with error and we still have no useful response, show what we got
            if (not response or response == "No response") and exit_code and exit_code != 0:
                response = f"Error: Claude process exited with code {exit_code}.\n\nOutput: {full_output[:1000] if full_output.strip() else '(no output)'}"
                logger.error(f"Job {job_id}: Claude exited with code {exit_code}")

            response = response or "No response"

        # Strip ANSI escape codes from response
        response = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', response)
        response = re.sub(r'\x1b\][^\x07]*\x07', '', response)
        response = re.sub(r'\x1b.', '', response)
        response = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F]', '', response)
        response = response.strip()

        # Check for questions that need user answers (skip for Q&A jobs - they should just respond)
        questions_file = QUEUE_DIR / f"{job_id}.questions"
        questions, should_wait = detect_questions(response)
        if questions and should_wait and job_type not in ("qa", "explain", "format"):
            logger.info(f"Detected {len(questions)} questions, waiting for user answers...")
            with open(questions_file, "w") as f:
                json.dump({
                    "job_id": job_id,
                    "questions": questions,
                    "response_so_far": response,
                    "waiting": True
                }, f)
            job["status"] = "waiting_for_answers"
            job["activity"] = f"Waiting for {len(questions)} answer(s)..."
            with open(job_file, "w") as f:
                json.dump(job, f)
            write_heartbeat(job_id, f"Waiting for {len(questions)} answer(s)")
            # Mark project idle since we're waiting for user input
            if project:
                mark_project_idle(project)
            return True

        # Write final result
        result_file = QUEUE_DIR / f"{job_id}.result"
        with open(result_file, "w") as f:
            f.write(response)

        # Mark job as completed in the JSON so /api/active doesn't find it
        job["status"] = "completed"
        try:
            atomic_write_json(job_file, job)
        except Exception as e:
            logger.warning(f"Failed to update job status to completed: {e}")

        # Save to history (server-side, browser-independent)
        if job_type not in ("format",):
            save_to_history(project, message, response)

        # Cleanup
        if stream_file.exists():
            stream_file.unlink()
        cleanup_images(job_id)

        with _jobs_lock:
            JOBS_PROCESSED += 1
        write_heartbeat(None, "Idle - waiting for jobs")
        logger.info(f"Job {job_id} complete (total: {JOBS_PROCESSED})")
        return True

    except Exception as e:
        logger.error(f"Error processing {job_file}: {e}")
        import traceback
        traceback.print_exc()
        try:
            error_job_id = job_id or job_file.stem
            result_file = QUEUE_DIR / f"{error_job_id}.result"
            with open(result_file, "w") as f:
                f.write(f"Error: {e}")
            # Mark job as completed so it doesn't appear stuck
            if job_file.exists():
                try:
                    with open(job_file) as f:
                        err_job = json.load(f)
                    err_job["status"] = "completed"
                    atomic_write_json(job_file, err_job)
                except Exception:
                    pass
            cleanup_images(error_job_id)
        except Exception as cleanup_error:
            logger.error(f"Error during cleanup: {cleanup_error}")

    finally:
        # Mark project as idle so other jobs for this project can run
        if project:
            mark_project_idle(project)

        # Always cleanup resources
        if slave_fd is not None:
            try:
                os.close(slave_fd)
            except OSError:
                pass
        if master_fd is not None:
            try:
                os.close(master_fd)
            except OSError:
                pass
        if process is not None and process.poll() is None:
            logger.warning(f"Process still running in finally, killing")
            kill_process_tree(process.pid)
        if lock_handle is not None:
            unlock_file(lock_handle)
    return False


def cleanup_stale_jobs():
    """Clean up jobs stuck in 'processing' status.

    Handles three cases:
    1. Job completed (result file exists) but JSON status wasn't updated - fix the status
    2. Job is genuinely being processed right now (project is active) - skip it
    3. Job is orphaned (no active process, no result, past threshold) - mark as error
    """
    stale_threshold = 5 * 60  # 5 minutes
    now = time.time()
    cleaned = 0

    for job_file in QUEUE_DIR.glob("*.json"):
        if job_file.name in ("watcher.heartbeat", "relay_sessions.json"):
            continue
        if job_file.name == "AXION_OUTBOX.json":
            continue

        try:
            with open(job_file) as f:
                job = json.load(f)

            if job.get("status") == "processing":
                job_id = job.get("id", job_file.stem)
                project = job.get("project", "") or "default"
                result_file = QUEUE_DIR / f"{job_id}.result"

                # Case 1: Job actually completed but status wasn't updated
                if result_file.exists():
                    logger.info(f"Fixing completed job {job_id} (result exists but status was 'processing')")
                    job["status"] = "completed"
                    atomic_write_json(job_file, job)
                    cleaned += 1
                    continue

                # Case 2: Job is actively being processed right now - skip it
                if is_project_busy(project):
                    continue

                # Case 3: Orphaned job - no result, no active process
                started_at = job.get("started_at", job.get("created", 0))
                age = now - started_at

                if age > stale_threshold:
                    logger.warning(f"Found orphaned job {job_id} (age: {age:.0f}s), marking as error")
                    with open(result_file, "w") as f:
                        f.write(f"Error: Job was interrupted. Please retry your request.")
                    job["status"] = "completed"
                    atomic_write_json(job_file, job)
                    cleaned += 1
                else:
                    # Recent job, reset to pending to retry
                    logger.info(f"Resetting recent orphaned job {job_id} to pending")
                    job["status"] = "pending"
                    job["activity"] = "Queued (retry after restart)"
                    atomic_write_json(job_file, job)
                    cleaned += 1

        except (json.JSONDecodeError, IOError, KeyError) as e:
            logger.warning(f"Could not check job file {job_file}: {e}")

    if cleaned > 0:
        logger.info(f"Cleaned up {cleaned} stale job(s)")


def cleanup_old_jobs():
    """Clean up old completed jobs, stuck questions, and orphaned files.

    Removes:
    - Completed job files (.json, .result, .stream) older than OLD_JOB_AGE_DAYS
    - Question files (.questions) older than OLD_QUESTIONS_AGE_DAYS
    - Orphaned lock files (.lock) older than OLD_LOCK_AGE_DAYS
    """
    from relay.config import OLD_JOB_AGE_DAYS, OLD_QUESTIONS_AGE_DAYS, OLD_LOCK_AGE_DAYS

    now = time.time()
    old_job_threshold = OLD_JOB_AGE_DAYS * 24 * 3600
    old_questions_threshold = OLD_QUESTIONS_AGE_DAYS * 24 * 3600
    old_lock_threshold = OLD_LOCK_AGE_DAYS * 24 * 3600

    cleaned = {"jobs": 0, "questions": 0, "locks": 0, "streams": 0, "results": 0}

    try:
        # Clean up old completed jobs
        for job_file in QUEUE_DIR.glob("*.json"):
            # Skip special files
            if job_file.name in ("watcher.heartbeat", "relay_sessions.json", "AXION_OUTBOX.json"):
                continue

            try:
                file_age = now - job_file.stat().st_mtime

                # Only delete completed jobs
                try:
                    with open(job_file) as f:
                        job = json.load(f)

                    if job.get("status") == "completed" and file_age > old_job_threshold:
                        job_id = job.get("id", job_file.stem)
                        logger.info(f"Deleting old completed job {job_id} (age: {file_age / 86400:.1f} days)")

                        # Delete all related files
                        job_file.unlink()
                        cleaned["jobs"] += 1

                        # Delete result file
                        result_file = QUEUE_DIR / f"{job_id}.result"
                        if result_file.exists():
                            result_file.unlink()
                            cleaned["results"] += 1

                        # Delete stream file
                        stream_file = QUEUE_DIR / f"{job_id}.stream"
                        if stream_file.exists():
                            stream_file.unlink()
                            cleaned["streams"] += 1

                        # Delete lock file
                        lock_file = QUEUE_DIR / f"{job_id}.json.lock"
                        if lock_file.exists():
                            lock_file.unlink()
                            cleaned["locks"] += 1

                except (json.JSONDecodeError, IOError):
                    pass

            except Exception as e:
                logger.warning(f"Error checking job file {job_file}: {e}")

        # Clean up old stuck questions
        for questions_file in QUEUE_DIR.glob("*.questions"):
            try:
                file_age = now - questions_file.stat().st_mtime
                if file_age > old_questions_threshold:
                    job_id = questions_file.stem
                    logger.info(f"Deleting old stuck questions for job {job_id} (age: {file_age / 86400:.1f} days)")
                    questions_file.unlink()
                    cleaned["questions"] += 1

                    # Also clean up the associated job if it's still waiting
                    job_file = QUEUE_DIR / f"{job_id}.json"
                    if job_file.exists():
                        try:
                            with open(job_file) as f:
                                job = json.load(f)
                            if job.get("status") == "waiting_for_answers":
                                # Mark as error so it doesn't appear active
                                result_file = QUEUE_DIR / f"{job_id}.result"
                                with open(result_file, "w") as f:
                                    f.write("Error: Question timed out - no answer provided.")
                                job["status"] = "completed"
                                atomic_write_json(job_file, job)
                                logger.info(f"Marked timed-out job {job_id} as completed")
                        except Exception as e:
                            logger.warning(f"Error updating timed-out job {job_id}: {e}")

            except Exception as e:
                logger.warning(f"Error cleaning questions file {questions_file}: {e}")

        # Clean up orphaned lock files
        for lock_file in QUEUE_DIR.glob("*.lock"):
            try:
                file_age = now - lock_file.stat().st_mtime
                if file_age > old_lock_threshold:
                    logger.debug(f"Deleting old lock file {lock_file.name} (age: {file_age / 86400:.1f} days)")
                    lock_file.unlink()
                    cleaned["locks"] += 1
            except Exception as e:
                logger.warning(f"Error cleaning lock file {lock_file}: {e}")

        # Log summary if anything was cleaned
        if any(cleaned.values()):
            total = sum(cleaned.values())
            logger.info(f"Old job cleanup: removed {total} files - "
                       f"{cleaned['jobs']} jobs, {cleaned['results']} results, "
                       f"{cleaned['streams']} streams, {cleaned['questions']} questions, "
                       f"{cleaned['locks']} locks")

    except Exception as e:
        logger.error(f"Error during old job cleanup: {e}")
        import traceback
        traceback.print_exc()


def ensure_preview_server():
    """Ensure the universal web preview server is running on port 8800."""
    import socket
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', 8800))
        sock.close()
        if result == 0:
            logger.info("Preview server already running on port 8800")
            return
    except Exception:
        pass

    preview_script = Path("/opt/clawd/projects/preview-server.py")
    if preview_script.exists():
        try:
            subprocess.Popen(
                ["/usr/bin/python3", str(preview_script)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True
            )
            logger.info("Started preview server on port 8800")
        except Exception as e:
            logger.warning(f"Failed to start preview server: {e}")
    else:
        logger.warning(f"Preview server script not found: {preview_script}")


def watch():
    """Watch queue directory for pending jobs with parallel per-project processing."""
    # Clean up any orphaned jobs from previous runs
    cleanup_stale_jobs()

    # Ensure the universal web preview server is running
    ensure_preview_server()

    logger.info(f"Watching {QUEUE_DIR} for jobs...")
    logger.info(f"Heartbeat file: {HEARTBEAT_FILE}")
    logger.info(f"Max job runtime: {MAX_JOB_RUNTIME_SECONDS // 60} minutes")
    logger.info(f"Max parallel projects: {MAX_PARALLEL_PROJECTS}")

    shutdown_event = threading.Event()

    def signal_handler(sig, frame):
        logger.info("Received shutdown signal, shutting down...")
        shutdown_event.set()

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    last_heartbeat = 0
    last_stale_check = time.time()
    last_old_job_cleanup = time.time()
    STALE_CHECK_INTERVAL = 120  # Check for stuck jobs every 2 minutes
    active_futures: Dict[str, Future] = {}  # job_file -> future

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_PROJECTS, thread_name_prefix="JobWorker") as executor:
        while not shutdown_event.is_set():
            try:
                now = time.time()
                if now - last_heartbeat >= 3:
                    with _active_projects_lock:
                        active_count = len(_active_projects)
                    status = f"Processing {active_count} project(s)" if active_count else "Idle - waiting for jobs"
                    write_heartbeat(CURRENT_JOB, status)
                    last_heartbeat = now

                # Periodic stale job cleanup (catch jobs stuck mid-run)
                if now - last_stale_check >= STALE_CHECK_INTERVAL:
                    cleanup_stale_jobs()
                    last_stale_check = now

                # Periodic old job cleanup (remove completed jobs older than threshold)
                try:
                    from relay.config import OLD_JOB_CLEANUP_ENABLED, OLD_JOB_CLEANUP_INTERVAL_SECONDS
                    if OLD_JOB_CLEANUP_ENABLED and now - last_old_job_cleanup >= OLD_JOB_CLEANUP_INTERVAL_SECONDS:
                        cleanup_old_jobs()
                        last_old_job_cleanup = now
                except ImportError:
                    pass  # Config not available, skip cleanup

                # Clean up completed futures
                completed = [k for k, v in active_futures.items() if v.done()]
                for k in completed:
                    future = active_futures.pop(k)
                    try:
                        future.result()  # Get result to catch any exceptions
                    except Exception as e:
                        logger.error(f"Job failed with exception: {e}")

                # Find and submit new jobs
                for job_file in QUEUE_DIR.glob("*.json"):
                    if job_file.name in ("watcher.heartbeat", "relay_sessions.json"):
                        continue

                    # Skip if already being processed
                    if str(job_file) in active_futures:
                        continue

                    # Peek at job to get project (need to check if project is busy)
                    try:
                        with open(job_file) as f:
                            job_data = json.load(f)
                        if job_data.get("status") not in ("pending", "answers_provided"):
                            continue
                        project = job_data.get("project", "") or "default"

                        # Skip if this project already has a job running
                        if is_project_busy(project):
                            continue

                    except (json.JSONDecodeError, IOError):
                        continue

                    # Submit job to thread pool
                    logger.info(f"Submitting job {job_file.stem} for project '{project}' to thread pool")
                    future = executor.submit(process_job, job_file)
                    active_futures[str(job_file)] = future

                time.sleep(0.5)  # Check more frequently since jobs run in parallel

            except KeyboardInterrupt:
                logger.info("Stopped by keyboard interrupt")
                shutdown_event.set()
                break
            except Exception as e:
                logger.error(f"Watch loop error: {e}")
                import traceback
                traceback.print_exc()
                time.sleep(5)

        # Wait for active jobs to complete on shutdown
        logger.info(f"Waiting for {len(active_futures)} active job(s) to complete...")
        for future in active_futures.values():
            try:
                future.result(timeout=10)
            except Exception:
                pass
        logger.info("Shutdown complete")

def _acquire_pid_lock():
    """Ensure only one watcher instance runs per queue directory.

    Uses an exclusive file lock on the PID file so the OS releases it
    automatically if the process dies.
    """
    pid_file = QUEUE_DIR / "watcher.pid"
    # Open (or create) the PID file and keep the fd alive for the process lifetime
    fd = open(pid_file, "w")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (IOError, OSError):
        # Another instance holds the lock
        try:
            with open(pid_file) as f:
                existing_pid = f.read().strip()
        except Exception:
            existing_pid = "unknown"
        print(f"Another watcher is already running (PID {existing_pid}). Exiting.")
        raise SystemExit(1)
    fd.write(str(os.getpid()))
    fd.flush()
    # Keep fd open — closing it would release the lock
    return fd


if __name__ == "__main__":
    # Set up file logging before anything else
    _setup_file_logging(QUEUE_DIR / "watcher.log")

    # Prevent duplicate instances
    _pid_lock_fd = _acquire_pid_lock()
    logger.info(f"Watcher starting (PID {os.getpid()})")

    watch()
