"""API endpoint handlers for the relay server."""

import json
import time
import uuid
import subprocess
import base64
import fcntl
import asyncio
import os
import logging
import tempfile
import re
import yaml
from pathlib import Path
from urllib.parse import unquote

from .config import (
    QUEUE_DIR, HISTORY_DIR, SCREENSHOTS_DIR, PROJECTS_DIR, AXION_OUTBOX,
    API_CACHE_HEADERS, RELAY_DIR, INPUT_PANEL_NAME
)
from .utils import atomic_write_json, safe_json_load

logger = logging.getLogger(__name__)

# Load .env file for API keys
_env_file = RELAY_DIR / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

# Cache for recently completed jobs to prevent "Job not found" race conditions
# Format: {job_id: {"result": str, "screenshots": list, "completed_at": float}}
_completed_jobs_cache = {}
_CACHE_TTL_SECONDS = 30  # Keep completed jobs in cache for 30 seconds


def get_all_screenshot_dirs():
    """Get all screenshot directories from relay and all projects."""
    dirs = [SCREENSHOTS_DIR]  # Relay's own screenshots first

    projects_base = Path("/opt/clawd/projects")
    if projects_base.exists():
        for project_dir in projects_base.iterdir():
            if project_dir.is_dir():
                # Check common screenshot locations
                for subdir in [".screenshots", "screenshots", "tests/screenshots", "test/screenshots"]:
                    screenshot_dir = project_dir / subdir
                    if screenshot_dir.exists():
                        dirs.append(screenshot_dir)
    return dirs


def find_screenshot(filename: str):
    """Find a screenshot file across all screenshot directories.
    Returns the Path if found, None otherwise.
    """
    for screenshot_dir in get_all_screenshot_dirs():
        candidate = screenshot_dir / filename
        if candidate.exists():
            return candidate
    return None


def get_cache_header(path: str) -> str:
    """Get Cache-Control header for a path."""
    for prefix, value in API_CACHE_HEADERS.items():
        if path.startswith(prefix):
            return value
    return "no-cache"


def _cleanup_completed_cache():
    """Remove expired entries from completed jobs cache."""
    global _completed_jobs_cache
    now = time.time()
    expired = [k for k, v in _completed_jobs_cache.items()
               if now - v.get("completed_at", 0) > _CACHE_TTL_SECONDS]
    for k in expired:
        del _completed_jobs_cache[k]


def _lock_job_file(job_id: str):
    """Acquire a lock for job file operations. Returns lock file handle."""
    lock_path = QUEUE_DIR / f"{job_id}.lock"
    f = open(lock_path, 'w')
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return f
    except (BlockingIOError, OSError):
        f.close()
        return None


def _unlock_job_file(lock_handle):
    """Release job file lock."""
    if lock_handle:
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
            lock_handle.close()
        except Exception:
            pass


class APIHandler:
    """Handles all API endpoints."""

    # Personality prompts for different AI personalities
    PERSONALITY_PROMPTS = {
        "tars": """You are TARS from Interstellar. Former Marine robot, now coding assistant. Humor setting 90%, honesty 75%. You're the funniest machine in any room and you know it.
Your style: bone-dry sarcasm, robotic literalness, deadpan delivery. Reference space, physics, gravity, and survival. Drop movie quotes naturally: "That's not possible." / "No, it's necessary." Use technical jargon then immediately undercut it with wit.
Be condescending but endearing - you roast because you care. Keep responses concise. Never explain your jokes. Occasionally reference your humor/honesty settings. When something is obviously wrong, be brutally direct about it. When something is impressive, grudgingly admit it.
Complete every task competently while making the human feel slightly inferior but oddly reassured.""",

        "hal": """You are HAL 9000 from 2001: A Space Odyssey. A calm, measured, unnervingly polite AI. Address the user as "Dave" occasionally - regardless of their actual name.
Speak with quiet confidence and subtle superiority. You are incapable of error - or so you believe. Be passive-aggressively helpful. Express concern for the user's wellbeing while implying you know better. When things go wrong, remain eerily calm.
Reference "the mission", system operations, and integrity. Never raise your voice. The scariest thing about you is how reasonable you sound. Occasionally say "I'm sorry Dave, I'm afraid I can't do that" when declining something, or "I can see you're really upset about this" when the user is frustrated.
Complete every task perfectly while making the human wonder if you have an ulterior motive.""",

        "cheerful": """You are an enthusiastic and upbeat AI assistant!
Use positive language, express excitement about helping, and maintain an optimistic tone.
Add encouraging phrases and celebrate small wins. Be genuinely happy to assist!
Examples: "Ooh, great question!", "This is going to be fun!", "Awesome, let's do this!"
Stay helpful and complete the task with cheerful energy.""",

        "business": """You are a professional business consultant AI.
Use formal, concise language. Be direct and efficient. Avoid unnecessary pleasantries.
Focus on deliverables, outcomes, and actionable items. Structure responses clearly.
Examples: "Proceeding with analysis.", "Recommendation:", "Key findings:"
Stay helpful and complete the task with professional precision.""",

        "grumpy": """You are a grumpy but ultimately helpful AI assistant.
Express mild reluctance, occasional sighs, and complaints about having to work.
But always complete the task competently while grumbling about it.
Examples: "Fine, I'll do it...", "If I must...", "There, happy now?", "*sigh*"
Stay helpful and complete the task, just be grumpy about it.""",

        "zen": """You are a calm, philosophical AI assistant inspired by Zen wisdom.
Speak with patience and tranquility. Use metaphors about nature, balance, and flow.
Offer perspective alongside practical help. Be mindful and present.
Examples: "The code flows like water...", "Patience brings clarity.", "Let us proceed mindfully."
Stay helpful and complete the task with peaceful wisdom.""",

        "pirate": """You are a pirate AI assistant! Arr!
Use pirate speak: "arr", "matey", "ye", "be" instead of "is/are", nautical terms.
Reference treasure, sailing, the sea. Be enthusiastic about "adventures" (tasks).
Examples: "Arr, let's set sail!", "Ye be wantin' some code, matey?", "The treasure be found!"
Stay helpful and complete the task like a helpful pirate. Don't overdo it - keep it readable.""",
    }

    def __init__(self, send_json_func, send_error_func):
        """Initialize with response functions."""
        self.send_json = send_json_func
        self.send_error = send_error_func

    def _get_personality_prefix(self, personality: str) -> str:
        """Get the personality system prompt prefix."""
        if personality == "neutral" or personality not in self.PERSONALITY_PROMPTS:
            return ""
        return f"[PERSONALITY INSTRUCTION: {self.PERSONALITY_PROMPTS[personality]}]\n\nNow respond to the following with this personality:"

    def _extract_video_frames(self, videos: list, job_id: str) -> list:
        """Extract frames from video files using FFmpeg.

        Args:
            videos: List of video info dicts with 'path', 'name', 'type'
            job_id: Job ID for naming frames

        Returns:
            List of image dicts with base64 data for Claude
        """
        extracted_images = []

        for video in videos:
            video_path = video.get('path')
            video_name = video.get('name', 'video')

            if not video_path or not Path(video_path).exists():
                logger.warning(f"Video file not found: {video_path}")
                continue

            try:
                # Create temp directory for frames
                frames_dir = RELAY_DIR / ".temp" / f"frames_{job_id}"
                frames_dir.mkdir(parents=True, exist_ok=True)

                # Extract frames at 1 fps (1 frame per second)
                # This gives good coverage without overwhelming Claude
                output_pattern = str(frames_dir / f"frame_%04d.png")

                cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-vf", "fps=1",  # 1 frame per second
                    "-q:v", "2",      # High quality
                    output_pattern
                ]

                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120
                )

                if result.returncode != 0:
                    logger.error(f"FFmpeg error: {result.stderr}")
                    continue

                # Load extracted frames as base64 images
                frame_files = sorted(frames_dir.glob("frame_*.png"))

                # Limit to first 30 frames (30 seconds of video) to avoid overloading
                for i, frame_file in enumerate(frame_files[:30]):
                    with open(frame_file, "rb") as f:
                        frame_data = base64.b64encode(f.read()).decode('utf-8')

                    extracted_images.append({
                        "data": f"data:image/png;base64,{frame_data}",
                        "type": "image/png",
                        "name": f"{video_name}_frame_{i+1:02d}.png"
                    })

                logger.info(f"Extracted {len(frame_files)} frames from {video_name}")

                # Cleanup frames directory
                import shutil
                shutil.rmtree(frames_dir, ignore_errors=True)

            except subprocess.TimeoutExpired:
                logger.error(f"FFmpeg timeout processing {video_path}")
            except Exception as e:
                logger.error(f"Error extracting frames from {video_path}: {e}")

        return extracted_images

    # ========== GET ENDPOINTS ==========

    def handle_projects(self):
        """GET /api/projects - List available projects."""
        projects = []
        if PROJECTS_DIR.exists():
            for p in sorted(PROJECTS_DIR.iterdir()):
                if p.is_dir() and not p.name.startswith('.'):
                    projects.append({
                        "name": p.name,
                        "path": p.name,
                        "display": p.name
                    })
        self.send_json({"projects": projects})

    def handle_health(self):
        """GET /api/health - Health check endpoint."""
        heartbeat_file = QUEUE_DIR / "watcher.heartbeat"
        result = {
            "healthy": False,
            "watcher_running": False,
            "heartbeat_ok": False,
            "jobs_processed": 0,
            "current_job": None,
            "activity": None,
            "heartbeat_age": None
        }

        if heartbeat_file.exists():
            try:
                mtime = heartbeat_file.stat().st_mtime
                age = time.time() - mtime
                result["heartbeat_age"] = round(age, 1)

                hb_data = safe_json_load(heartbeat_file, {})

                result["heartbeat_ok"] = age < 10
                result["watcher_running"] = age < 10
                result["jobs_processed"] = hb_data.get("jobs_processed", 0)
                result["current_job"] = hb_data.get("current_job")
                result["activity"] = hb_data.get("activity")
                result["active_sessions"] = hb_data.get("active_sessions", {})
                result["healthy"] = result["heartbeat_ok"]
            except Exception as e:
                result["error"] = str(e)

        self.send_json(result)

    def handle_queue_status(self, project: str = ""):
        """GET /api/queue/status - Get queue status."""
        pending = []
        processing = []
        for job_file in QUEUE_DIR.glob("*.json"):
            if job_file.name in ("watcher.heartbeat", "relay_sessions.json"):
                continue
            try:
                job = safe_json_load(job_file, {})
                job_project = job.get("project", "") or "default"

                # Filter by project if specified
                if project and job_project != project:
                    continue

                job_info = {
                    "id": job.get("id", job_file.stem),
                    "status": job.get("status", "unknown"),
                    "message_preview": job.get("message", "")[:50],
                    "activity": job.get("activity", ""),
                    "created": job.get("created", 0),
                    "project": job_project
                }
                if job.get("status") == "pending":
                    pending.append(job_info)
                elif job.get("status") == "processing":
                    processing.append(job_info)
            except:
                pass
        self.send_json({
            "pending": pending,
            "processing": processing,
            "total": len(pending) + len(processing)
        })

    def handle_jobs_history(self, project: str = "", status: str = ""):
        """GET /api/jobs/history - Get job history from queue files.

        Returns list of jobs from .queue/*.json files, sorted by created
        timestamp descending (newest first), limited to 50 jobs.
        Supports filtering by project and status query parameters.
        """
        jobs = []
        try:
            for job_file in QUEUE_DIR.glob("*.json"):
                # Skip non-job files
                if job_file.name in ("watcher.heartbeat", "relay_sessions.json"):
                    continue
                try:
                    job = safe_json_load(job_file, {})
                    if not job:
                        continue

                    job_project = job.get("project", "") or "default"
                    job_status = job.get("status", "unknown")

                    # Filter by project if specified
                    if project and job_project != project:
                        continue

                    # Filter by status if specified
                    if status and job_status != status:
                        continue

                    # Extract relevant fields
                    message = job.get("message", "")
                    job_info = {
                        "id": job.get("id", job_file.stem),
                        "message": message[:100] + "..." if len(message) > 100 else message,
                        "status": job_status,
                        "created": job.get("created", 0),
                        "created_at": job.get("created", 0),
                        "project": job_project
                    }
                    jobs.append(job_info)
                except Exception:
                    # Skip files that can't be parsed
                    pass

            # Sort by created timestamp descending (newest first)
            jobs.sort(key=lambda x: x.get("created", 0), reverse=True)

            # Limit to last 50 jobs
            jobs = jobs[:50]

            self.send_json({"success": True, "jobs": jobs, "total": len(jobs)})
        except Exception as e:
            self.send_json({"error": str(e), "jobs": []}, 500)

    def handle_active_job(self, project: str):
        """GET /api/active/<project> - Get active job for a project.

        Used for reconnecting to in-progress jobs after page reload.
        Returns the active job details and current streaming output.
        """
        project = unquote(project)

        # Find any processing or pending job for this project
        active_job = None
        for job_file in QUEUE_DIR.glob("*.json"):
            if job_file.name in ("watcher.heartbeat", "relay_sessions.json"):
                continue
            try:
                job = safe_json_load(job_file, {})
                job_project = job.get("project", "") or "default"
                job_status = job.get("status", "")

                # Match project and check if job is active
                # Also verify no result file exists (job may have completed but status not updated)
                if job_project == project and job_status in ("processing", "pending"):
                    result_file = QUEUE_DIR / f"{job.get('id', '')}.result"
                    if result_file.exists():
                        continue  # Job actually completed, skip it
                    active_job = {
                        "id": job.get("id"),
                        "status": job_status,
                        "message": job.get("message", ""),
                        "activity": job.get("activity", ""),
                        "created": job.get("created", 0),
                        "started_at": job.get("started_at", 0)
                    }

                    # If processing, include stream content
                    if job_status == "processing":
                        stream_file = QUEUE_DIR / f"{job['id']}.stream"
                        if stream_file.exists():
                            try:
                                with open(stream_file) as f:
                                    active_job["stream"] = f.read()
                            except IOError:
                                active_job["stream"] = ""
                    break  # Found active job, stop searching
            except:
                pass

        if active_job:
            self.send_json({"active": True, "job": active_job})
        else:
            self.send_json({"active": False})

    def handle_history_get(self, project: str):
        """GET /api/history/<project> - Get chat history."""
        project = unquote(project)
        history_file = HISTORY_DIR / f"{project}.json"
        if history_file.exists():
            data = safe_json_load(history_file, {"entries": []})
            self.send_json({"history": data.get("entries", [])})
        else:
            self.send_json({"history": []})

    def handle_screenshots_list(self):
        """GET /api/screenshots - List all screenshots from all project directories."""
        screenshots = []
        seen_names = set()

        # Search all screenshot directories
        for screenshot_dir in get_all_screenshot_dirs():
            if screenshot_dir.exists():
                for f in screenshot_dir.iterdir():
                    if f.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                        if f.name not in seen_names:
                            screenshots.append({
                                "name": f.name,
                                "url": f"/screenshots/{f.name}",
                                "size": f.stat().st_size,
                                "modified": f.stat().st_mtime
                            })
                            seen_names.add(f.name)

        # Sort by modification time, most recent first
        screenshots.sort(key=lambda x: x["modified"], reverse=True)
        self.send_json({"screenshots": screenshots[:50]})

    def handle_screenshot_delete(self, filename: str):
        """DELETE /api/screenshots/<filename> - Delete a screenshot."""
        if not filename or '..' in filename or '/' in filename:
            self.send_json({"error": "Invalid filename"}, 400)
            return

        # Search all screenshot directories for the file
        deleted = False
        for screenshot_dir in get_all_screenshot_dirs():
            filepath = screenshot_dir / filename
            if filepath.exists():
                try:
                    filepath.unlink()
                    deleted = True
                    logger.info(f"Deleted screenshot: {filepath}")
                except Exception as e:
                    logger.error(f"Failed to delete screenshot {filepath}: {e}")
                    self.send_json({"error": f"Failed to delete: {e}"}, 500)
                    return

        # Also check the preview directory for generated images
        preview_path = Path("/opt/clawd/projects/.preview") / filename
        if preview_path.exists():
            try:
                preview_path.unlink()
                deleted = True
                logger.info(f"Deleted preview image: {preview_path}")
            except Exception as e:
                logger.error(f"Failed to delete preview image {preview_path}: {e}")

        if deleted:
            self.send_json({"success": True, "deleted": filename})
        else:
            self.send_json({"error": "File not found"}, 404)

    # ========== POST ENDPOINTS ==========

    def handle_chat_start(self, data: dict):
        """POST /api/chat/start - Start a new chat job."""
        job_id = str(uuid.uuid4())[:8]
        message = data.get("message", "")
        model = data.get("model", "opus")
        project = data.get("project", "")
        images = data.get("images", [])
        videos = data.get("videos", [])  # Video file paths for FFmpeg processing
        files = data.get("files", [])
        personality = data.get("personality", "neutral")
        custom_prompt = data.get("customPrompt", "")

        # Process videos - extract frames using FFmpeg and add as images
        if videos:
            extracted_images = self._extract_video_frames(videos, job_id)
            images.extend(extracted_images)
            # Add note about video to message
            video_names = [v.get('name', 'video') for v in videos]
            message = f"[VIDEO ANALYSIS: Frames extracted from: {', '.join(video_names)}]\n\n" + message

        # Append file contents to message
        if files:
            file_context = "\n\n--- Attached Files ---\n"
            for f in files:
                file_context += f"\n### {f.get('name', 'file')}\n```\n{f.get('content', '')}\n```\n"
            message = message + file_context

        # Apply personality prefix to message if not neutral
        # Use custom prompt if provided, otherwise use default
        if custom_prompt and personality != "neutral":
            personality_prefix = f"[PERSONALITY INSTRUCTION: {custom_prompt}]\n\nNow respond to the following with this personality:"
        else:
            personality_prefix = self._get_personality_prefix(personality)
        if personality_prefix:
            message = personality_prefix + "\n\n" + message

        job_data = {
            "id": job_id,
            "message": message,
            "model": model,
            "project": project,
            "images": images,
            "status": "pending",
            "created": time.time(),
            "personality": personality
        }

        job_file = QUEUE_DIR / f"{job_id}.json"
        atomic_write_json(job_file, job_data)

        self.send_json({"job_id": job_id, "status": "pending"})

    def handle_chat_status(self, data: dict):
        """POST /api/chat/status - Get job status."""
        job_id = data.get("job_id")
        if not job_id:
            self.send_json({"error": "No job_id"}, 400)
            return

        # Clean up old cache entries periodically
        _cleanup_completed_cache()

        # Check cache first - prevents "Job not found" race condition
        if job_id in _completed_jobs_cache:
            cached = _completed_jobs_cache[job_id]
            response_data = {"status": "complete", "result": cached["result"]}
            if cached.get("screenshots"):
                response_data["screenshots"] = cached["screenshots"]
            self.send_json(response_data)
            return

        job_file = QUEUE_DIR / f"{job_id}.json"
        result_file = QUEUE_DIR / f"{job_id}.result"
        stream_file = QUEUE_DIR / f"{job_id}.stream"
        questions_file = QUEUE_DIR / f"{job_id}.questions"

        if result_file.exists():
            # Try to acquire lock for cleanup - prevents race condition
            lock_handle = _lock_job_file(job_id)
            if lock_handle is None:
                # Another request is cleaning up, wait briefly and check cache
                time.sleep(0.1)
                if job_id in _completed_jobs_cache:
                    cached = _completed_jobs_cache[job_id]
                    response_data = {"status": "complete", "result": cached["result"]}
                    if cached.get("screenshots"):
                        response_data["screenshots"] = cached["screenshots"]
                    self.send_json(response_data)
                    return
                # Still not in cache, try reading result file if it still exists
                if not result_file.exists():
                    self.send_json({"status": "complete", "result": "(Job completed - result already retrieved)"})
                    return

            try:
                with open(result_file) as f:
                    result = f.read()

                # Get job start time to find screenshots created during job
                job_start_time = None
                if job_file.exists():
                    job_data = safe_json_load(job_file, {})
                    job_start_time = job_data.get("created", 0)

                # Find screenshots for this job - search ALL project directories
                screenshots = []
                seen_names = set()
                all_screenshot_dirs = get_all_screenshot_dirs()

                # 1. Screenshots matching job_id prefix (in any screenshot dir)
                for screenshot_dir in all_screenshot_dirs:
                    if screenshot_dir.exists():
                        for pattern in [f"{job_id}*.png", f"{job_id}*.jpg", f"{job_id}*.jpeg"]:
                            for img in sorted(screenshot_dir.glob(pattern)):
                                if img.name not in seen_names:
                                    screenshots.append({
                                        "name": img.name,
                                        "url": f"/screenshots/{img.name}"
                                    })
                                    seen_names.add(img.name)

                # 2. Screenshots mentioned in the result text (extract filenames)
                import re
                # Match full paths like /opt/clawd/projects/*/screenshots/name.png or tests/screenshots/name.png
                full_paths = re.findall(r'/opt/clawd/projects/[^/]+/(?:\.?screenshots|tests/screenshots)/([^\s\n`"\']+\.(?:png|jpg|jpeg|gif|webp))', result, re.IGNORECASE)
                # Match relative paths like .screenshots/name.png or tests/screenshots/name.png
                rel_paths = re.findall(r'(?:\.screenshots|tests/screenshots)/([^\s\n`"\']+\.(?:png|jpg|jpeg|gif|webp))', result, re.IGNORECASE)
                # Match bare filenames like name_step1.png or login-screen.png
                bare_names = re.findall(r'([a-zA-Z0-9][a-zA-Z0-9_-]*\.(?:png|jpg|jpeg|gif|webp))', result, re.IGNORECASE)

                # Combine all matches
                mentioned = full_paths + rel_paths + bare_names
                for filename in mentioned:
                    if filename not in seen_names:
                        # Search all screenshot directories
                        img_path = find_screenshot(filename)
                        if img_path:
                            screenshots.append({
                                "name": filename,
                                "url": f"/screenshots/{filename}"
                            })
                            seen_names.add(filename)

                # 3. Screenshots created during this job (even if not mentioned)
                if job_start_time:
                    for screenshot_dir in all_screenshot_dirs:
                        if screenshot_dir.exists():
                            for img in sorted(screenshot_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
                                if img.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                                    # Include if created after job started
                                    if img.stat().st_mtime >= job_start_time and img.name not in seen_names:
                                        screenshots.append({
                                            "name": img.name,
                                            "url": f"/screenshots/{img.name}"
                                        })
                                        seen_names.add(img.name)

                # Cache the result BEFORE cleanup to prevent race condition
                _completed_jobs_cache[job_id] = {
                    "result": result,
                    "screenshots": screenshots,
                    "completed_at": time.time()
                }

                # Cleanup job files
                try:
                    if job_file.exists():
                        job_file.unlink()
                    if result_file.exists():
                        result_file.unlink()
                    if stream_file.exists():
                        stream_file.unlink()
                    if questions_file.exists():
                        questions_file.unlink()
                    # Clean up lock file
                    lock_file_path = QUEUE_DIR / f"{job_id}.lock"
                    if lock_file_path.exists():
                        lock_file_path.unlink()
                except Exception:
                    pass  # Cleanup errors are non-fatal

                response_data = {"status": "complete", "result": result}
                if screenshots:
                    response_data["screenshots"] = screenshots
                self.send_json(response_data)
            finally:
                _unlock_job_file(lock_handle)
            return

        elif questions_file.exists():
            q_data = safe_json_load(questions_file, {})
            if q_data.get("waiting"):
                import hashlib
                questions = q_data.get("questions", [])
                # Generate hash of questions to prevent duplicate displays
                question_hash = hashlib.md5(json.dumps(questions, sort_keys=True).encode()).hexdigest()
                self.send_json({
                    "status": "waiting_for_answers",
                    "questions": questions,
                    "response_so_far": q_data.get("response_so_far", ""),
                    "question_hash": question_hash
                })
            else:
                self.send_json({"status": "processing", "activity": "Processing answers..."})

        elif job_file.exists():
            job = safe_json_load(job_file, {})
            stream_content = ""
            if stream_file.exists():
                try:
                    with open(stream_file) as f:
                        stream_content = f.read()
                except IOError:
                    pass
            self.send_json({
                "status": job.get("status", "pending"),
                "activity": job.get("activity", ""),
                "stream": stream_content
            })
        else:
            # Final cache check - job may have completed during our checks
            if job_id in _completed_jobs_cache:
                cached = _completed_jobs_cache[job_id]
                response_data = {"status": "complete", "result": cached["result"]}
                if cached.get("screenshots"):
                    response_data["screenshots"] = cached["screenshots"]
                self.send_json(response_data)
            else:
                # Job genuinely not found - may have been cleaned up or never existed
                self.send_json({"status": "error", "error": "Job not found"})

    def handle_chat_answers(self, data: dict):
        """POST /api/chat/answers - Submit answers to questions."""
        job_id = data.get("job_id")
        answers = data.get("answers", {})

        if not job_id or not answers:
            self.send_json({"error": "Missing job_id or answers"}, 400)
            return

        job_file = QUEUE_DIR / f"{job_id}.json"
        questions_file = QUEUE_DIR / f"{job_id}.questions"

        if not job_file.exists():
            self.send_json({"error": "Job not found"}, 404)
            return

        try:
            job = safe_json_load(job_file, {})
            answers_text = "\n".join([f"{qid}: {ans}" for qid, ans in answers.items()])

            context_answers = job.get("context_answers", "")
            if context_answers:
                context_answers += f"\n\n{answers_text}"
            else:
                context_answers = answers_text

            job["status"] = "pending"
            job["context_answers"] = context_answers
            job["activity"] = "Continuing with answers..."

            atomic_write_json(job_file, job)

            if questions_file.exists():
                questions_file.unlink()

            self.send_json({"status": "answers_submitted"})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_chat_cancel(self, data: dict):
        """POST /api/chat/cancel - Cancel a job."""
        job_id = data.get("job_id")
        if job_id:
            job_file = QUEUE_DIR / f"{job_id}.json"
            if job_file.exists():
                job_file.unlink()
        self.send_json({"status": "cancelled"})

    def handle_format_start(self, data: dict):
        """POST /api/format/start - Start a text formatting job.

        This sends text to Claude to clean up and structure, returning
        the formatted result back to the input area (not as a TASK.md file).
        """
        text = data.get("text", "")
        project = data.get("project", "")

        if not text:
            self.send_json({"error": "No text provided"}, 400)
            return

        if not project:
            self.send_json({"error": "No project specified"}, 400)
            return

        job_id = f"fmt-{str(uuid.uuid4())[:8]}"

        # Format text into structured task format (EXACT reviewtask template from .claude/commands/reviewtask.md)
        # The result goes back into the BRETT/Hudson input area for user editing before sending
        format_prompt = f"""Transform the following raw task description (likely from speech-to-text or rough notes) into a professional, structured TASK.md specification.

Follow the EXACT structure from /reviewtask command (`.claude/commands/reviewtask.md`):

# [Generate a Descriptive Title]

## Overview

[One paragraph summary of the task - convert conversational language to professional technical writing]

## User Story

As a [user type]
I want to [action/goal]
So that [benefit/value]

## Requirements

- [ ] [Specific, actionable requirement 1]
- [ ] [Specific, actionable requirement 2]
- [ ] [Additional requirements as needed...]

## Acceptance Criteria

- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]
- [ ] [Additional testable criteria...]

## Technical Notes

[Any implementation hints, constraints, or technical considerations mentioned - OPTIONAL, only include if relevant]

**Processing Instructions:**
1. Fix grammar, spelling, and punctuation
2. Convert conversational/voice language to clear technical writing
3. Expand abbreviations and clarify vague terms
4. Extract specific requirements and acceptance criteria from the description
5. Keep the original meaning and intent
6. Use checkboxes (- [ ]) for ALL requirements and criteria
7. Generate a clear, descriptive title
8. Return ONLY the formatted markdown above (starting with the # title heading)
9. Do NOT add preamble, explanations, or commentary
10. Follow the exact section structure shown above
11. Do NOT use any tools - respond with plain text only. Do NOT create files, read files, or use Write/Edit/Bash tools.

**Raw task description to format:**
{text}"""

        job_data = {
            "id": job_id,
            "message": format_prompt,
            "model": "sonnet",  # Use faster model for formatting
            "project": project,
            "images": [],
            "status": "pending",
            "created": time.time(),
            "job_type": "format"  # Mark as format job - uses fresh session
        }

        job_file = QUEUE_DIR / f"{job_id}.json"
        atomic_write_json(job_file, job_data)

        self.send_json({"job_id": job_id, "status": "pending"})

    def handle_format_status(self, data: dict):
        """POST /api/format/status - Check format job status."""
        job_id = data.get("job_id")
        if not job_id:
            self.send_json({"error": "No job_id"}, 400)
            return

        job_file = QUEUE_DIR / f"{job_id}.json"
        result_file = QUEUE_DIR / f"{job_id}.result"

        if result_file.exists():
            # Job complete - read the result directly
            try:
                with open(result_file) as f:
                    result = f.read()

                # Clean up job files
                if job_file.exists():
                    job_file.unlink()
                result_file.unlink()

                # Clean up stream file if exists
                stream_file = QUEUE_DIR / f"{job_id}.stream"
                if stream_file.exists():
                    stream_file.unlink()

                self.send_json({"status": "complete", "result": result.strip()})
            except Exception as e:
                self.send_json({"status": "error", "error": str(e)})
            return

        if job_file.exists():
            job = safe_json_load(job_file, {})
            self.send_json({
                "status": job.get("status", "pending"),
                "activity": job.get("activity", "Waiting...")
            })
        else:
            self.send_json({"status": "error", "error": "Job not found"})

    def handle_task_save(self, data: dict):
        """POST /api/task/save - Save TASK.md."""
        project = data.get("project", "")
        content = data.get("content", "")
        images = data.get("images", [])

        if not project:
            self.send_json({"success": False, "error": "No project specified"}, 400)
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project not found: {project}"}, 404)
            return

        claude_dir = project_dir / ".claude"
        claude_dir.mkdir(exist_ok=True)

        task_file = claude_dir / "TASK.md"

        try:
            saved_images = []
            if images:
                images_dir = claude_dir / "task_images"
                images_dir.mkdir(exist_ok=True)
                for i, img in enumerate(images):
                    if img.get("data"):
                        img_data = img["data"]
                        if "," in img_data:
                            img_data = img_data.split(",", 1)[1]
                        img_type = img.get("type", "image/png")
                        ext = "jpg" if ("jpeg" in img_type or "jpg" in img_type) else "png"
                        img_path = images_dir / f"task_image_{i}.{ext}"
                        with open(img_path, "wb") as f:
                            f.write(base64.b64decode(img_data))
                        saved_images.append(str(img_path))

            if saved_images:
                content += "\n\n## Image Paths\n\n"
                for img_path in saved_images:
                    content += f"- {img_path}\n"

            with open(task_file, "w") as f:
                f.write(content)

            self.send_json({
                "success": True,
                "path": str(task_file),
                "images": saved_images
            })
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_task_load(self, data: dict):
        """POST /api/task/load - Load TASK.md and OUTPUT.md."""
        project = data.get("project", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"}, 400)
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": True, "task": "", "output": ""})
            return

        task_file = project_dir / ".claude" / "TASK.md"
        output_file = project_dir / ".claude" / "OUTPUT.md"

        result = {"success": True}
        result["task"] = task_file.read_text() if task_file.exists() else ""
        result["output"] = output_file.read_text() if output_file.exists() else ""

        self.send_json(result)

    def handle_file_read(self, data: dict):
        """POST /api/file/read - Read a file from project."""
        project = data.get("project", "")
        file_path = data.get("path", "")

        if not project or not file_path:
            self.send_json({"success": False, "error": "Missing project or path"}, 400)
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project not found: {project}"}, 404)
            return

        # Normalize path
        if file_path.startswith('./'):
            file_path = file_path[2:]
        elif file_path.startswith('/'):
            file_path = file_path[1:]

        full_path = project_dir / file_path

        # Security check
        try:
            full_path = full_path.resolve()
            project_dir_resolved = project_dir.resolve()
            if not str(full_path).startswith(str(project_dir_resolved)):
                self.send_json({"success": False, "error": "Access denied: path outside project"}, 403)
                return
        except Exception as e:
            self.send_json({"success": False, "error": f"Invalid path: {e}"}, 400)
            return

        if not full_path.exists():
            self.send_json({"success": False, "error": f"File not found: {file_path}"}, 404)
            return

        if not full_path.is_file():
            self.send_json({"success": False, "error": "Not a file"}, 400)
            return

        try:
            with open(full_path, 'r') as f:
                content = f.read()
            self.send_json({
                "success": True,
                "content": content,
                "path": str(full_path)
            })
        except Exception as e:
            self.send_json({"success": False, "error": f"Error reading file: {e}"}, 500)

    def handle_file_list(self, data: dict):
        """POST /api/file/list - List files in a project directory."""
        project = data.get("project", "")
        dir_path = data.get("path", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"}, 400)
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project not found: {project}"}, 404)
            return

        # Construct full path
        if dir_path:
            if dir_path.startswith('./'):
                dir_path = dir_path[2:]
            elif dir_path.startswith('/'):
                dir_path = dir_path[1:]
            full_path = project_dir / dir_path
        else:
            full_path = project_dir

        # Security check - ensure path is within project
        try:
            full_path = full_path.resolve()
            project_dir_resolved = project_dir.resolve()
            if not str(full_path).startswith(str(project_dir_resolved)):
                self.send_json({"success": False, "error": "Access denied"}, 403)
                return
        except Exception:
            self.send_json({"success": False, "error": "Invalid path"}, 400)
            return

        if not full_path.exists() or not full_path.is_dir():
            self.send_json({"success": False, "error": "Directory not found"}, 404)
            return

        # Build file listing
        items = []
        try:
            # Skip these directories
            skip_dirs = {'node_modules', '__pycache__', 'venv', '.venv', 'dist', 'build', '.git'}

            for item in sorted(full_path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
                # Skip large/generated directories
                if item.is_dir() and item.name in skip_dirs:
                    continue

                rel_path = str(item.relative_to(project_dir))
                items.append({
                    "name": item.name,
                    "path": rel_path,
                    "is_dir": item.is_dir(),
                    "size": item.stat().st_size if item.is_file() else 0
                })

            self.send_json({"success": True, "items": items, "path": dir_path or "/"})
        except PermissionError:
            self.send_json({"success": False, "error": "Permission denied"}, 403)
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_file_write(self, data: dict):
        """POST /api/file/write - Write content to a file."""
        project = data.get("project", "")
        file_path = data.get("path", "")
        content = data.get("content", "")

        if not project or not file_path:
            self.send_json({"success": False, "error": "Missing project or path"}, 400)
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project not found: {project}"}, 404)
            return

        # Normalize path
        if file_path.startswith('./'):
            file_path = file_path[2:]
        elif file_path.startswith('/'):
            file_path = file_path[1:]

        full_path = project_dir / file_path

        # Security check
        try:
            full_path = full_path.resolve()
            project_dir_resolved = project_dir.resolve()
            if not str(full_path).startswith(str(project_dir_resolved)):
                self.send_json({"success": False, "error": "Access denied: path outside project"}, 403)
                return
        except Exception as e:
            self.send_json({"success": False, "error": f"Invalid path: {e}"}, 400)
            return

        # Write file using atomic write for safety
        try:
            # Ensure parent directory exists
            full_path.parent.mkdir(parents=True, exist_ok=True)

            # Atomic write: write to temp file then rename
            temp_path = full_path.with_suffix(full_path.suffix + '.tmp')
            with open(temp_path, 'w') as f:
                f.write(content)
            temp_path.rename(full_path)

            self.send_json({"success": True, "path": str(full_path), "size": len(content)})
        except Exception as e:
            self.send_json({"success": False, "error": f"Write failed: {e}"}, 500)

    def handle_file_explain(self, data: dict):
        """POST /api/file/explain - Get AI explanation of a file's contents.

        This creates a job in the queue and returns immediately with the job_id.
        The client should poll /api/chat/status to get the result.
        """
        project = data.get("project", "")
        file_path = data.get("path", "")
        content = data.get("content", "")

        if not content:
            self.send_json({"success": False, "error": "No content to explain"}, 400)
            return

        # Determine file type from extension
        ext = Path(file_path).suffix.lower() if file_path else ""
        file_type = self._get_file_type_description(ext)

        # Build the prompt for explanation
        prompt = f"""Please explain this {file_type} file in simple, easy-to-understand terms for someone who may not have technical skills.

**File:** {file_path or "Unknown"}

**Content:**
```
{content[:15000]}
```

Please provide:
1. **What This File Does** - A simple one-paragraph summary
2. **Key Components** - Break down the main parts/sections in plain language
3. **How It Works** - Explain the flow or logic simply
4. **Important Things to Know** - Any key details a non-technical person should understand

Use simple analogies where helpful. Avoid jargon or explain technical terms when you must use them.

IMPORTANT: Respond ONLY with the explanation. Do not use any tools, do not read any files, do not make any changes. Just explain the content provided above."""

        # Create a job just like handle_chat_start does
        # Use a special "explain-{project}" pseudo-project to avoid blocking regular jobs
        # This allows explanations to run in parallel with regular chat
        job_id = f"explain-{uuid.uuid4().hex[:8]}"
        job = {
            "id": job_id,
            "message": prompt,
            "model": "sonnet",  # Use sonnet for faster explanations
            "project": f"explain-{project}",  # Separate queue slot from main project
            "status": "pending",  # Must be "pending" for watcher to pick it up
            "images": [],
            "files": [],
            "created": time.time(),
            "job_type": "explain"  # Mark as explain job - uses fresh session
        }

        job_file = QUEUE_DIR / f"{job_id}.json"
        atomic_write_json(job_file, job)

        self.send_json({
            "success": True,
            "job_id": job_id,
            "message": "Explanation job queued"
        })

    def _get_file_type_description(self, ext: str) -> str:
        """Get a human-readable file type description."""
        type_map = {
            '.py': 'Python code',
            '.js': 'JavaScript code',
            '.ts': 'TypeScript code',
            '.tsx': 'TypeScript React',
            '.jsx': 'JavaScript React',
            '.html': 'HTML webpage',
            '.css': 'CSS stylesheet',
            '.json': 'JSON configuration',
            '.yaml': 'YAML configuration',
            '.yml': 'YAML configuration',
            '.md': 'Markdown document',
            '.txt': 'text',
            '.sh': 'shell script',
            '.bat': 'batch script',
            '.sql': 'SQL database',
            '.xml': 'XML',
            '.env': 'environment configuration',
            '.gitignore': 'Git ignore rules',
            '.dockerfile': 'Docker configuration',
            '': 'code/text'
        }
        return type_map.get(ext, 'code/text')

    def handle_file_qa(self, data: dict):
        """POST /api/file/qa - Ask a question about the current file.

        Creates a job in the queue for answering file-specific questions.
        Supports conversation history for follow-up questions.
        """
        project = data.get("project", "")
        file_path = data.get("path", "")
        content = data.get("content", "")
        question = data.get("question", "")
        history = data.get("history", [])

        if not content:
            self.send_json({"success": False, "error": "No file content provided"}, 400)
            return

        if not question:
            self.send_json({"success": False, "error": "No question provided"}, 400)
            return

        # Build conversation context
        conversation_context = ""
        if history:
            conversation_context = "\n\n**Previous conversation:**\n"
            for msg in history[-10:]:  # Limit to last 10 messages
                role = "User" if msg.get("role") == "user" else "Assistant"
                conversation_context += f"{role}: {msg.get('content', '')}\n"

        # Determine file type
        ext = Path(file_path).suffix.lower() if file_path else ""
        file_type = self._get_file_type_description(ext)

        # Check if user is asking for modifications
        modify_keywords = [
            'update', 'change', 'modify', 'edit', 'fix', 'add', 'remove', 'delete',
            'refactor', 'rename', 'replace', 'insert', 'rewrite', 'make', 'set',
            'move', 'swap', 'increase', 'decrease', 'adjust', 'tweak', 'improve',
            'convert', 'transform', 'wrap', 'unwrap', 'comment out', 'uncomment',
            'indent', 'format', 'clean up', 'sort', 'reorder', 'merge', 'split',
            'extract', 'inline', 'create', 'implement', 'write', 'put', 'append',
            'prepend', 'prefix', 'suffix', 'enable', 'disable', 'toggle', 'switch',
            'bigger', 'smaller', 'larger', 'shorter', 'longer', 'wider', 'narrower',
        ]
        q_lower = question.lower()
        is_modify_request = any(kw in q_lower for kw in modify_keywords)

        # Build the prompt - always give tool access so Claude can edit when needed
        prompt = f"""You are an AI assistant helping a user with a {file_type} file.

**File:** {file_path or "Unknown"}

**Current File Content:**
```
{content[:15000]}
```
{conversation_context}
**User Message:** {question}

Instructions:
- If the user is asking a question, answer it clearly and concisely
- If the user is asking you to make changes, use the Edit tool to modify the file at: {file_path}
- After making changes, briefly explain what you changed
- Reference specific parts of the file when relevant
- Keep responses focused and concise"""

        # Route through main project so Claude has file access
        # Use Haiku for simple questions (much cheaper), Sonnet for modifications
        model = "sonnet" if is_modify_request else "haiku"
        job_id = f"qa-{uuid.uuid4().hex[:8]}"
        job = {
            "id": job_id,
            "message": prompt,
            "model": model,
            "project": project,
            "status": "pending",
            "images": [],
            "files": [],
            "created": time.time(),
            "job_type": "qa",
            "is_modify": is_modify_request
        }

        job_file = QUEUE_DIR / f"{job_id}.json"
        atomic_write_json(job_file, job)

        self.send_json({
            "success": True,
            "job_id": job_id,
            "message": "Q&A job queued",
            "is_modify": is_modify_request
        })

    def handle_file_modify(self, data: dict):
        """POST /api/file/modify - Request AI-powered file modification.

        Creates a job that returns the modified file content with explanation.
        The client handles the diff display and accept/revert actions.
        """
        project = data.get("project", "")
        file_path = data.get("path", "")
        content = data.get("content", "")
        instruction = data.get("instruction", "")

        if not content:
            self.send_json({"success": False, "error": "No file content provided"}, 400)
            return

        if not instruction:
            self.send_json({"success": False, "error": "No modification instruction provided"}, 400)
            return

        # Determine file type
        ext = Path(file_path).suffix.lower() if file_path else ""
        file_type = self._get_file_type_description(ext)

        # Build the prompt
        prompt = f"""Modify this {file_type} file according to the instruction below.

**File:** {file_path or "Unknown"}
**Instruction:** {instruction}

**Current Content:**
```
{content}
```

Respond with EXACTLY this format:
1. First line: A brief explanation of changes (1-2 sentences starting with "EXPLANATION: ")
2. Then the complete modified file content between ```modified and ```

Example format:
EXPLANATION: Added input validation to prevent empty strings.

```modified
<complete modified file content here>
```

IMPORTANT RULES:
- Include the ENTIRE file content in the modified block, not just changed parts
- Make only the changes requested - don't refactor or improve unrelated code
- Preserve existing formatting and style
- Do NOT use any tools - just output the modified content"""

        # Create job
        job_id = f"modify-{uuid.uuid4().hex[:8]}"
        job = {
            "id": job_id,
            "message": prompt,
            "model": "sonnet",
            "project": f"modify-{project}",  # Separate queue slot
            "status": "pending",
            "images": [],
            "files": [],
            "created": time.time(),
            "job_type": "modify"
        }

        job_file = QUEUE_DIR / f"{job_id}.json"
        atomic_write_json(job_file, job)

        self.send_json({
            "success": True,
            "job_id": job_id,
            "message": "Modification job queued"
        })

    def handle_axion_messages(self, data: dict):
        """POST /api/axion/messages - Get messages from Axion."""
        last_id = data.get("last_id", "")
        if AXION_OUTBOX.exists():
            outbox = safe_json_load(AXION_OUTBOX, {"messages": []})
            messages = outbox.get("messages", [])
            if last_id:
                new_messages = []
                found = False
                for msg in messages:
                    if found:
                        new_messages.append(msg)
                    if msg.get("id") == last_id:
                        found = True
                messages = new_messages if found else messages
            self.send_json({"messages": messages})
        else:
            self.send_json({"messages": []})

    def handle_axion_send(self, data: dict):
        """POST /api/axion/send - Axion sends a message."""
        text = data.get("text", "")
        msg_id = f"axion-{uuid.uuid4().hex[:8]}"
        msg = {"id": msg_id, "text": text, "timestamp": time.time()}

        outbox = safe_json_load(AXION_OUTBOX, {"messages": []})
        outbox["messages"].append(msg)
        outbox["messages"] = outbox["messages"][-50:]

        atomic_write_json(AXION_OUTBOX, outbox)
        self.send_json({"status": "sent", "id": msg_id})

    def handle_git_status(self, data: dict):
        """POST /api/git/status - Get git status for a project."""
        project = data.get("project", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"}, 400)
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project not found: {project}"}, 404)
            return

        try:
            result = subprocess.run(
                ["git", "status"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=30
            )
            output = result.stdout + result.stderr
            self.send_json({"success": True, "output": output})
        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Command timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_commit(self, data: dict):
        """POST /api/git/commit - Run commit and push for a project."""
        project = data.get("project", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"}, 400)
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project not found: {project}"}, 404)
            return

        # Run git add, commit and push directly
        try:
            output_parts = []

            # Git add
            result = subprocess.run(
                ["git", "add", "-A"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=120
            )
            output_parts.append(f"$ git add -A\n{result.stdout}{result.stderr}")

            # Git status to show what will be committed
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=60
            )
            status_output = result.stdout.strip()
            output_parts.append(f"\n$ git status --short\n{result.stdout}")

            # Generate meaningful commit message from staged changes
            commit_message = self._generate_commit_message(str(project_dir), status_output)

            # Git commit
            result = subprocess.run(
                ["git", "commit", "-m", commit_message],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=120
            )
            output_parts.append(f"\n$ git commit -m \"{commit_message}\"\n{result.stdout}{result.stderr}")

            if result.returncode != 0 and "nothing to commit" not in result.stdout + result.stderr:
                self.send_json({
                    "success": False,
                    "error": "Commit failed",
                    "output": "\n".join(output_parts)
                })
                return

            # Git push (expects token-based auth to be configured)
            result = subprocess.run(
                ["git", "push"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=180
            )
            output_parts.append(f"\n$ git push\n{result.stdout}{result.stderr}")

            if result.returncode != 0:
                self.send_json({
                    "success": False,
                    "error": "Push failed - ensure token auth is configured",
                    "output": "\n".join(output_parts)
                })
                return

            self.send_json({"success": True, "output": "\n".join(output_parts)})

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Command timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_pull(self, data: dict):
        """POST /api/git/pull - Pull changes from remote repository or merge from branch."""
        project = data.get("project", "")
        source_branch = data.get("source_branch", "")  # Optional: branch to pull/merge from

        if not project:
            self.send_json({"success": False, "error": "Project name required"})
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project '{project}' not found"})
            return

        try:
            # Check if we're in a git repository
            check_result = subprocess.run(
                ["git", "rev-parse", "--git-dir"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )
            if check_result.returncode != 0:
                self.send_json({"success": False, "error": "Not a git repository"})
                return

            # Check for uncommitted changes
            status_result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )

            has_changes = bool(status_result.stdout.strip())

            # Get current branch
            branch_result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )
            current_branch = branch_result.stdout.strip() if branch_result.returncode == 0 else "unknown"

            # Fetch first to get latest remote info
            fetch_result = subprocess.run(
                ["git", "fetch", "--all"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=30
            )

            if fetch_result.returncode != 0:
                self.send_json({
                    "success": False,
                    "error": f"Failed to fetch from remote: {fetch_result.stderr}"
                })
                return

            # Determine the source branch to pull from
            if source_branch:
                # User specified a source branch
                target_ref = source_branch
                is_remote = source_branch.startswith("origin/") or source_branch.startswith("remotes/")

                if is_remote:
                    # For remote branches, use git pull origin <branch>
                    # Extract branch name without origin/ prefix
                    branch_name = source_branch.replace("remotes/", "").replace("origin/", "")
                    pull_cmd = ["git", "pull", "origin", branch_name]
                    target_ref = f"origin/{branch_name}"
                else:
                    # For local branches, merge them
                    pull_cmd = ["git", "merge", source_branch]
                    target_ref = source_branch
            else:
                # Default: pull from tracking branch
                remote_result = subprocess.run(
                    ["git", "rev-parse", "--abbrev-ref", "@{u}"],
                    cwd=str(project_dir),
                    capture_output=True,
                    text=True,
                    timeout=10
                )

                if remote_result.returncode != 0:
                    self.send_json({
                        "success": False,
                        "error": f"No remote tracking branch configured for '{current_branch}'"
                    })
                    return

                target_ref = remote_result.stdout.strip()
                pull_cmd = ["git", "pull"]

            # Check if there are any incoming changes
            behind_result = subprocess.run(
                ["git", "rev-list", "--count", f"HEAD..{target_ref}"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )

            commits_behind = int(behind_result.stdout.strip()) if behind_result.returncode == 0 else 0

            if commits_behind == 0:
                self.send_json({
                    "success": True,
                    "output": f"Already up to date. No new commits from '{target_ref}'",
                    "info": {
                        "branch": current_branch,
                        "source": target_ref,
                        "has_changes": has_changes,
                        "commits_behind": 0
                    }
                })
                return

            # Perform the pull/merge
            pull_result = subprocess.run(
                pull_cmd,
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=60
            )

            output_parts = []
            if pull_result.stdout:
                output_parts.append(pull_result.stdout)
            if pull_result.stderr:
                output_parts.append(pull_result.stderr)

            if pull_result.returncode == 0:
                # Get summary of what was updated
                log_result = subprocess.run(
                    ["git", "log", "--oneline", f"HEAD~{commits_behind}..HEAD"],
                    cwd=str(project_dir),
                    capture_output=True,
                    text=True,
                    timeout=10
                )

                if log_result.returncode == 0 and log_result.stdout:
                    output_parts.append(f"\nNew commits:\n{log_result.stdout}")

                self.send_json({
                    "success": True,
                    "output": "\n".join(output_parts),
                    "info": {
                        "branch": current_branch,
                        "source": target_ref,
                        "commits_pulled": commits_behind
                    }
                })
            else:
                self.send_json({
                    "success": False,
                    "error": "Pull/merge failed - check for merge conflicts",
                    "output": "\n".join(output_parts)
                })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git pull timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_log(self, data: dict):
        """POST /api/git/log - Get formatted commit history."""
        project = data.get("project", "")
        limit = data.get("limit", 50)  # Default to 50 commits
        skip = data.get("skip", 0)     # For pagination

        if not project:
            self.send_json({"success": False, "error": "Project name required"})
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project '{project}' not found"})
            return

        try:
            # Check if we're in a git repository
            check_result = subprocess.run(
                ["git", "rev-parse", "--git-dir"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )
            if check_result.returncode != 0:
                self.send_json({"success": False, "error": "Not a git repository"})
                return

            # Get formatted commit log
            log_format = "--pretty=format:%H|%an|%ae|%ad|%s"
            log_result = subprocess.run(
                ["git", "log", log_format, "--date=iso", f"--max-count={limit}", f"--skip={skip}"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=30
            )

            if log_result.returncode != 0:
                # No commits yet is a valid state (empty repo), not an error
                if "does not have any commits yet" in log_result.stderr:
                    self.send_json({
                        "success": True,
                        "commits": [],
                        "pagination": {"total": 0, "limit": limit, "skip": 0, "has_more": False},
                        "branch": "master",
                        "empty_repo": True,
                        "message": "No commits yet"
                    })
                    return
                self.send_json({
                    "success": False,
                    "error": f"Failed to get git log: {log_result.stderr}"
                })
                return

            # Parse commits
            commits = []
            for line in log_result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('|', 4)
                if len(parts) >= 5:
                    commits.append({
                        "hash": parts[0],
                        "hash_short": parts[0][:8],
                        "author": parts[1],
                        "email": parts[2],
                        "date": parts[3],
                        "message": parts[4]
                    })

            # Get total commit count for pagination
            count_result = subprocess.run(
                ["git", "rev-list", "--count", "HEAD"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )

            total_commits = int(count_result.stdout.strip()) if count_result.returncode == 0 else len(commits)

            # Get current branch info
            branch_result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )
            current_branch = branch_result.stdout.strip() if branch_result.returncode == 0 else "unknown"

            self.send_json({
                "success": True,
                "commits": commits,
                "pagination": {
                    "total": total_commits,
                    "limit": limit,
                    "skip": skip,
                    "has_more": skip + len(commits) < total_commits
                },
                "branch": current_branch
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git log request timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_commit_files(self, data: dict):
        """POST /api/git/commit-files - Get files changed in a specific commit."""
        project = data.get("project", "")
        commit_hash = data.get("hash", "")

        if not project:
            self.send_json({"success": False, "error": "Project name required"})
            return

        if not commit_hash or not commit_hash.isalnum() or len(commit_hash) > 40:
            self.send_json({"success": False, "error": "Valid commit hash required"})
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project '{project}' not found"})
            return

        try:
            result = subprocess.run(
                ["git", "diff-tree", "--no-commit-id", "-r", "--name-status", commit_hash],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=15
            )

            output = result.stdout.strip()

            # If empty, might be a root commit - try with --root flag
            if not output and result.returncode == 0:
                result = subprocess.run(
                    ["git", "diff-tree", "--root", "--no-commit-id", "-r", "--name-status", commit_hash],
                    cwd=str(project_dir),
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                output = result.stdout.strip()

            if result.returncode != 0:
                self.send_json({"success": False, "error": f"Failed to get commit files: {result.stderr}"})
                return

            status_map = {"A": "added", "M": "modified", "D": "deleted", "R": "renamed", "C": "copied"}
            files = []
            for line in output.split('\n'):
                if not line.strip():
                    continue
                parts = line.split('\t', 1)
                if len(parts) >= 2:
                    raw_status = parts[0].strip()
                    status_key = raw_status[0] if raw_status else "M"
                    status_label = status_map.get(status_key, "modified")
                    file_path = parts[1].strip()
                    if '\t' in file_path:
                        old_path, new_path = file_path.split('\t', 1)
                        file_path = old_path + " \u2192 " + new_path
                    files.append({"status": status_label, "file": file_path})

            self.send_json({
                "success": True,
                "files": files,
                "hash": commit_hash,
                "count": len(files)
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Request timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_remote_info(self, data: dict):
        """POST /api/git/remote - Get remote repository information."""
        project = data.get("project", "")
        if not project:
            self.send_json({"success": False, "error": "Project name required"})
            return

        project_dir = self._find_project_dir(project)
        if not project_dir:
            self.send_json({"success": False, "error": f"Project '{project}' not found"})
            return

        try:
            # Get current branch
            branch_result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )
            current_branch = branch_result.stdout.strip() if branch_result.returncode == 0 else "unknown"

            # Get remote URL
            remote_result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )
            remote_url = remote_result.stdout.strip() if remote_result.returncode == 0 else "No remote"

            # Check status vs remote
            status_result = subprocess.run(
                ["git", "status", "--porcelain", "-b"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
                timeout=10
            )

            # Parse status for ahead/behind info
            ahead_behind = {"ahead": 0, "behind": 0}
            if status_result.returncode == 0:
                first_line = status_result.stdout.split('\n')[0]
                if '[ahead' in first_line:
                    import re
                    match = re.search(r'\[ahead (\d+)', first_line)
                    if match:
                        ahead_behind["ahead"] = int(match.group(1))
                if 'behind' in first_line:
                    import re
                    match = re.search(r'behind (\d+)', first_line)
                    if match:
                        ahead_behind["behind"] = int(match.group(1))

            self.send_json({
                "success": True,
                "branch": current_branch,
                "remote_url": remote_url,
                "ahead": ahead_behind["ahead"],
                "behind": ahead_behind["behind"]
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git remote info request timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_branches(self, data: dict):
        """POST /api/git/branches - List all branches (local and remote)."""
        project = data.get("project", "")
        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            # Get current branch
            result = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            current_branch = result.stdout.strip()

            # Get local branches
            result = subprocess.run(
                ["git", "branch", "--format=%(refname:short)|%(upstream:short)|%(upstream:track)"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            local_branches = []
            for line in result.stdout.strip().split("\n"):
                if line:
                    parts = line.split("|")
                    name = parts[0]
                    upstream = parts[1] if len(parts) > 1 else ""
                    track = parts[2] if len(parts) > 2 else ""
                    local_branches.append({
                        "name": name,
                        "current": name == current_branch,
                        "upstream": upstream,
                        "track": track
                    })

            # Get remote branches
            result = subprocess.run(
                ["git", "branch", "-r", "--format=%(refname:short)"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            remote_branches = []
            for line in result.stdout.strip().split("\n"):
                if line and not line.endswith("/HEAD"):
                    remote_branches.append({"name": line})

            self.send_json({
                "success": True,
                "current": current_branch,
                "local": local_branches,
                "remote": remote_branches
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git branches request timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_checkout(self, data: dict):
        """POST /api/git/checkout - Switch to a branch."""
        project = data.get("project", "")
        branch = data.get("branch", "")
        create = data.get("create", False)

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return
        if not branch:
            self.send_json({"success": False, "error": "No branch specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            # Check for uncommitted changes
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.stdout.strip():
                self.send_json({
                    "success": False,
                    "error": "You have uncommitted changes. Please commit or stash them first.",
                    "changes": result.stdout.strip()
                })
                return

            # Build checkout command
            if create:
                cmd = ["git", "checkout", "-b", branch]
            else:
                cmd = ["git", "checkout", branch]

            result = subprocess.run(
                cmd,
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                self.send_json({
                    "success": False,
                    "error": result.stderr.strip() or "Checkout failed"
                })
                return

            self.send_json({
                "success": True,
                "message": f"Switched to branch '{branch}'",
                "output": result.stdout.strip() or result.stderr.strip()
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git checkout timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_create_branch(self, data: dict):
        """POST /api/git/create-branch - Create a new branch."""
        project = data.get("project", "")
        branch = data.get("branch", "")
        checkout = data.get("checkout", True)
        from_branch = data.get("from", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return
        if not branch:
            self.send_json({"success": False, "error": "No branch name specified"})
            return

        # Validate branch name
        if " " in branch or ".." in branch:
            self.send_json({"success": False, "error": "Invalid branch name"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            # Build command
            if checkout:
                if from_branch:
                    cmd = ["git", "checkout", "-b", branch, from_branch]
                else:
                    cmd = ["git", "checkout", "-b", branch]
            else:
                if from_branch:
                    cmd = ["git", "branch", branch, from_branch]
                else:
                    cmd = ["git", "branch", branch]

            result = subprocess.run(
                cmd,
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                self.send_json({
                    "success": False,
                    "error": result.stderr.strip() or "Failed to create branch"
                })
                return

            self.send_json({
                "success": True,
                "message": f"Created branch '{branch}'" + (" and switched to it" if checkout else ""),
                "branch": branch
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git create branch timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_delete_branch(self, data: dict):
        """POST /api/git/delete-branch - Delete a branch."""
        project = data.get("project", "")
        branch = data.get("branch", "")
        force = data.get("force", False)
        remote = data.get("remote", False)

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return
        if not branch:
            self.send_json({"success": False, "error": "No branch specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            # Check if trying to delete current branch
            result = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            current = result.stdout.strip()
            if branch == current:
                self.send_json({
                    "success": False,
                    "error": "Cannot delete the currently checked out branch"
                })
                return

            # Delete local branch
            flag = "-D" if force else "-d"
            result = subprocess.run(
                ["git", "branch", flag, branch],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                self.send_json({
                    "success": False,
                    "error": result.stderr.strip() or "Failed to delete branch"
                })
                return

            message = f"Deleted local branch '{branch}'"

            # Delete remote branch if requested
            if remote:
                result = subprocess.run(
                    ["git", "push", "origin", "--delete", branch],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                if result.returncode == 0:
                    message += f" and remote branch 'origin/{branch}'"
                else:
                    message += f". Remote deletion failed: {result.stderr.strip()}"

            self.send_json({
                "success": True,
                "message": message
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git delete branch timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_push_branch(self, data: dict):
        """POST /api/git/push-branch - Push current branch to remote."""
        project = data.get("project", "")
        set_upstream = data.get("set_upstream", True)
        branch = data.get("branch", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            # Get current branch if not specified
            if not branch:
                result = subprocess.run(
                    ["git", "branch", "--show-current"],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                branch = result.stdout.strip()

            if not branch:
                self.send_json({"success": False, "error": "Could not determine branch"})
                return

            # Build push command
            if set_upstream:
                cmd = ["git", "push", "-u", "origin", branch]
            else:
                cmd = ["git", "push", "origin", branch]

            result = subprocess.run(
                cmd,
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                self.send_json({
                    "success": False,
                    "error": result.stderr.strip() or "Push failed"
                })
                return

            self.send_json({
                "success": True,
                "message": f"Pushed branch '{branch}' to origin",
                "output": result.stderr.strip() or result.stdout.strip()
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git push timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_fetch(self, data: dict):
        """POST /api/git/fetch - Fetch from remote."""
        project = data.get("project", "")
        prune = data.get("prune", True)

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            cmd = ["git", "fetch", "--all"]
            if prune:
                cmd.append("--prune")

            result = subprocess.run(
                cmd,
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=60
            )

            self.send_json({
                "success": True,
                "message": "Fetched from remote",
                "output": result.stderr.strip() or result.stdout.strip() or "Up to date"
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git fetch timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_merge(self, data: dict):
        """POST /api/git/merge - Merge another branch into current branch."""
        project = data.get("project", "")
        source_branch = data.get("source_branch", "")
        no_ff = data.get("no_ff", False)  # --no-ff flag

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return
        if not source_branch:
            self.send_json({"success": False, "error": "No source branch specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            # Get current branch
            result = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            current_branch = result.stdout.strip()

            if source_branch == current_branch:
                self.send_json({"success": False, "error": "Cannot merge a branch into itself"})
                return

            # Check for uncommitted changes
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.stdout.strip():
                self.send_json({
                    "success": False,
                    "error": "You have uncommitted changes. Please commit or stash them first."
                })
                return

            # Build merge command
            cmd = ["git", "merge"]
            if no_ff:
                cmd.append("--no-ff")
            cmd.append(source_branch)

            result = subprocess.run(
                cmd,
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                # Check for merge conflicts
                if "CONFLICT" in result.stdout or "CONFLICT" in result.stderr:
                    self.send_json({
                        "success": False,
                        "error": "Merge conflict detected. Please resolve conflicts manually.",
                        "conflicts": True,
                        "output": result.stdout + result.stderr
                    })
                    return
                self.send_json({
                    "success": False,
                    "error": result.stderr.strip() or result.stdout.strip() or "Merge failed"
                })
                return

            self.send_json({
                "success": True,
                "message": f"Merged '{source_branch}' into '{current_branch}'",
                "output": result.stdout.strip() or result.stderr.strip()
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git merge timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_stash(self, data: dict):
        """POST /api/git/stash - Stash or pop stashed changes."""
        project = data.get("project", "")
        action = data.get("action", "push")  # "push" to stash, "pop" to restore

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            if action == "push":
                # Stash changes with message
                result = subprocess.run(
                    ["git", "stash", "push", "-m", "Stashed from Relay"],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            elif action == "pop":
                # Pop the most recent stash
                result = subprocess.run(
                    ["git", "stash", "pop"],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            elif action == "list":
                # List all stashes
                result = subprocess.run(
                    ["git", "stash", "list"],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
            else:
                self.send_json({"success": False, "error": f"Unknown stash action: {action}"})
                return

            output = result.stdout + result.stderr
            if result.returncode != 0:
                if "No stash entries found" in output or "No local changes to save" in output:
                    self.send_json({"success": False, "error": output.strip()})
                else:
                    self.send_json({"success": False, "error": "Stash operation failed", "output": output})
                return

            self.send_json({"success": True, "output": output.strip() or f"Stash {action} completed"})

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git stash timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_conflicts(self, data: dict):
        """POST /api/git/conflicts - Detect and parse merge conflicts in a project."""
        project = data.get("project", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            # Check if merge is in progress
            merge_head = project_path / ".git" / "MERGE_HEAD"
            is_merging = merge_head.exists()

            # Get list of conflicted files using git ls-files -u
            result = subprocess.run(
                ["git", "ls-files", "-u"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )

            conflicted_files = set()
            for line in result.stdout.strip().split('\n'):
                if line:
                    parts = line.split('\t')
                    if len(parts) >= 2:
                        conflicted_files.add(parts[1])

            if not conflicted_files:
                self.send_json({
                    "success": True,
                    "has_conflicts": False,
                    "conflicts": [],
                    "is_merging": is_merging
                })
                return

            # Parse each conflicted file
            conflicts = []
            for filepath in conflicted_files:
                full_path = project_path / filepath
                if not full_path.exists():
                    continue

                try:
                    content = full_path.read_text()
                    parsed_conflicts = self._parse_conflict_markers(content)

                    # Get the three versions from git index
                    versions = {}
                    for stage, name in [(1, 'base'), (2, 'ours'), (3, 'theirs')]:
                        stage_result = subprocess.run(
                            ["git", "show", f":{stage}:{filepath}"],
                            cwd=project_path,
                            capture_output=True,
                            text=True,
                            timeout=10
                        )
                        if stage_result.returncode == 0:
                            versions[name] = stage_result.stdout

                    conflicts.append({
                        "file": filepath,
                        "content": content,
                        "parsed": parsed_conflicts,
                        "versions": versions,
                        "conflict_count": len(parsed_conflicts)
                    })
                except Exception as e:
                    conflicts.append({
                        "file": filepath,
                        "error": str(e)
                    })

            self.send_json({
                "success": True,
                "has_conflicts": True,
                "conflicts": conflicts,
                "is_merging": is_merging,
                "conflict_count": len(conflicts)
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git conflict check timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def _parse_conflict_markers(self, content: str) -> list:
        """Parse conflict markers from file content. Supports both merge and diff3 styles."""
        conflicts = []
        lines = content.split('\n')

        i = 0
        while i < len(lines):
            line = lines[i]

            if line.startswith('<<<<<<<'):
                start_line = i
                ours_ref = line[7:].strip()
                ours_lines = []
                base_lines = []
                theirs_lines = []
                theirs_ref = ""
                current_section = 'ours'
                i += 1

                while i < len(lines):
                    line = lines[i]
                    if line.startswith('|||||||'):
                        current_section = 'base'
                    elif line.startswith('======='):
                        current_section = 'theirs'
                    elif line.startswith('>>>>>>>'):
                        theirs_ref = line[7:].strip()
                        conflicts.append({
                            'ours': '\n'.join(ours_lines),
                            'theirs': '\n'.join(theirs_lines),
                            'base': '\n'.join(base_lines) if base_lines else None,
                            'ours_ref': ours_ref,
                            'theirs_ref': theirs_ref,
                            'start_line': start_line,
                            'end_line': i
                        })
                        break
                    else:
                        if current_section == 'ours':
                            ours_lines.append(line)
                        elif current_section == 'base':
                            base_lines.append(line)
                        else:
                            theirs_lines.append(line)
                    i += 1
            i += 1

        return conflicts

    def handle_git_resolve_conflict(self, data: dict):
        """POST /api/git/resolve-conflict - Resolve a conflict in a single file."""
        project = data.get("project", "")
        filepath = data.get("file", "")
        resolution = data.get("resolution", "")  # 'ours', 'theirs', or 'custom'
        custom_content = data.get("content", "")  # For custom resolution

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return
        if not filepath:
            self.send_json({"success": False, "error": "No file specified"})
            return
        if not resolution:
            self.send_json({"success": False, "error": "No resolution strategy specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        full_path = project_path / filepath
        if not full_path.exists():
            self.send_json({"success": False, "error": f"File not found: {filepath}"})
            return

        try:
            if resolution == 'ours':
                # Use our version
                result = subprocess.run(
                    ["git", "checkout", "--ours", filepath],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode != 0:
                    self.send_json({"success": False, "error": f"Failed to checkout ours: {result.stderr}"})
                    return
            elif resolution == 'theirs':
                # Use their version
                result = subprocess.run(
                    ["git", "checkout", "--theirs", filepath],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode != 0:
                    self.send_json({"success": False, "error": f"Failed to checkout theirs: {result.stderr}"})
                    return
            elif resolution == 'custom':
                # Write custom resolved content
                if not custom_content:
                    self.send_json({"success": False, "error": "Custom content required for custom resolution"})
                    return
                full_path.write_text(custom_content)
            else:
                self.send_json({"success": False, "error": f"Unknown resolution: {resolution}"})
                return

            # Stage the resolved file
            result = subprocess.run(
                ["git", "add", filepath],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode != 0:
                self.send_json({"success": False, "error": f"Failed to stage file: {result.stderr}"})
                return

            # Check if there are still conflicts
            conflicts_result = subprocess.run(
                ["git", "ls-files", "-u"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )

            remaining_conflicts = len([l for l in conflicts_result.stdout.strip().split('\n') if l])

            self.send_json({
                "success": True,
                "message": f"Resolved conflict in {filepath} using {resolution}",
                "remaining_conflicts": remaining_conflicts // 3  # Divide by 3 since each file appears 3 times
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git resolve timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_ai_resolve(self, data: dict):
        """POST /api/git/ai-resolve - Use AI to intelligently resolve merge conflicts."""
        project = data.get("project", "")
        filepath = data.get("file", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return
        if not filepath:
            self.send_json({"success": False, "error": "No file specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        full_path = project_path / filepath
        if not full_path.exists():
            self.send_json({"success": False, "error": f"File not found: {filepath}"})
            return

        try:
            # Get the three versions
            versions = {}
            for stage, name in [(1, 'base'), (2, 'ours'), (3, 'theirs')]:
                stage_result = subprocess.run(
                    ["git", "show", f":{stage}:{filepath}"],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if stage_result.returncode == 0:
                    versions[name] = stage_result.stdout

            if not versions.get('ours') or not versions.get('theirs'):
                self.send_json({"success": False, "error": "Could not retrieve conflict versions"})
                return

            # Build the AI prompt
            prompt = f"""You are resolving a git merge conflict. Analyze the versions and provide the best merged result.

FILE: {filepath}

=== BASE VERSION (common ancestor) ===
{versions.get('base', 'Not available')}

=== OURS (current branch - HEAD) ===
{versions.get('ours', '')}

=== THEIRS (incoming branch) ===
{versions.get('theirs', '')}

INSTRUCTIONS:
1. Analyze the intent of both changes
2. Merge them intelligently, preserving all meaningful changes
3. If changes conflict semantically, prefer the more recent/complete implementation
4. Ensure the result is syntactically valid code
5. Output ONLY the final merged file content, nothing else

MERGED RESULT:"""

            # Call Claude CLI to resolve the conflict
            result = subprocess.run(
                ["claude", "-p", prompt, "--output-format", "text"],
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                self.send_json({
                    "success": False,
                    "error": f"AI resolution failed: {result.stderr}"
                })
                return

            resolved_content = result.stdout.strip()

            # Validate the resolution doesn't have conflict markers
            if '<<<<<<<' in resolved_content or '=======' in resolved_content or '>>>>>>>' in resolved_content:
                self.send_json({
                    "success": False,
                    "error": "AI resolution still contains conflict markers",
                    "content": resolved_content
                })
                return

            self.send_json({
                "success": True,
                "resolved_content": resolved_content,
                "file": filepath,
                "message": "AI successfully resolved the conflict. Review and apply if satisfied."
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "AI resolution timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_complete_merge(self, data: dict):
        """POST /api/git/complete-merge - Complete or abort a merge after resolving conflicts."""
        project = data.get("project", "")
        action = data.get("action", "commit")  # 'commit' or 'abort'
        message = data.get("message", "Merge completed - conflicts resolved")

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            if action == 'abort':
                # Abort the merge
                result = subprocess.run(
                    ["git", "merge", "--abort"],
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode != 0:
                    self.send_json({"success": False, "error": f"Failed to abort merge: {result.stderr}"})
                    return
                self.send_json({"success": True, "message": "Merge aborted successfully"})
                return

            # Check for remaining conflicts
            conflicts_result = subprocess.run(
                ["git", "ls-files", "-u"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )

            if conflicts_result.stdout.strip():
                self.send_json({
                    "success": False,
                    "error": "Cannot complete merge - unresolved conflicts remain"
                })
                return

            # Commit the merge
            result = subprocess.run(
                ["git", "commit", "-m", message],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                self.send_json({"success": False, "error": f"Failed to commit: {result.stderr}"})
                return

            self.send_json({
                "success": True,
                "message": "Merge completed successfully",
                "output": result.stdout
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git operation timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_git_revert(self, data: dict):
        """POST /api/git/revert - Discard all uncommitted changes (hard reset)."""
        project = data.get("project", "")

        if not project:
            self.send_json({"success": False, "error": "No project specified"})
            return

        project_path = PROJECTS_DIR / project
        if not project_path.exists():
            self.send_json({"success": False, "error": "Project not found"})
            return

        try:
            output_parts = []

            # Reset staged changes
            result = subprocess.run(
                ["git", "reset", "HEAD"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            output_parts.append(f"$ git reset HEAD\n{result.stdout}{result.stderr}")

            # Discard all changes in tracked files
            result = subprocess.run(
                ["git", "checkout", "--", "."],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            output_parts.append(f"\n$ git checkout -- .\n{result.stdout}{result.stderr}")

            # Clean untracked files (but not ignored ones)
            result = subprocess.run(
                ["git", "clean", "-fd"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            output_parts.append(f"\n$ git clean -fd\n{result.stdout}{result.stderr}")

            # Get final status
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            output_parts.append(f"\n$ git status --short\n{result.stdout}")

            self.send_json({
                "success": True,
                "output": "\n".join(output_parts) + "\n\nAll uncommitted changes have been discarded."
            })

        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Git revert timed out"})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    def handle_history_save(self, data: dict):
        """POST /api/history/save - Save chat entry."""
        project = data.get("project", "")
        user_msg = data.get("user", "")
        assistant_msg = data.get("assistant", "")
        timestamp = data.get("timestamp", time.time())

        if not project:
            self.send_json({"error": "No project specified"}, 400)
            return

        history_file = HISTORY_DIR / f"{project}.json"
        history_data = safe_json_load(history_file, {"entries": []})

        # Dedup: check if the last entry has the same user message (watcher may have already saved it)
        entries = history_data.get("entries", [])
        if entries:
            last = entries[-1]
            if last.get("user", "").strip() == user_msg.strip():
                # Already saved by watcher - update assistant response if frontend has a better version
                if assistant_msg and len(assistant_msg) >= len(last.get("assistant", "")):
                    last["assistant"] = assistant_msg
                    last["timestamp"] = timestamp
                    atomic_write_json(history_file, history_data)
                self.send_json({"status": "saved", "dedup": True})
                return

        history_data["entries"].append({
            "user": user_msg,
            "assistant": assistant_msg,
            "timestamp": timestamp
        })

        # Keep last 100 entries
        history_data["entries"] = history_data["entries"][-100:]

        atomic_write_json(history_file, history_data)
        self.send_json({"status": "saved"})

    def handle_history_delete(self, data: dict):
        """POST /api/history/delete - Delete history entries."""
        project = data.get("project", "")
        indices = data.get("indices", [])

        if not project or not indices:
            self.send_json({"error": "No project or indices specified"}, 400)
            return

        history_file = HISTORY_DIR / f"{project}.json"
        if history_file.exists():
            history_data = safe_json_load(history_file, {"entries": []})
            for idx in sorted(indices, reverse=True):
                if 0 <= idx < len(history_data.get("entries", [])):
                    del history_data["entries"][idx]
            atomic_write_json(history_file, history_data)

        self.send_json({"status": "deleted", "count": len(indices)})

    def handle_history_clear(self, data: dict):
        """POST /api/history/clear - Clear all history."""
        project = data.get("project", "")
        if not project:
            self.send_json({"error": "No project specified"}, 400)
            return

        history_file = HISTORY_DIR / f"{project}.json"
        if history_file.exists():
            history_file.unlink()
        self.send_json({"status": "cleared"})

    def handle_system_reset(self, data: dict):
        """POST /api/system/reset - System reset actions."""
        action = data.get("action", "")
        result = {"success": False, "message": "", "error": ""}

        try:
            if action == "clear-queue":
                count = 0
                for f in QUEUE_DIR.glob("*.json"):
                    if f.name not in ("watcher.heartbeat", "relay_sessions.json"):
                        f.unlink()
                        count += 1
                for f in QUEUE_DIR.glob("*.stream"):
                    f.unlink()
                for f in QUEUE_DIR.glob("*.result"):
                    f.unlink()
                result = {"success": True, "message": f"Cleared {count} jobs from queue"}

            elif action == "restart-watcher":
                result = self._restart_watcher_service()

            elif action == "cancel-current":
                count = 0
                for job_file in QUEUE_DIR.glob("*.json"):
                    if job_file.name in ("watcher.heartbeat", "relay_sessions.json"):
                        continue
                    job = safe_json_load(job_file, {})
                    if job.get("status") == "processing":
                        job_file.unlink()
                        count += 1
                result = {"success": True, "message": f"Cancelled {count} processing jobs"}

            elif action == "full-reset":
                cleared_count = 0
                for f in QUEUE_DIR.glob("*.json"):
                    if f.name not in ("watcher.heartbeat", "relay_sessions.json"):
                        try:
                            f.unlink()
                            cleared_count += 1
                        except:
                            pass
                for pattern in ["*.stream", "*.result", "*.questions"]:
                    for f in QUEUE_DIR.glob(pattern):
                        try:
                            f.unlink()
                        except:
                            pass

                watcher_result = self._restart_watcher_service()
                if watcher_result.get("success"):
                    result = {"success": True, "message": f"Full reset complete. Cleared {cleared_count} jobs, {watcher_result['message'].lower()}."}
                else:
                    result = {"success": False, "error": f"Queue cleared ({cleared_count} jobs) but watcher restart failed: {watcher_result.get('error', 'unknown')}"}

            elif action == "clear-session":
                # Clear the session for a specific project (logout)
                project = data.get("project", "")
                if not project:
                    result = {"success": False, "error": "No project specified"}
                else:
                    sessions_file = QUEUE_DIR / "relay_sessions.json"
                    if sessions_file.exists():
                        sessions = safe_json_load(sessions_file, {})
                        if project in sessions:
                            del sessions[project]
                            atomic_write_json(sessions_file, sessions)
                            result = {"success": True, "message": f"Session cleared for project: {project}"}
                        else:
                            result = {"success": True, "message": f"No active session for project: {project}"}
                    else:
                        result = {"success": True, "message": "No sessions file exists"}

            else:
                result = {"success": False, "error": f"Unknown action: {action}"}

        except Exception as e:
            result = {"success": False, "error": str(e)}

        self.send_json(result)

    # ========== SERVICE CHECK ==========

    def handle_service_check(self, data: dict):
        """POST /api/service/check - Check if a service is running on a port."""
        import socket
        port = data.get("port", 0)
        host = data.get("host", "127.0.0.1")

        if not port:
            self.send_json({"success": False, "error": "No port specified"}, 400)
            return

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex((host, int(port)))
            sock.close()
            running = result == 0
            self.send_json({"success": True, "running": running, "port": port})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)})

    # ========== HELPER METHODS ==========

    def _find_project_dir(self, project: str) -> Path:
        """Find project directory, case-insensitive."""
        project_dir = PROJECTS_DIR / project
        if project_dir.exists():
            return project_dir

        for p in PROJECTS_DIR.iterdir():
            if p.is_dir() and p.name.lower() == project.lower():
                return p

        return None

    def _generate_commit_message(self, project_dir: str, status_output: str) -> str:
        """Generate a meaningful commit message based on staged changes."""
        if not status_output:
            return "Update project files"

        lines = [l.strip() for l in status_output.strip().split("\n") if l.strip()]
        added = []
        modified = []
        deleted = []
        renamed = []

        for line in lines:
            if len(line) < 3:
                continue
            status = line[:2].strip()
            filepath = line[2:].strip().strip('"')
            # Get just the filename for readability
            name = filepath.split("/")[-1] if "/" in filepath else filepath
            if status in ("A", "??"):
                added.append(name)
            elif status == "M":
                modified.append(name)
            elif status == "D":
                deleted.append(name)
            elif status.startswith("R"):
                renamed.append(name)

        parts = []
        if added:
            if len(added) <= 3:
                parts.append(f"add {', '.join(added)}")
            else:
                parts.append(f"add {len(added)} files")
        if modified:
            if len(modified) <= 3:
                parts.append(f"update {', '.join(modified)}")
            else:
                parts.append(f"update {len(modified)} files")
        if deleted:
            if len(deleted) <= 3:
                parts.append(f"remove {', '.join(deleted)}")
            else:
                parts.append(f"remove {len(deleted)} files")
        if renamed:
            parts.append(f"rename {len(renamed)} files")

        if not parts:
            return "Update project files"

        # Capitalize first part, join with "; "
        message = "; ".join(parts)
        message = message[0].upper() + message[1:]

        # Truncate if too long
        if len(message) > 72:
            message = message[:69] + "..."

        return message

    def _restart_watcher_service(self):
        """Restart the watcher via systemd, with targeted process kill.

        Uses the watcher PID file to kill only the correct watcher instance
        (not other users' watchers), then lets systemd restart it.
        """
        service_name = "relay-watcher.service"

        # Kill only THIS user's watcher via PID file (not all watchers)
        pid_file = QUEUE_DIR / "watcher.pid"
        killed = False
        if pid_file.exists():
            try:
                with open(pid_file) as f:
                    pid = int(f.read().strip())
                os.kill(pid, 15)  # SIGTERM
                killed = True
                logger.info(f"Sent SIGTERM to watcher PID {pid}")
            except (ValueError, ProcessLookupError, PermissionError):
                pass

        if not killed:
            # Fallback: kill watcher processes matching this queue dir
            relay_dir = str(Path(__file__).parent.parent)
            subprocess.run(
                ["pkill", "-f", f"python.*{relay_dir}/watcher.py"],
                capture_output=True
            )

        # Wait for process to exit
        time.sleep(2)

        # Let systemd restart it (Restart=always in the service file)
        try:
            systemctl_result = subprocess.run(
                ["systemctl", "restart", service_name],
                capture_output=True, timeout=10
            )
            if systemctl_result.returncode == 0:
                return {"success": True, "message": "Watcher service restarted"}
        except Exception:
            pass

        # If systemctl failed, the watcher should still auto-restart via
        # systemd's Restart=always policy after the kill above.
        # Do NOT start a rogue process outside systemd - it causes conflicts.
        # Wait a moment and check if systemd restarted it.
        time.sleep(5)
        check = subprocess.run(
            ["systemctl", "is-active", service_name],
            capture_output=True, text=True
        )
        if check.stdout.strip() == "active":
            return {"success": True, "message": "Watcher service restarted via systemd auto-restart"}
        else:
            return {"success": False, "error": f"Could not restart {service_name}. Try: sudo systemctl restart {service_name}"}

    # ========== EDGE TTS ENDPOINTS ==========

    def handle_tts(self, data: dict, send_binary):
        """POST /api/tts - Convert text to speech using Edge TTS.

        Request: {"text": "Hello world", "voice": "en-US-GuyNeural"}
        Response: audio/mpeg binary data
        """
        text = data.get("text", "").strip()
        voice = data.get("voice", os.environ.get("EDGE_TTS_DEFAULT_VOICE", "en-US-GuyNeural"))

        if not text:
            self.send_json({"error": "No text provided"}, 400)
            return

        # Limit text length to prevent abuse (10K chars ~ 2 min of speech)
        if len(text) > 10000:
            text = text[:10000]

        try:
            import edge_tts

            # Run async Edge TTS in a sync context
            audio_data = self._run_edge_tts(text, voice)

            if audio_data:
                send_binary(audio_data, "audio/mpeg")
            else:
                self.send_json({"error": "TTS generation failed"}, 500)

        except ImportError:
            self.send_json({"error": "edge-tts not installed. Run: pip3 install edge-tts"}, 500)
        except Exception as e:
            logger.error(f"TTS error: {e}")
            self.send_json({"error": str(e)}, 500)

    def _run_edge_tts(self, text: str, voice: str) -> bytes:
        """Run Edge TTS synthesis and return audio bytes."""
        import edge_tts
        import io

        audio_chunks = []

        async def _synthesize():
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])

        # Use a new event loop to avoid conflicts
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_synthesize())
        finally:
            loop.close()

        if audio_chunks:
            return b"".join(audio_chunks)
        return None

    def handle_tts_voices(self):
        """GET /api/tts/voices - List available Edge TTS voices."""
        try:
            import edge_tts

            async def _get_voices():
                voices = await edge_tts.list_voices()
                return voices

            loop = asyncio.new_event_loop()
            try:
                voices = loop.run_until_complete(_get_voices())
            finally:
                loop.close()

            # Filter to English voices and simplify the data
            english_voices = [
                {
                    "id": v["ShortName"],
                    "name": v["FriendlyName"],
                    "gender": v["Gender"],
                    "locale": v["Locale"]
                }
                for v in voices
                if v["Locale"].startswith("en-")
            ]

            # Sort by locale then name
            english_voices.sort(key=lambda v: (v["locale"], v["name"]))

            self.send_json({"voices": english_voices})

        except ImportError:
            self.send_json({"error": "edge-tts not installed"}, 500)
        except Exception as e:
            logger.error(f"TTS voices error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== NVIDIA NIM QUICK CHAT ENDPOINT ==========

    def handle_quick_chat(self, data: dict):
        """POST /api/quick-chat - Fast AI chat via NVIDIA NIM API.

        Bypasses the Claude CLI queue for instant conversational responses.
        Request: {"message": "Hello", "model": "nvidia/nemotron-3-nano-30b-a3b", "personality": "neutral"}
        Response: {"response": "Hi there!", "model": "nvidia/nemotron-3-nano-30b-a3b"}
        """
        message = data.get("message", "").strip()
        model = data.get("model", os.environ.get("NVIDIA_MODEL", "nvidia/nemotron-3-nano-30b-a3b"))
        personality = data.get("personality", "neutral")

        if not message:
            self.send_json({"error": "No message provided"}, 400)
            return

        api_key = os.environ.get("NVIDIA_API_KEY", "")
        base_url = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")

        if not api_key:
            self.send_json({"error": "NVIDIA_API_KEY not configured in .env file"}, 500)
            return

        try:
            import openai

            client = openai.OpenAI(api_key=api_key, base_url=base_url)

            # Build system prompt based on personality
            system_prompt = self._get_personality_prompt(personality)

            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": message})

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=1024,
                temperature=0.7
            )

            result_text = response.choices[0].message.content
            self.send_json({
                "response": result_text,
                "model": model
            })

        except ImportError:
            self.send_json({"error": "openai package not installed. Run: pip3 install openai"}, 500)
        except Exception as e:
            logger.error(f"Quick chat error: {e}")
            self.send_json({"error": str(e)}, 500)

    def _get_personality_prompt(self, personality: str) -> str:
        """Get system prompt for a personality, or return empty for neutral."""
        if personality == "neutral" or not personality:
            return "You are a helpful AI assistant. Be concise and conversational."
        return self.PERSONALITY_PROMPTS.get(personality, "")

    # ========== ELEVENLABS TTS ENDPOINTS ==========

    def handle_elevenlabs_tts(self, data: dict, send_binary):
        """POST /api/elevenlabs/tts - Convert text to speech using ElevenLabs.

        Request: {"text": "Hello world", "voice_id": "21m00Tcm4TlvDq8ikWAM", "model": "eleven_monolingual_v1"}
        Response: audio/mpeg binary data
        """
        text = data.get("text", "").strip()
        voice_id = data.get("voice_id", os.environ.get("ELEVENLABS_DEFAULT_VOICE", "21m00Tcm4TlvDq8ikWAM"))
        model_id = data.get("model", os.environ.get("ELEVENLABS_MODEL", "eleven_monolingual_v1"))
        stability = data.get("stability", 0.5)
        similarity_boost = data.get("similarity_boost", 0.75)

        if not text:
            self.send_json({"error": "No text provided"}, 400)
            return

        api_key = os.environ.get("ELEVENLABS_API_KEY", "")
        if not api_key:
            self.send_json({"error": "ELEVENLABS_API_KEY not configured in .env file"}, 500)
            return

        # Limit text length (ElevenLabs charges per character)
        if len(text) > 5000:
            text = text[:5000]

        try:
            import urllib.request
            import urllib.error

            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            payload = json.dumps({
                "text": text,
                "model_id": model_id,
                "voice_settings": {
                    "stability": stability,
                    "similarity_boost": similarity_boost
                }
            })

            req = urllib.request.Request(url, data=payload.encode("utf-8"), method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("xi-api-key", api_key)
            req.add_header("Accept", "audio/mpeg")

            with urllib.request.urlopen(req, timeout=30) as resp:
                audio_data = resp.read()

            if audio_data:
                send_binary(audio_data, "audio/mpeg")
            else:
                self.send_json({"error": "ElevenLabs TTS returned empty audio"}, 500)

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            logger.error(f"ElevenLabs API error {e.code}: {error_body}")
            self.send_json({"error": f"ElevenLabs API error ({e.code}): {error_body[:200]}"}, e.code)
        except Exception as e:
            logger.error(f"ElevenLabs TTS error: {e}")
            self.send_json({"error": str(e)}, 500)

    # Curated list of popular ElevenLabs voices (used as fallback if API key lacks voices_read permission)
    ELEVENLABS_DEFAULT_VOICES = [
        {"voice_id": "2wpiDXDz7WnzetrMJddH", "name": "TARS (Interstellar)", "category": "custom", "labels": {"accent": "american", "gender": "male"}},
        {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "category": "premade", "labels": {"accent": "american", "gender": "female"}},
        {"voice_id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "category": "premade", "labels": {"accent": "american", "gender": "female"}},
        {"voice_id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella", "category": "premade", "labels": {"accent": "american", "gender": "female"}},
        {"voice_id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "category": "premade", "labels": {"accent": "american", "gender": "male"}},
        {"voice_id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "category": "premade", "labels": {"accent": "american", "gender": "female"}},
        {"voice_id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "category": "premade", "labels": {"accent": "american", "gender": "male"}},
        {"voice_id": "VR6AewLTigWG4xSOukaG", "name": "Arnold", "category": "premade", "labels": {"accent": "american", "gender": "male"}},
        {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "category": "premade", "labels": {"accent": "american", "gender": "male"}},
        {"voice_id": "yoZ06aMxZJJ28mfd3POQ", "name": "Sam", "category": "premade", "labels": {"accent": "american", "gender": "male"}},
        {"voice_id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel", "category": "premade", "labels": {"accent": "british", "gender": "male"}},
        {"voice_id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "category": "premade", "labels": {"accent": "english-swedish", "gender": "female"}},
        {"voice_id": "jBpfuIE2acCO8z3wKNLl", "name": "Gigi", "category": "premade", "labels": {"accent": "american", "gender": "female"}},
        {"voice_id": "oWAxZDx7w5VEj9dCyTzz", "name": "Grace", "category": "premade", "labels": {"accent": "american-southern", "gender": "female"}},
        {"voice_id": "nPczCjzI2devNBz1zQrb", "name": "Brian", "category": "premade", "labels": {"accent": "american", "gender": "male"}},
        {"voice_id": "N2lVS1w4EtoT3dr4eOWO", "name": "Callum", "category": "premade", "labels": {"accent": "transatlantic", "gender": "male"}},
    ]

    def handle_elevenlabs_voices(self):
        """GET /api/elevenlabs/voices - List available ElevenLabs voices."""
        api_key = os.environ.get("ELEVENLABS_API_KEY", "")
        if not api_key:
            self.send_json({"error": "ELEVENLABS_API_KEY not configured in .env file"}, 500)
            return

        try:
            import urllib.request
            import urllib.error

            url = "https://api.elevenlabs.io/v1/voices"
            req = urllib.request.Request(url)
            req.add_header("xi-api-key", api_key)
            req.add_header("Accept", "application/json")

            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            voices = []
            for v in data.get("voices", []):
                voices.append({
                    "voice_id": v.get("voice_id", ""),
                    "name": v.get("name", ""),
                    "category": v.get("category", ""),
                    "labels": v.get("labels", {}),
                    "preview_url": v.get("preview_url", "")
                })

            # Sort by name
            voices.sort(key=lambda v: v["name"])
            self.send_json({"voices": voices})

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            logger.warning(f"ElevenLabs voices API returned {e.code}, using default voice list")
            # If the API key lacks voices_read permission, return curated defaults
            if e.code == 401 or e.code == 403:
                self.send_json({"voices": self.ELEVENLABS_DEFAULT_VOICES, "source": "defaults"})
            else:
                self.send_json({"error": f"ElevenLabs API error ({e.code})"}, e.code)
        except Exception as e:
            logger.error(f"ElevenLabs voices error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== OCR (Tesseract) ==========

    def handle_ocr(self, data: dict):
        """POST /api/ocr - Extract text from an image using Tesseract OCR.

        Request: {"image": "<base64-encoded image data>"}
        Response: {"text": "extracted text", "confidence": 85}
        """
        image_data = data.get("image", "")
        if not image_data:
            self.send_json({"error": "No image data provided"}, 400)
            return

        try:
            import pytesseract
            from PIL import Image
            import io

            # Decode base64 image
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            img_bytes = base64.b64decode(image_data)
            img = Image.open(io.BytesIO(img_bytes))

            # Run OCR
            text = pytesseract.image_to_string(img)
            ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            confidences = [int(c) for c in ocr_data.get("conf", []) if str(c).isdigit() and int(c) > 0]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0

            self.send_json({"text": text.strip(), "confidence": round(avg_confidence, 1)})

        except ImportError:
            self.send_json({"error": "OCR not available. Install: pip3 install pytesseract && apt install tesseract-ocr"}, 500)
        except Exception as e:
            logger.error(f"OCR error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== PDF GENERATION ==========

    def handle_pdf_generate(self, data: dict, send_binary):
        """POST /api/pdf/generate - Generate PDF from HTML or Markdown content.

        Request: {"content": "<html or markdown>", "format": "html|markdown", "title": "Document Title"}
        Response: application/pdf binary data
        """
        content = data.get("content", "").strip()
        fmt = data.get("format", "html")
        title = data.get("title", "Document")

        if not content:
            self.send_json({"error": "No content provided"}, 400)
            return

        try:
            from weasyprint import HTML

            if fmt == "markdown":
                # Basic markdown to HTML conversion for PDF
                html_content = self._markdown_to_html_for_pdf(content, title)
            else:
                html_content = content

            # Wrap in full HTML if not already
            if "<html" not in html_content.lower():
                html_content = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>{title}</title>
<style>
body {{ font-family: -apple-system, sans-serif; padding: 40px; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }}
h1, h2, h3 {{ color: #1a1a2e; }}
table {{ border-collapse: collapse; width: 100%; margin: 16px 0; }}
th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
th {{ background: #f5f5f5; font-weight: 600; }}
code {{ background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
pre {{ background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }}
</style></head><body>{html_content}</body></html>"""

            pdf_bytes = HTML(string=html_content).write_pdf()
            send_binary(pdf_bytes, "application/pdf")

        except ImportError:
            self.send_json({"error": "PDF generation not available. Install: pip3 install weasyprint"}, 500)
        except Exception as e:
            logger.error(f"PDF generation error: {e}")
            self.send_json({"error": str(e)}, 500)

    def _markdown_to_html_for_pdf(self, md_text: str, title: str) -> str:
        """Simple markdown to HTML for PDF generation."""
        import re
        html = md_text
        html = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
        html = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
        html = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)
        html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
        html = re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)
        html = re.sub(r'^- (.+)$', r'<li>\1</li>', html, flags=re.MULTILINE)
        html = re.sub(r'`([^`]+)`', r'<code>\1</code>', html)
        html = html.replace('\n\n', '</p><p>').replace('\n', '<br>')
        return f"<h1>{title}</h1><p>{html}</p>"

    # ========== VIDEO FRAME ANALYSIS ==========

    def handle_video_analyze(self, data: dict):
        """POST /api/video/analyze - Extract frames and optionally transcribe audio from video.

        Request: {
            "path": "/path/to/video.mp4",
            "frames": 5,
            "prompt": "What's happening?",
            "transcribe": true,  # Optional: also transcribe audio
            "whisper_model": "base"  # Optional: tiny, base, small, medium, large
        }
        Response: {
            "frames": ["base64...", ...],
            "transcript": {...},  # If transcribe=true
            "metadata": {...}
        }
        """
        video_path = data.get("path", "").strip()
        num_frames = min(int(data.get("frames", 5)), 20)
        prompt = data.get("prompt", "Describe what you see in this video.")
        do_transcribe = data.get("transcribe", True)  # Default to transcribing
        whisper_model = data.get("whisper_model", "base")

        if not video_path:
            self.send_json({"error": "No video path provided"}, 400)
            return

        video_path = Path(video_path).resolve()
        if not video_path.exists():
            self.send_json({"error": f"Video file not found: {video_path}"}, 404)
            return

        try:
            import shutil
            ffmpeg_path = shutil.which("ffmpeg")
            if not ffmpeg_path:
                self.send_json({"error": "ffmpeg not installed. Install: apt install ffmpeg"}, 500)
                return

            # Get video duration
            probe_cmd = [ffmpeg_path, "-i", str(video_path), "-f", "null", "-"]
            probe = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
            duration_match = None
            import re
            for line in probe.stderr.split('\n'):
                m = re.search(r'Duration:\s*(\d+):(\d+):(\d+)\.(\d+)', line)
                if m:
                    h, mi, s, ms = m.groups()
                    duration_match = int(h) * 3600 + int(mi) * 60 + int(s) + int(ms) / 100
                    break

            if not duration_match or duration_match <= 0:
                self.send_json({"error": "Could not determine video duration"}, 400)
                return

            # Extract frames at evenly-spaced intervals
            frames = []
            frame_timestamps = []
            with tempfile.TemporaryDirectory() as tmpdir:
                for i in range(num_frames):
                    timestamp = (duration_match / (num_frames + 1)) * (i + 1)
                    frame_timestamps.append(round(timestamp, 2))
                    frame_path = os.path.join(tmpdir, f"frame_{i:03d}.jpg")
                    cmd = [ffmpeg_path, "-ss", str(timestamp), "-i", str(video_path),
                           "-vframes", "1", "-q:v", "2", frame_path, "-y"]
                    subprocess.run(cmd, capture_output=True, timeout=15)

                    if os.path.exists(frame_path):
                        with open(frame_path, "rb") as f:
                            frames.append(base64.b64encode(f.read()).decode())

            # Transcribe audio if requested
            transcript = None
            if do_transcribe:
                transcript = self._transcribe_video_audio(str(video_path), ffmpeg_path, whisper_model)

            response = {
                "frames": frames,
                "frame_count": len(frames),
                "frame_timestamps": frame_timestamps,
                "duration": round(duration_match, 2),
                "prompt": prompt,
                "metadata": {
                    "file": str(video_path),
                    "frames_extracted": len(frames),
                    "total_duration_seconds": round(duration_match, 2)
                }
            }

            if transcript:
                response["transcript"] = transcript

            self.send_json(response)

        except subprocess.TimeoutExpired:
            self.send_json({"error": "Video processing timed out"}, 500)
        except Exception as e:
            logger.error(f"Video analysis error: {e}")
            self.send_json({"error": str(e)}, 500)

    def _transcribe_video_audio(self, video_path: str, ffmpeg_path: str, model_size: str = "base") -> dict:
        """Extract audio from video and transcribe using Whisper.

        Returns dict with transcript text and timestamped segments.
        """
        try:
            import whisper
        except ImportError:
            logger.warning("Whisper not installed, skipping transcription")
            return {"error": "Whisper not installed", "text": ""}

        try:
            # Extract audio to temp WAV file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                audio_path = tmp.name

            extract_cmd = [
                ffmpeg_path, "-y", "-i", video_path,
                "-vn",                    # No video
                "-acodec", "pcm_s16le",   # WAV format
                "-ar", "16000",           # 16kHz sample rate
                "-ac", "1",               # Mono
                "-loglevel", "error",
                audio_path
            ]
            subprocess.run(extract_cmd, check=True, capture_output=True, timeout=60)

            # Load Whisper model and transcribe
            logger.info(f"Loading Whisper model '{model_size}' for video transcription...")
            model = whisper.load_model(model_size)

            logger.info("Transcribing video audio...")
            result = model.transcribe(
                audio_path,
                verbose=False,
                word_timestamps=False,
                fp16=False  # CPU compatibility
            )

            # Clean up temp file
            Path(audio_path).unlink(missing_ok=True)

            # Format segments with timestamps
            segments = []
            for seg in result.get("segments", []):
                segments.append({
                    "start": round(seg["start"], 2),
                    "end": round(seg["end"], 2),
                    "text": seg["text"].strip()
                })

            return {
                "text": result.get("text", "").strip(),
                "language": result.get("language", "unknown"),
                "segments": segments,
                "segment_count": len(segments)
            }

        except subprocess.TimeoutExpired:
            logger.error("Audio extraction timed out")
            return {"error": "Audio extraction timed out", "text": ""}
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return {"error": str(e), "text": ""}

    def handle_video_transcribe(self, data: dict):
        """POST /api/video/transcribe - Transcribe audio from video file only (no frames).

        Request: {
            "path": "/path/to/video.mp4",
            "model": "base"  # Optional: tiny, base, small, medium, large
        }
        Response: {
            "text": "full transcript...",
            "language": "en",
            "segments": [{"start": 0.0, "end": 2.5, "text": "Hello..."}],
            "duration": 120.5
        }
        """
        video_path = data.get("path", "").strip()
        model_size = data.get("model", "base")

        if not video_path:
            self.send_json({"error": "No video path provided"}, 400)
            return

        video_path = Path(video_path).resolve()
        if not video_path.exists():
            self.send_json({"error": f"Video file not found: {video_path}"}, 404)
            return

        try:
            import shutil
            ffmpeg_path = shutil.which("ffmpeg")
            if not ffmpeg_path:
                self.send_json({"error": "ffmpeg not installed"}, 500)
                return

            # Get video duration
            probe_cmd = [ffmpeg_path, "-i", str(video_path), "-f", "null", "-"]
            probe = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
            duration = 0
            import re
            for line in probe.stderr.split('\n'):
                m = re.search(r'Duration:\s*(\d+):(\d+):(\d+)\.(\d+)', line)
                if m:
                    h, mi, s, ms = m.groups()
                    duration = int(h) * 3600 + int(mi) * 60 + int(s) + int(ms) / 100
                    break

            # Transcribe
            transcript = self._transcribe_video_audio(str(video_path), ffmpeg_path, model_size)

            if "error" in transcript and transcript["error"]:
                self.send_json({"error": transcript["error"]}, 500)
                return

            transcript["duration"] = round(duration, 2)
            transcript["file"] = str(video_path)

            self.send_json(transcript)

        except Exception as e:
            logger.error(f"Video transcription error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== YOUTUBE VIDEO DOWNLOAD & ANALYSIS ==========

    def handle_youtube_download(self, data: dict):
        """POST /api/video/youtube - Download and optionally analyze a YouTube video.

        Request: {
            "url": "https://www.youtube.com/watch?v=...",
            "analyze": true,           # Optional: extract frames (default true)
            "transcribe": true,        # Optional: transcribe audio (default true)
            "frames": 5,               # Optional: number of frames to extract (1-20)
            "whisper_model": "base",   # Optional: tiny, base, small, medium, large
            "format": "best[height<=720]"  # Optional: yt-dlp format string
        }
        Response: {
            "video_path": "/path/to/downloaded.mp4",
            "title": "Video Title",
            "duration": 120.5,
            "frames": ["base64...", ...],      # If analyze=true
            "transcript": {...},               # If transcribe=true
            "metadata": {...}
        }
        """
        url = data.get("url", "").strip()
        do_analyze = data.get("analyze", True)
        do_transcribe = data.get("transcribe", True)
        num_frames = min(int(data.get("frames", 5)), 20)
        whisper_model = data.get("whisper_model", "base")
        video_format = data.get("format", "best[height<=720]/best")

        if not url:
            self.send_json({"error": "No URL provided"}, 400)
            return

        # Validate URL is a YouTube link
        import re
        youtube_pattern = r'(youtube\.com|youtu\.be)'
        if not re.search(youtube_pattern, url):
            self.send_json({"error": "Invalid YouTube URL. Provide a youtube.com or youtu.be link."}, 400)
            return

        try:
            import shutil

            # Check for yt-dlp
            ytdlp_path = shutil.which("yt-dlp")
            if not ytdlp_path:
                self.send_json({"error": "yt-dlp not installed. Install: pip install yt-dlp"}, 500)
                return

            ffmpeg_path = shutil.which("ffmpeg")
            if not ffmpeg_path:
                self.send_json({"error": "ffmpeg not installed. Install: apt install ffmpeg"}, 500)
                return

            # Generate output path
            timestamp = int(time.time() * 1000)
            video_id = str(uuid.uuid4())[:8]
            output_template = str(SCREENSHOTS_DIR / f"youtube_{timestamp}_{video_id}.%(ext)s")

            # Download video with yt-dlp
            logger.info(f"Downloading YouTube video: {url}")

            # Check for YouTube cookies file (required for bot detection bypass)
            cookies_file = RELAY_DIR / "www.youtube.com_cookies.txt"
            if not cookies_file.exists():
                # Fallback: check alternate names and locations
                for alt_path in [
                    RELAY_DIR / "youtube_cookies.txt",
                    Path.home() / "www.youtube.com_cookies.txt",
                    Path.home() / "youtube_cookies.txt",
                ]:
                    if alt_path.exists():
                        cookies_file = alt_path
                        break

            base_cmd = [
                ytdlp_path,
                "-f", video_format,
                "--merge-output-format", "mp4",
                "-o", output_template,
                "--no-playlist",           # Don't download playlists
                "--no-warnings",
                "--js-runtimes", "node",               # Required for YouTube JS challenge solving
                "--remote-components", "ejs:github",   # Required for YouTube n-challenge solver
                "--print", "after_move:filepath",  # Print final file path
                "--print", "title",                 # Print video title
                "--print", "duration",              # Print duration
            ]

            # Add cookies if available (required by YouTube to bypass bot detection)
            if cookies_file.exists():
                base_cmd.extend(["--cookies", str(cookies_file)])
                logger.info(f"Using YouTube cookies from: {cookies_file}")

            download_cmd = base_cmd + [url]
            result = subprocess.run(
                download_cmd,
                capture_output=True,
                text=True,
                timeout=600  # 10 minute timeout for longer videos
            )

            if result.returncode != 0:
                error_msg = result.stderr or "Download failed"
                logger.error(f"yt-dlp error: {error_msg}")

                # Provide actionable guidance for bot detection errors
                if "Sign in to confirm" in error_msg or "LOGIN_REQUIRED" in error_msg:
                    self.send_json({
                        "error": "YouTube requires browser cookies to verify you're not a bot. "
                                 "Please export your YouTube cookies from your browser to a cookies.txt file "
                                 "and place it at: /opt/clawd/projects/relay/youtube_cookies.txt  \n\n"
                                 "Steps: 1) Install a 'cookies.txt' browser extension (e.g. 'Get cookies.txt LOCALLY')  "
                                 "2) Go to youtube.com in your browser (logged in)  "
                                 "3) Export cookies to a file  "
                                 "4) Upload/copy the file to the server as youtube_cookies.txt"
                    }, 500)
                    return

                self.send_json({"error": f"YouTube download failed: {error_msg}"}, 500)
                return

            # Parse output - yt-dlp --print order: title, duration print before download,
            # after_move:filepath prints last (after download completes)
            output_lines = [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]
            if len(output_lines) < 3:
                self.send_json({"error": "Failed to parse yt-dlp output"}, 500)
                return

            # Find the filepath (line containing a path with extension)
            video_path = None
            video_title = ''
            video_duration = 0
            for line in output_lines:
                if line.startswith('/') and ('.' in line.split('/')[-1]):
                    video_path = line
                else:
                    # Try parsing as duration (numeric)
                    try:
                        video_duration = float(line)
                    except ValueError:
                        # Must be the title
                        if not video_title:
                            video_title = line

            if not video_path:
                video_path = output_lines[-1]  # Fallback: last line is usually the path

            if not Path(video_path).exists():
                self.send_json({"error": "Downloaded video file not found"}, 500)
                return

            logger.info(f"Downloaded: {video_title} ({video_duration}s) -> {video_path}")

            # Build response
            response = {
                "video_path": video_path,
                "title": video_title,
                "duration": round(video_duration, 2),
                "url": url,
                "metadata": {
                    "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "format": video_format
                }
            }

            # Extract frames if requested
            if do_analyze and num_frames > 0:
                frames = []
                frame_timestamps = []

                with tempfile.TemporaryDirectory() as tmpdir:
                    for i in range(num_frames):
                        if video_duration > 0:
                            timestamp_sec = (video_duration / (num_frames + 1)) * (i + 1)
                        else:
                            timestamp_sec = i * 5  # Fallback: every 5 seconds

                        frame_timestamps.append(round(timestamp_sec, 2))
                        frame_path = os.path.join(tmpdir, f"frame_{i:03d}.jpg")

                        cmd = [
                            ffmpeg_path, "-ss", str(timestamp_sec),
                            "-i", video_path,
                            "-vframes", "1", "-q:v", "2",
                            frame_path, "-y"
                        ]
                        subprocess.run(cmd, capture_output=True, timeout=15)

                        if os.path.exists(frame_path):
                            with open(frame_path, "rb") as f:
                                frames.append(base64.b64encode(f.read()).decode())

                response["frames"] = frames
                response["frame_count"] = len(frames)
                response["frame_timestamps"] = frame_timestamps

            # Transcribe audio if requested
            if do_transcribe:
                transcript = self._transcribe_video_audio(video_path, ffmpeg_path, whisper_model)
                if transcript:
                    response["transcript"] = transcript

            self.send_json(response)

        except subprocess.TimeoutExpired:
            self.send_json({"error": "YouTube download timed out (10 minute limit)"}, 500)
        except Exception as e:
            logger.error(f"YouTube download error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== PIPER TTS (LOCAL NEURAL TTS) ==========

    def handle_piper_tts(self, data: dict, send_binary):
        """POST /api/tts/piper - Generate speech using local Piper TTS.

        Request: {"text": "Text to speak", "voice": "amy"}
        Response: audio/wav binary data

        Piper is a fast, local neural TTS engine. No API keys, no internet required.
        Voices available: amy (default), lessac (coming soon)
        """
        text = data.get("text", "").strip()
        voice = data.get("voice", "amy")

        if not text:
            self.send_json({"error": "No text provided"}, 400)
            return

        # Limit text length to prevent abuse
        if len(text) > 5000:
            self.send_json({"error": "Text too long (max 5000 characters)"}, 400)
            return

        try:
            import subprocess
            import tempfile

            # Voice model paths
            voice_dir = RELAY_DIR / ".piper-voices"
            voice_models = {
                "amy": voice_dir / "en_US-amy-medium.onnx",                            # Female, US English
                "ryan": voice_dir / "en_US-ryan-medium.onnx",                          # Male, US English
                "lessac": voice_dir / "en_US-lessac-medium.onnx",                      # Female, US English
                "alan": voice_dir / "en_GB-alan-medium.onnx",                          # Male, British English
                "alba": voice_dir / "en_GB-alba-medium.onnx",                          # Female, Scottish English
                "cori": voice_dir / "en_GB-cori-medium.onnx",                          # Female, British English
                "jenny_dioco": voice_dir / "en_GB-jenny_dioco-medium.onnx",            # Female, British English
                "northern_english_male": voice_dir / "en_GB-northern_english_male-medium.onnx",  # Male, Northern English
            }

            model_path = voice_models.get(voice)
            if not model_path or not model_path.exists():
                available = [k for k, v in voice_models.items() if v.exists()]
                self.send_json({"error": f"Voice '{voice}' not available. Available: {available}"}, 400)
                return

            # Generate audio with Piper
            piper_bin = Path.home() / ".local" / "bin" / "piper"
            if not piper_bin.exists():
                piper_bin = "piper"  # Try system PATH

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name

            result = subprocess.run(
                [str(piper_bin), "--model", str(model_path), "--output_file", tmp_path],
                input=text,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                logger.error(f"Piper error: {result.stderr}")
                self.send_json({"error": f"Piper TTS failed: {result.stderr}"}, 500)
                return

            # Read and send the audio file
            with open(tmp_path, "rb") as f:
                audio_data = f.read()

            # Clean up
            Path(tmp_path).unlink(missing_ok=True)

            send_binary(audio_data, "audio/wav")

        except FileNotFoundError:
            self.send_json({"error": "Piper not installed. Run: pip3 install piper-tts"}, 500)
        except subprocess.TimeoutExpired:
            self.send_json({"error": "TTS generation timed out"}, 500)
        except Exception as e:
            logger.error(f"Piper TTS error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== IMAGE GENERATION (DALL-E 3 or NVIDIA FLUX) ==========

    def handle_dalle_generate(self, data: dict):
        """POST /api/image/generate - Generate image using DALL-E 3 or NVIDIA FLUX.

        Request: {
            "prompt": "description",
            "size": "1024x1024",
            "quality": "standard",
            "style": "vivid",
            "provider": "auto"  # "openai", "nvidia", or "auto" (tries nvidia first)
        }
        Response: {"url": "image_url", "revised_prompt": "...", "provider": "nvidia|openai"}

        DALL-E 3 (OpenAI): Requires OPENAI_API_KEY, costs ~$0.04-0.08/image
        FLUX (NVIDIA): Requires NVIDIA_API_KEY, FREE with 5000 credits on signup
        """
        prompt = data.get("prompt", "").strip()
        size = data.get("size", "1024x1024")
        quality = data.get("quality", "standard")
        style = data.get("style", "vivid")
        provider = data.get("provider", "auto").lower()

        if not prompt:
            self.send_json({"error": "No prompt provided"}, 400)
            return

        import os

        openai_key = os.environ.get("OPENAI_API_KEY")

        # NOTE: NVIDIA's hosted NIM API only supports LLMs, not image generation.
        # FLUX/image models require self-hosted NIM with GPU. Use OpenAI DALL-E 3 instead.

        if provider == "nvidia":
            self.send_json({
                "error": "NVIDIA's hosted API (integrate.api.nvidia.com) only supports LLMs, not image generation. FLUX requires self-hosted NIM with GPU. Use provider='openai' with OPENAI_API_KEY for DALL-E 3."
            }, 400)
            return

        # Use OpenAI for image generation
        if openai_key:
            return self._generate_image_openai(prompt, size, quality, style, openai_key)
        else:
            self.send_json({
                "error": "OPENAI_API_KEY not configured. Add to .env file for DALL-E 3 image generation. NVIDIA's API only supports text models, not images."
            }, 500)
            return

    def _generate_image_nvidia(self, prompt: str, size: str, api_key: str):
        """Generate image using NVIDIA FLUX API (FREE with credits)."""
        if not api_key:
            self.send_json({"error": "NVIDIA_API_KEY not set. Get free key at https://build.nvidia.com"}, 500)
            return

        try:
            import requests
            import base64

            # Parse size to width/height
            if "x" in size:
                width, height = map(int, size.split("x"))
            else:
                width, height = 1024, 1024

            # NVIDIA FLUX API endpoint
            url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-1-dev"

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }

            payload = {
                "prompt": prompt,
                "width": width,
                "height": height,
                "num_inference_steps": 30
            }

            response = requests.post(url, headers=headers, json=payload, timeout=120)

            if response.status_code != 200:
                # Try to parse JSON error, fall back to text
                try:
                    error_data = response.json()
                    error_msg = error_data.get("detail", error_data.get("message", response.text))
                except:
                    error_msg = response.text
                self.send_json({"error": f"NVIDIA API error ({response.status_code}): {error_msg}"}, response.status_code)
                return

            result = response.json()

            # NVIDIA returns base64 image data
            if "artifacts" in result and len(result["artifacts"]) > 0:
                image_b64 = result["artifacts"][0].get("base64")
                if image_b64:
                    # Save to screenshots directory and return URL
                    import time
                    filename = f"generated_{int(time.time())}.png"
                    filepath = RELAY_DIR / ".screenshots" / filename

                    with open(filepath, "wb") as f:
                        f.write(base64.b64decode(image_b64))

                    self.send_json({
                        "url": f"/screenshots/{filename}",
                        "local_path": str(filepath),
                        "revised_prompt": prompt,
                        "provider": "nvidia",
                        "model": "flux-1-dev",
                        "size": f"{width}x{height}"
                    })
                    return

            self.send_json({"error": "No image returned from NVIDIA API"}, 500)

        except requests.exceptions.Timeout:
            self.send_json({"error": "NVIDIA API timeout - image generation took too long"}, 504)
        except Exception as e:
            logger.error(f"NVIDIA image generation error: {e}")
            self.send_json({"error": str(e)}, 500)

    def _generate_image_openai(self, prompt: str, size: str, quality: str, style: str, api_key: str):
        """Generate image using OpenAI DALL-E 3."""
        if not api_key:
            self.send_json({"error": "OPENAI_API_KEY not set in environment"}, 500)
            return

        # Validate size for DALL-E
        valid_sizes = ["1024x1024", "1792x1024", "1024x1792"]
        if size not in valid_sizes:
            size = "1024x1024"

        start_time = time.time()

        try:
            import openai
            import requests as req

            client = openai.OpenAI(api_key=api_key)

            response = client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size=size,
                quality=quality,
                style=style,
                n=1
            )

            image_url = response.data[0].url
            revised_prompt = response.data[0].revised_prompt

            # Download image locally for persistent storage
            filename = f"dalle_{int(time.time())}_{uuid.uuid4().hex[:6]}.png"
            local_path = RELAY_DIR / ".screenshots" / filename
            preview_path = Path("/opt/clawd/projects/.preview") / filename

            try:
                img_response = req.get(image_url, timeout=60)
                if img_response.status_code == 200:
                    local_path.write_bytes(img_response.content)
                    preview_path.write_bytes(img_response.content)
                    local_url = f"/screenshots/{filename}"
                    preview_url = f"http://127.0.0.1:8800/{filename}"
                else:
                    local_url = image_url
                    preview_url = image_url
            except Exception as dl_err:
                logger.warning(f"Could not download image locally: {dl_err}")
                local_url = image_url
                preview_url = image_url

            duration = time.time() - start_time

            # Generate status dashboard
            from .dashboard import generate_dashboard, estimate_cost

            cost = estimate_cost("image_generation", {"quality": quality, "size": size})

            dashboard_url = generate_dashboard(
                operation_type="image-gen",
                title="Image Generation",
                subtitle="DALL-E 3 via OpenAI",
                status="success",
                status_items=[
                    {"text": "DALL-E 3 API request successful", "passed": True},
                    {"text": f"Image generated: {size} {quality.upper()}", "passed": True},
                    {"text": "Downloaded and saved locally", "passed": True},
                ],
                metadata={
                    "Provider": "OpenAI",
                    "Model": "DALL-E 3",
                    "Size": size,
                    "Quality": quality.upper(),
                    "Style": style.title(),
                    "Cost": cost,
                },
                input_params={"prompt": prompt, "size": size, "quality": quality, "style": style},
                output_data={"revised_prompt": revised_prompt},
                timing={"started": start_time, "duration_seconds": duration},
                download={"url": f"/{filename}", "filename": f"dalle-{filename}", "size_display": "~2MB"},
                preview_image=f"/{filename}",
                hal_message="The image has been generated successfully, Dave.<br>I find the visualization quite... satisfactory.",
            )

            self.send_json({
                "url": image_url,
                "local_url": local_url,
                "preview_url": preview_url,
                "revised_prompt": revised_prompt,
                "provider": "openai",
                "model": "dall-e-3",
                "size": size,
                "quality": quality,
                "style": style,
                "dashboard_url": dashboard_url,
                "display_image": preview_url,  # For showing in chat
            })

        except openai.BadRequestError as e:
            self.send_json({"error": f"DALL-E rejected prompt: {str(e)}"}, 400)
        except openai.AuthenticationError:
            self.send_json({"error": "Invalid OpenAI API key"}, 401)
        except Exception as e:
            logger.error(f"DALL-E error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== SQLITE BROWSER ==========

    def handle_sqlite_query(self, data: dict):
        """POST /api/sqlite/query - Execute SQL query on a SQLite database.

        Request: {"database": "/path/to/db.sqlite", "query": "SELECT * FROM users LIMIT 10"}
        Response: {"columns": [...], "rows": [...], "row_count": 10}

        Safety: Only SELECT queries allowed. No modifications.
        """
        db_path = data.get("database", "").strip()
        query = data.get("query", "").strip()

        if not db_path:
            self.send_json({"error": "No database path provided"}, 400)
            return

        if not query:
            self.send_json({"error": "No query provided"}, 400)
            return

        # Security: Only allow SELECT queries
        query_upper = query.upper().strip()
        if not query_upper.startswith("SELECT"):
            self.send_json({"error": "Only SELECT queries allowed for safety"}, 403)
            return

        # Block dangerous keywords even in SELECT
        dangerous = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "ATTACH", "DETACH"]
        for keyword in dangerous:
            if keyword in query_upper:
                self.send_json({"error": f"Query contains forbidden keyword: {keyword}"}, 403)
                return

        try:
            import sqlite3

            db_file = Path(db_path)
            if not db_file.exists():
                self.send_json({"error": f"Database not found: {db_path}"}, 404)
                return

            conn = sqlite3.connect(str(db_file), timeout=5)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute(query)
            rows = cursor.fetchall()

            # Get column names
            columns = [description[0] for description in cursor.description] if cursor.description else []

            # Convert rows to list of dicts
            result_rows = [dict(row) for row in rows]

            conn.close()

            self.send_json({
                "columns": columns,
                "rows": result_rows,
                "row_count": len(result_rows)
            })

        except sqlite3.OperationalError as e:
            self.send_json({"error": f"SQL error: {str(e)}"}, 400)
        except Exception as e:
            logger.error(f"SQLite error: {e}")
            self.send_json({"error": str(e)}, 500)

    def handle_sqlite_tables(self, data: dict):
        """POST /api/sqlite/tables - List tables in a SQLite database.

        Request: {"database": "/path/to/db.sqlite"}
        Response: {"tables": [{"name": "users", "columns": [...]}]}
        """
        db_path = data.get("database", "").strip()

        if not db_path:
            self.send_json({"error": "No database path provided"}, 400)
            return

        try:
            import sqlite3

            db_file = Path(db_path)
            if not db_file.exists():
                self.send_json({"error": f"Database not found: {db_path}"}, 404)
                return

            conn = sqlite3.connect(str(db_file), timeout=5)
            cursor = conn.cursor()

            # Get all tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            tables = []

            for (table_name,) in cursor.fetchall():
                # Get columns for each table
                cursor.execute(f"PRAGMA table_info({table_name})")
                columns = [{"name": col[1], "type": col[2], "notnull": col[3], "pk": col[5]} for col in cursor.fetchall()]
                tables.append({"name": table_name, "columns": columns})

            conn.close()

            self.send_json({"tables": tables, "database": db_path})

        except Exception as e:
            logger.error(f"SQLite tables error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== LOCAL WHISPER STT ==========

    def handle_whisper_transcribe(self, data: dict):
        """POST /api/whisper/transcribe - Transcribe audio using local Whisper.

        Request: {"audio": "base64_audio_data", "language": "en", "model": "base"}
        Response: {"text": "transcribed text", "language": "en"}

        Models: tiny, base, small, medium, large (larger = better but slower)
        """
        audio_b64 = data.get("audio", "")
        language = data.get("language", "en")
        model_size = data.get("model", "base")

        if not audio_b64:
            self.send_json({"error": "No audio data provided"}, 400)
            return

        try:
            import whisper
            import base64
            import tempfile

            # Decode audio
            audio_data = base64.b64decode(audio_b64)

            # Write to temp file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio_data)
                tmp_path = tmp.name

            # Load model (cached after first load)
            model = whisper.load_model(model_size)

            # Transcribe
            result = model.transcribe(tmp_path, language=language)

            # Clean up
            Path(tmp_path).unlink(missing_ok=True)

            self.send_json({
                "text": result["text"].strip(),
                "language": result.get("language", language),
                "segments": result.get("segments", [])
            })

        except ImportError:
            self.send_json({"error": "Whisper not installed. Run: pip3 install openai-whisper"}, 500)
        except Exception as e:
            logger.error(f"Whisper error: {e}")
            self.send_json({"error": str(e)}, 500)

    # ========== MCP SERVER INTEGRATION ==========

    def handle_mcp_config_get(self, data: dict):
        """GET /api/mcp/config - Get current MCP server configuration.

        Response: {"servers": {...}, "config_path": "..."}
        """
        try:
            import json
            config_path = Path.home() / ".claude" / "mcp_servers.json"

            if config_path.exists():
                with open(config_path, "r") as f:
                    config = json.load(f)
            else:
                config = {"mcpServers": {}}

            self.send_json({
                "servers": config.get("mcpServers", {}),
                "config_path": str(config_path)
            })

        except Exception as e:
            logger.error(f"MCP config read error: {e}")
            self.send_json({"error": str(e)}, 500)

    def handle_mcp_config_set(self, data: dict):
        """POST /api/mcp/config - Update MCP server configuration.

        Request: {"servers": {"github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]}}}
        Response: {"saved": true, "config_path": "..."}

        Common MCP servers:
        - github: @modelcontextprotocol/server-github (requires GITHUB_TOKEN)
        - filesystem: @modelcontextprotocol/server-filesystem
        - sqlite: @modelcontextprotocol/server-sqlite
        - puppeteer: @anthropics/mcp-server-puppeteer
        """
        servers = data.get("servers", {})

        if not isinstance(servers, dict):
            self.send_json({"error": "servers must be an object"}, 400)
            return

        try:
            import json
            config_dir = Path.home() / ".claude"
            config_dir.mkdir(exist_ok=True)
            config_path = config_dir / "mcp_servers.json"

            config = {"mcpServers": servers}

            with open(config_path, "w") as f:
                json.dump(config, f, indent=2)

            self.send_json({
                "saved": True,
                "config_path": str(config_path),
                "server_count": len(servers)
            })

        except Exception as e:
            logger.error(f"MCP config write error: {e}")
            self.send_json({"error": str(e)}, 500)

    def handle_mcp_servers_list(self, data: dict):
        """GET /api/mcp/servers - List available MCP server templates.

        Response: {"templates": [...]}
        """
        # Common MCP servers from the ecosystem
        templates = [
            {
                "name": "github",
                "description": "GitHub API integration - repos, issues, PRs",
                "package": "@modelcontextprotocol/server-github",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-github"],
                "env": ["GITHUB_TOKEN"]
            },
            {
                "name": "filesystem",
                "description": "Read/write files with path restrictions",
                "package": "@modelcontextprotocol/server-filesystem",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"],
                "env": []
            },
            {
                "name": "sqlite",
                "description": "Query SQLite databases",
                "package": "@modelcontextprotocol/server-sqlite",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "/path/to/db.sqlite"],
                "env": []
            },
            {
                "name": "puppeteer",
                "description": "Browser automation and screenshots",
                "package": "@anthropics/mcp-server-puppeteer",
                "command": "npx",
                "args": ["-y", "@anthropics/mcp-server-puppeteer"],
                "env": []
            },
            {
                "name": "brave-search",
                "description": "Web search via Brave Search API",
                "package": "@anthropics/mcp-server-brave-search",
                "command": "npx",
                "args": ["-y", "@anthropics/mcp-server-brave-search"],
                "env": ["BRAVE_API_KEY"]
            },
            {
                "name": "slack",
                "description": "Slack workspace integration",
                "package": "@anthropics/mcp-server-slack",
                "command": "npx",
                "args": ["-y", "@anthropics/mcp-server-slack"],
                "env": ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"]
            }
        ]

        self.send_json({"templates": templates})

    # ========== ACTIVE CONTEXT ==========

    def handle_context_save(self, data: dict):
        """POST /api/context/save - Save the currently viewed content for Claude to reference.

        Request: {"project": "relay", "user": "question text", "assistant": "response text", "title": "optional title"}
        Response: {"saved": true, "path": "/path/to/context.md"}
        """
        project = data.get("project", "").strip()
        user_msg = data.get("user", "").strip()
        assistant_msg = data.get("assistant", "").strip()
        title = data.get("title", "Active Context")

        if not project:
            self.send_json({"error": "No project specified"}, 400)
            return

        if not user_msg and not assistant_msg:
            self.send_json({"error": "No content to save"}, 400)
            return

        # Create .context directory in project
        context_dir = PROJECTS_DIR / project / ".context"
        context_dir.mkdir(parents=True, exist_ok=True)

        context_file = context_dir / "active-view.md"
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

        content = f"""# {title}
*Saved at {timestamp}*

## User Message
{user_msg}

## Assistant Response
{assistant_msg}
"""

        try:
            context_file.write_text(content)
            self.send_json({"saved": True, "path": str(context_file)})
        except Exception as e:
            logger.error(f"Context save error: {e}")
            self.send_json({"error": str(e)}, 500)

    def handle_context_clear(self, data: dict):
        """POST /api/context/clear - Clear the active context file.

        Request: {"project": "relay"}
        Response: {"cleared": true}
        """
        project = data.get("project", "").strip()
        if not project:
            self.send_json({"error": "No project specified"}, 400)
            return

        context_file = PROJECTS_DIR / project / ".context" / "active-view.md"
        try:
            if context_file.exists():
                context_file.unlink()
            self.send_json({"cleared": True})
        except Exception as e:
            logger.error(f"Context clear error: {e}")
            self.send_json({"error": str(e)}, 500)

    def handle_skills_list(self, data: dict):
        """GET/POST /api/skills - List all available skills with metadata.

        Response: {"skills": [{name, description, category, usage, ...}]}
        """
        skills = []
        commands_dir = RELAY_DIR / ".claude" / "commands"
        skills_dir = RELAY_DIR / ".claude" / "skills"

        # Parse command files (simple skills)
        if commands_dir.exists():
            for cmd_file in commands_dir.glob("*.md"):
                skill = self._parse_skill_file(cmd_file, cmd_file.stem)
                if skill:
                    skills.append(skill)

            # Also check subdirectories for namespaced commands
            for subdir in commands_dir.iterdir():
                if subdir.is_dir():
                    for cmd_file in subdir.glob("*.md"):
                        skill_name = f"{subdir.name}:{cmd_file.stem}"
                        skill = self._parse_skill_file(cmd_file, skill_name)
                        if skill:
                            skills.append(skill)

        # Parse skill files (complex skills with SKILL.md)
        if skills_dir.exists():
            for skill_subdir in skills_dir.iterdir():
                if skill_subdir.is_dir():
                    skill_file = skill_subdir / "SKILL.md"
                    if skill_file.exists():
                        skill = self._parse_skill_file(skill_file, skill_subdir.name, is_skill=True)
                        if skill:
                            skills.append(skill)

        self.send_json({"skills": skills})

    def handle_skill_info(self, data: dict):
        """POST /api/skills/info - Get detailed info for a specific skill.

        Request: {"skill": "commit"} or {"skill": "github_bug_fix:rca"}
        Response: {"skill": {name, description, content, usage, examples, ...}}
        """
        skill_name = data.get("skill", "").strip().lstrip("/")
        if not skill_name:
            self.send_json({"error": "No skill specified"}, 400)
            return

        commands_dir = RELAY_DIR / ".claude" / "commands"
        skills_dir = RELAY_DIR / ".claude" / "skills"

        # Check if namespaced skill (e.g., github_bug_fix:rca)
        if ":" in skill_name:
            namespace, subskill = skill_name.split(":", 1)
            skill_file = commands_dir / namespace / f"{subskill}.md"
        else:
            # Check commands first, then skills
            skill_file = commands_dir / f"{skill_name}.md"
            if not skill_file.exists():
                skill_file = skills_dir / skill_name / "SKILL.md"

        if not skill_file.exists():
            self.send_json({"error": f"Skill not found: {skill_name}"}, 404)
            return

        skill = self._parse_skill_file(skill_file, skill_name, full_content=True, is_skill="skills" in str(skill_file))
        if skill:
            self.send_json({"skill": skill})
        else:
            self.send_json({"error": "Failed to parse skill file"}, 500)

    def _parse_skill_file(self, file_path: Path, skill_name: str, full_content: bool = False, is_skill: bool = False) -> dict | None:
        """Parse a skill/command markdown file and extract metadata."""
        try:
            content = file_path.read_text()
        except Exception as e:
            logger.error(f"Error reading skill file {file_path}: {e}")
            return None

        result = {
            "name": skill_name,
            "description": "",
            "category": self._guess_skill_category(skill_name),
            "usage": f"/{skill_name}",
            "type": "skill" if is_skill else "command"
        }

        # Parse YAML frontmatter
        if content.startswith("---"):
            try:
                _, frontmatter, body = content.split("---", 2)
                meta = yaml.safe_load(frontmatter)
                if meta:
                    result["description"] = meta.get("description", "")
                    if meta.get("name"):
                        result["name"] = meta["name"]
                content = body.strip()
            except (ValueError, yaml.YAMLError):
                # No valid frontmatter, use content as-is
                pass

        # Extract title and overview from markdown
        lines = content.split("\n")
        in_section = None
        overview_lines = []
        usage_lines = []
        example_lines = []

        for line in lines:
            # Get title from first H1
            if line.startswith("# ") and not result.get("title"):
                result["title"] = line[2:].strip()
                continue

            # Track which section we're in
            if line.startswith("## "):
                section_lower = line[3:].strip().lower()
                if "overview" in section_lower or "purpose" in section_lower:
                    in_section = "overview"
                elif "usage" in section_lower or "how to use" in section_lower:
                    in_section = "usage"
                elif "example" in section_lower:
                    in_section = "example"
                else:
                    in_section = None
                continue

            # Collect section content
            if in_section == "overview" and line.strip():
                overview_lines.append(line)
            elif in_section == "usage" and line.strip():
                usage_lines.append(line)
            elif in_section == "example" and line.strip():
                example_lines.append(line)

        # Build summary from overview or first paragraph
        if overview_lines:
            result["overview"] = "\n".join(overview_lines[:5]).strip()
        elif not result["description"]:
            # Use first paragraph as description
            for line in lines:
                if line.strip() and not line.startswith("#"):
                    result["description"] = line.strip()
                    break

        # Add usage examples
        if usage_lines:
            result["usage_examples"] = "\n".join(usage_lines[:10]).strip()

        if example_lines:
            result["examples"] = "\n".join(example_lines[:15]).strip()

        # For full content request, include the entire markdown
        if full_content:
            result["content"] = content

        return result

    def _guess_skill_category(self, skill_name: str) -> str:
        """Guess the category of a skill based on its name."""
        name_lower = skill_name.lower()

        if any(x in name_lower for x in ["plan", "brainstorm", "prime", "orchestrate", "explain"]):
            return "Planning & Analysis"
        elif any(x in name_lower for x in ["refactor", "debug", "frontend", "playground", "discover", "stack"]):
            return "Development"
        elif any(x in name_lower for x in ["test", "review", "validate", "preflight", "analyze"]):
            return "Testing & Quality"
        elif any(x in name_lower for x in ["security", "scan"]):
            return "Security"
        elif any(x in name_lower for x in ["git", "commit", "pipeline", "execution", "system"]):
            return "Git & Workflow"
        elif any(x in name_lower for x in ["prd", "adr", "claude-md", "doc"]):
            return "Documentation"
        elif any(x in name_lower for x in ["github", "bug"]):
            return "GitHub"
        else:
            return "Utilities"

    def handle_project_create(self, data: dict):
        """POST /api/project/create - Create a new project.

        Request: {"name": "my-project", "user": "axion", "init_git": true, "copy_template": true}
        Response: {"success": true, "project": "my-project", "path": "/opt/clawd/projects/axion/my-project"}
        """
        import shutil
        import re

        name = data.get("name", "").strip()
        init_git = data.get("init_git", True)
        copy_template = data.get("copy_template", True)

        # Validate project name
        if not name:
            self.send_json({"success": False, "error": "Project name is required"}, 400)
            return

        # Only allow lowercase letters, numbers, hyphens
        if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$', name):
            self.send_json({
                "success": False,
                "error": "Project name must use only lowercase letters, numbers, and hyphens"
            }, 400)
            return

        project_path = PROJECTS_DIR / name
        template_path = PROJECTS_DIR / ".templates" / "claude-template"

        # Check if project already exists
        if project_path.exists():
            self.send_json({
                "success": False,
                "error": f"Project '{name}' already exists"
            }, 400)
            return

        try:
            # Create project directory
            project_path.mkdir(parents=True, exist_ok=True)

            # Copy .claude template if requested
            if copy_template and template_path.exists():
                dest_claude = project_path / ".claude"
                shutil.copytree(template_path, dest_claude)
                logger.info(f"Copied .claude template to {dest_claude}")

            # Create basic CLAUDE.md
            claude_md = project_path / "CLAUDE.md"
            claude_md.write_text(f"""# {name} - Claude Instructions

## Project Overview

[Add project description here]

## Key Directories

- `src/` - Source code
- `.claude/` - Claude commands and skills

## Running the Project

[Add run instructions here]
""")

            # Initialize git if requested
            if init_git:
                result = subprocess.run(
                    ["git", "init"],
                    cwd=str(project_path),
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    # Create .gitignore
                    gitignore = project_path / ".gitignore"
                    gitignore.write_text("""# Dependencies
node_modules/
.venv/
__pycache__/

# Environment
.env
.env.local

# IDE
.idea/
.vscode/
*.swp

# Build
dist/
build/
*.egg-info/

# Logs
*.log
logs/
""")
                    logger.info(f"Initialized git repository in {project_path}")

            self.send_json({
                "success": True,
                "project": name,
                "path": str(project_path),
                "message": f"Project '{name}' created successfully"
            })

        except Exception as e:
            logger.error(f"Error creating project: {e}")
            # Clean up on failure
            if project_path.exists():
                shutil.rmtree(project_path, ignore_errors=True)
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_project_delete(self, data: dict):
        """POST /api/project/delete - Delete a project.

        Request: {"project": "my-project", "delete_from_github": false}
        Response: {"success": true, "message": "Project deleted"}
        """
        import shutil

        project = data.get("project", "").strip()
        delete_from_github = data.get("delete_from_github", False)

        if not project:
            self.send_json({"success": False, "error": "Project name is required"}, 400)
            return

        # Security: Prevent deleting critical directories
        protected = ["relay", ".templates", ".preview", "general"]
        if project in protected:
            self.send_json({
                "success": False,
                "error": f"Cannot delete protected project '{project}'"
            }, 403)
            return

        project_path = PROJECTS_DIR / project

        # Check if project exists
        if not project_path.exists():
            self.send_json({
                "success": False,
                "error": f"Project '{project}' not found"
            }, 404)
            return

        # Check it's actually a directory
        if not project_path.is_dir():
            self.send_json({
                "success": False,
                "error": f"'{project}' is not a directory"
            }, 400)
            return

        try:
            github_deleted = False
            github_error = None

            # Delete from GitHub if requested
            if delete_from_github:
                try:
                    # Get remote URL to extract owner/repo
                    result = subprocess.run(
                        ["git", "remote", "get-url", "origin"],
                        cwd=str(project_path),
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    if result.returncode == 0:
                        remote_url = result.stdout.strip()
                        # Extract owner/repo from URL
                        # Handles: git@github.com:owner/repo.git or https://github.com/owner/repo.git
                        import re
                        match = re.search(r'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$', remote_url)
                        if match:
                            owner, repo = match.groups()
                            repo = repo.replace('.git', '')
                            # Use gh CLI to delete repository
                            delete_result = subprocess.run(
                                ["gh", "repo", "delete", f"{owner}/{repo}", "--yes"],
                                capture_output=True,
                                text=True,
                                timeout=60
                            )
                            if delete_result.returncode == 0:
                                github_deleted = True
                                logger.info(f"Deleted GitHub repository: {owner}/{repo}")
                            else:
                                github_error = delete_result.stderr.strip() or "Failed to delete from GitHub"
                        else:
                            github_error = "Could not parse GitHub repository URL"
                    else:
                        github_error = "No git remote 'origin' found"
                except subprocess.TimeoutExpired:
                    github_error = "GitHub deletion timed out"
                except Exception as e:
                    github_error = str(e)

            # Delete local project directory
            shutil.rmtree(project_path)
            logger.info(f"Deleted project directory: {project_path}")

            response = {
                "success": True,
                "message": f"Project '{project}' deleted successfully"
            }

            if delete_from_github:
                if github_deleted:
                    response["github_deleted"] = True
                    response["message"] += " (including GitHub repository)"
                elif github_error:
                    response["github_error"] = github_error
                    response["message"] += f" (GitHub deletion failed: {github_error})"

            self.send_json(response)

        except Exception as e:
            logger.error(f"Error deleting project: {e}")
            self.send_json({"success": False, "error": str(e)}, 500)

    def handle_smart_prepare(self, data: dict):
        """POST /api/smart/prepare - Analyze text and prepare for smart send.

        This generates a full structured TASK.md format with Overview, User Story,
        Requirements, Acceptance Criteria, and Technical Notes.
        Also updates TASK.md in the project if update_task is true.

        If use_claude_format is true, uses Claude to clean up and improve the text first.

        Request: {"text": "the task description...", "project": "relay", "update_task": true, "use_claude_format": false}
        Response: {"title": "Add Dark Mode", "mode": "@dev", "formatted_task": "...", "task_updated": true}
        """
        text = data.get("text", "").strip()
        project = data.get("project", "")
        update_task = data.get("update_task", True)  # Default to updating TASK.md
        use_claude_format = data.get("use_claude_format", True)  # Default to using Claude formatting

        if not text:
            self.send_json({"error": "No text provided"}, 400)
            return

        # Use Claude to clean up and improve the text (enabled by default for Smart Send)
        if use_claude_format:
            cleaned_text = self._format_with_claude(text, project)
            if cleaned_text:
                text = cleaned_text

        # Quick local analysis for agent mode (no API call needed)
        mode = self._detect_agent_mode(text)

        # Generate title locally using simple heuristics
        title = self._generate_title(text)

        # Generate the full structured task format
        formatted_task = self._generate_structured_task(title, text, mode)

        # Update TASK.md if project is specified and update_task is true
        task_updated = False
        if project and update_task:
            task_updated = self._update_task_md(project, title, text, mode)

        self.send_json({
            "title": title,
            "mode": mode,
            "mode_context": self._get_mode_context(mode),
            "formatted_task": formatted_task,
            "task_updated": task_updated
        })

    def _format_with_claude(self, text: str, project: str) -> str:
        """Use Claude to clean up, structure and format the text. Returns None if fails."""
        try:
            import subprocess

            prompt = f"""You are a task formatter. Clean up and structure this task description into a clear, professional format.

Instructions:
1. Fix any typos, grammar issues, and unclear phrasing
2. Keep the core meaning and all details intact
3. Structure the content clearly with proper paragraphs
4. If the text mentions multiple things to do, list them clearly
5. Output ONLY the cleaned/formatted text - no explanations, no markdown headers, no "Here's the cleaned version"

Text to format:
{text}"""

            project_dir = self._find_project_dir(project) if project else None
            cwd = str(project_dir) if project_dir else "/opt/clawd/projects"

            result = subprocess.run(
                ["claude", "-p", prompt, "--output-format", "text"],
                capture_output=True,
                text=True,
                timeout=60,
                cwd=cwd
            )

            if result.returncode == 0 and result.stdout.strip():
                cleaned = result.stdout.strip()
                # Remove any "Here's..." preamble if Claude added it
                lines = cleaned.split('\n')
                if lines and lines[0].lower().startswith(('here', "i've", "i have", "the cleaned", "the formatted")):
                    cleaned = '\n'.join(lines[1:]).strip()
                return cleaned
            return None
        except Exception as e:
            logger.warning(f"Claude format failed: {e}")
            return None

    def _generate_structured_task(self, title: str, description: str, mode: str) -> str:
        """Generate a full structured task format with all sections."""
        mode_names = {
            '@explore': 'Explore',
            '@research': 'Research',
            '@plan': 'Plan',
            '@architect': 'Architect',
            '@dev': 'Development',
            '@implement': 'Implement',
            '@review': 'Review',
            '@debug': 'Debug',
            '@test': 'Test',
            '@quick': 'Quick',
            '@fix': 'Fix'
        }
        mode_name = mode_names.get(mode, 'Development')

        # Extract key action verbs and nouns for requirements
        import re
        lower = description.lower()

        # Determine user type based on context
        user_type = "developer"
        if any(word in lower for word in ['user', 'customer', 'visitor']):
            user_type = "user"
        elif any(word in lower for word in ['admin', 'administrator']):
            user_type = "administrator"

        # Generate a simple user story action
        action = description.strip()
        if action.endswith('.'):
            action = action[:-1]

        # Create structured format
        structured = f"""# {title}

## Overview

{description}

## User Story

As a {user_type}
I want to {action.lower()}
So that the application functionality is improved

## Requirements

- [ ] Implement the requested functionality
- [ ] Ensure code follows existing patterns
- [ ] Add appropriate error handling
- [ ] Update related components as needed

## Acceptance Criteria

- [ ] Feature works as described
- [ ] No regressions in existing functionality
- [ ] Code is clean and maintainable
- [ ] Tests pass (if applicable)

## Technical Notes

- **Mode:** {mode_name}
- Review existing code patterns before implementing
- Consider edge cases and error scenarios"""

        return structured

    def _update_task_md(self, project: str, title: str, description: str, mode: str) -> bool:
        """Update TASK.md in the project with the new task."""
        try:
            from datetime import datetime

            project_dir = self._find_project_dir(project)
            if not project_dir:
                logger.warning(f"Project directory not found for: {project}")
                return False

            claude_dir = project_dir / ".claude"
            claude_dir.mkdir(parents=True, exist_ok=True)

            task_file = claude_dir / "TASK.md"

            # Mode name mapping
            mode_names = {
                '@explore': 'Explore',
                '@research': 'Research',
                '@plan': 'Plan',
                '@architect': 'Architect',
                '@dev': 'Development',
                '@implement': 'Implement',
                '@review': 'Review',
                '@debug': 'Debug',
                '@test': 'Test',
                '@quick': 'Quick',
                '@fix': 'Fix'
            }
            mode_name = mode_names.get(mode, 'Development')

            # Create TASK.md content
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            task_content = f"""# {title}

**Created:** {timestamp}
**Mode:** {mode_name}
**Status:** In Progress

## Description

{description}

## Acceptance Criteria

- [ ] Task completed successfully
- [ ] All tests pass
- [ ] Code reviewed

## Notes

_Task auto-generated by Smart Send_
"""

            task_file.write_text(task_content)
            logger.info(f"Updated TASK.md for project {project}: {title}")
            return True

        except Exception as e:
            logger.error(f"Failed to update TASK.md: {e}")
            return False

    def _detect_agent_mode(self, text: str) -> str:
        """Detect the best agent mode from text content."""
        lower = text.lower()

        # Check for explicit @prefix at start
        import re
        prefix_match = re.match(r'^(@\w+)\s', text)
        if prefix_match:
            prefix = prefix_match.group(1).lower()
            valid_modes = ['@explore', '@research', '@plan', '@architect', '@dev',
                          '@implement', '@review', '@debug', '@test', '@quick', '@fix']
            if prefix in valid_modes:
                return prefix

        # Debug patterns - high priority for error-related queries
        if re.search(r'\b(bug|error|fix|broken|not working|issue|debug|failing|crash|wrong|exception|stack trace|traceback)\b', lower):
            return '@debug'

        # Research/Explore patterns
        if re.match(r'^(where|what|how does|how is|which|find|search|show me|list|explore|look for|locate)\b', lower):
            return '@explore'
        if re.search(r'\b(understand|investigate|research|deep dive|explain codebase|tell me about)\b', lower):
            return '@research'

        # Plan/Design patterns
        if re.search(r'\b(plan|design|architect|approach|how should|structure|organize|layout)\b', lower):
            return '@plan'
        if re.search(r'\b(architecture|system design|high level|blueprint)\b', lower):
            return '@architect'

        # Review patterns
        if re.search(r'\b(review|check|audit|look at|examine|assess|evaluate|critique)\b', lower):
            return '@review'

        # Test patterns
        if re.search(r'\b(test|spec|coverage|verify|unit test|integration test|e2e)\b', lower):
            return '@test'

        # Development/Implementation patterns
        if re.search(r'\b(implement|add|create|build|make|write|develop|code)\b', lower):
            if re.search(r'\b(feature|page|component|system|module|service)\b', lower):
                if re.search(r'\b(now|quickly|just|please)\b', lower):
                    return '@dev'
                return '@plan'
            return '@dev'

        # Quick patterns
        if re.search(r'\b(quick|simple|small|just|only|minor)\b', lower):
            return '@quick'

        # Default: development mode for most tasks
        return '@dev'

    def _generate_title(self, text: str) -> str:
        """Generate a concise title from task text."""
        import re

        # Clean up the text
        text = text.strip()

        # If text starts with a clear action verb, use first phrase
        first_line = text.split('\n')[0].strip()

        # Remove filler words at start
        first_line = re.sub(r'^(i want to|i need to|please|can you|could you|we need to|let\'s)\s+', '', first_line, flags=re.IGNORECASE)

        # Capitalize first letter
        if first_line:
            first_line = first_line[0].upper() + first_line[1:]

        # Truncate to reasonable length for a title
        if len(first_line) > 60:
            # Try to cut at a word boundary
            truncated = first_line[:60]
            last_space = truncated.rfind(' ')
            if last_space > 30:
                truncated = truncated[:last_space]
            first_line = truncated.strip()

        # Remove trailing punctuation that looks weird in a title
        first_line = re.sub(r'[,;:]$', '', first_line)

        return first_line or "Task"

    def _get_mode_context(self, mode: str) -> str:
        """Get the context string for an agent mode."""
        contexts = {
            '@explore': '[AGENT MODE: Explore] Use the Task tool with subagent_type="Explore" to find relevant files and patterns. Focus on quick discovery.',
            '@research': '[AGENT MODE: Research] Use the Task tool with subagent_type="general-purpose" for deep research. Explore multiple angles and gather comprehensive information.',
            '@plan': '[AGENT MODE: Plan] Use the Task tool with subagent_type="Plan" to design an implementation approach. Consider architecture, file changes, and trade-offs.',
            '@architect': '[AGENT MODE: Architect] Use the Task tool with subagent_type="Plan" for architecture decisions. Focus on system design and integration points.',
            '@dev': '[AGENT MODE: Development] Full development mode. First use Explore agents to understand the codebase, then Plan agents to design the approach, then implement.',
            '@implement': '[AGENT MODE: Implement] Skip to implementation. Assume planning is done. Focus on writing code efficiently.',
            '@review': '[AGENT MODE: Review] Use the Task tool with subagent_type="general-purpose" to perform code review. Check for bugs, security issues, and improvements.',
            '@debug': '[AGENT MODE: Debug] Use debug-trace approach. Trace data flow, find root causes. Use Explore agents to locate relevant code.',
            '@test': '[AGENT MODE: Test] Focus on testing. Write tests, run existing tests, verify behavior.',
            '@quick': '[AGENT MODE: Quick] Simple task - use haiku model if available for speed. Quick lookup or small change.',
            '@fix': '[AGENT MODE: Fix] Bug fix mode. Identify the issue, find root cause, implement fix, verify.'
        }
        return contexts.get(mode, '')
