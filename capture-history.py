#!/usr/bin/env python3
"""
Hook script to capture terminal Claude conversations into relay history.
Called as a Claude Code 'Stop' hook.

Receives via stdin: JSON with session info including transcript_path
"""

import json
import os
import sys
import time
from pathlib import Path

# Relay history location
RELAY_HISTORY_DIR = Path("/opt/clawd/projects/relay/.history")
PROJECTS_BASE = Path("/opt/clawd/projects")

def get_project_from_cwd(cwd: str = None):
    """Determine project name from working directory."""
    if cwd:
        cwd_path = Path(cwd)
    else:
        cwd_path = Path.cwd()

    # Check if we're in a project directory
    cwd_str = str(cwd_path)
    projects_str = str(PROJECTS_BASE)

    if cwd_str.startswith(projects_str):
        # Get the project name (first component after /opt/clawd/projects/)
        try:
            relative = cwd_path.relative_to(PROJECTS_BASE)
            parts = relative.parts
            if parts:
                return parts[0]
        except ValueError:
            pass

    # Check if cwd name matches a project
    if PROJECTS_BASE.exists():
        for project_dir in PROJECTS_BASE.iterdir():
            if project_dir.is_dir() and project_dir.name.lower() == cwd_path.name.lower():
                return project_dir.name

    return None

def read_transcript(transcript_path: str):
    """Read the Claude conversation transcript file (JSONL format)."""
    messages = []
    try:
        with open(transcript_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        msg = json.loads(line)
                        messages.append(msg)
                    except json.JSONDecodeError:
                        pass
    except Exception as e:
        pass
    return messages

def extract_last_exchange(messages):
    """Extract the last user message and assistant response."""
    last_user = None
    last_assistant = None

    # Walk backwards through messages
    for msg in reversed(messages):
        msg_type = msg.get("type")
        role = msg.get("role")

        # Handle different message formats
        if msg_type == "assistant" or role == "assistant":
            if last_assistant is None:
                content = msg.get("content") or msg.get("message", {}).get("content", [])
                if isinstance(content, list):
                    text_parts = []
                    for c in content:
                        if isinstance(c, dict) and c.get("type") == "text":
                            text_parts.append(c.get("text", ""))
                        elif isinstance(c, str):
                            text_parts.append(c)
                    last_assistant = "\n".join(text_parts).strip()
                elif isinstance(content, str):
                    last_assistant = content.strip()

        elif msg_type == "human" or role == "user":
            if last_user is None:
                content = msg.get("content") or msg.get("message", {}).get("content", [])
                if isinstance(content, list):
                    text_parts = []
                    for c in content:
                        if isinstance(c, dict) and c.get("type") == "text":
                            text_parts.append(c.get("text", ""))
                        elif isinstance(c, str):
                            text_parts.append(c)
                    last_user = "\n".join(text_parts).strip()
                elif isinstance(content, str):
                    last_user = content.strip()

        if last_user and last_assistant:
            break

    return last_user, last_assistant

def save_to_history(project: str, user_msg: str, assistant_msg: str):
    """Save conversation entry to relay history."""
    RELAY_HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    history_file = RELAY_HISTORY_DIR / f"{project}.json"

    # Load existing history
    if history_file.exists():
        try:
            with open(history_file) as f:
                data = json.load(f)
        except:
            data = {"entries": []}
    else:
        data = {"entries": []}

    # Check if this exact entry already exists (avoid duplicates)
    for entry in data.get("entries", [])[-5:]:  # Check last 5 entries
        if entry.get("user") == user_msg and entry.get("assistant") == assistant_msg:
            return False  # Already saved

    # Add new entry
    entry = {
        "user": user_msg,
        "assistant": assistant_msg,
        "timestamp": time.time(),
        "source": "terminal"  # Mark as coming from terminal, not relay panel
    }
    data["entries"].append(entry)

    # Save
    with open(history_file, "w") as f:
        json.dump(data, f, indent=2)

    return True

def main():
    # Read hook input from stdin
    try:
        hook_input = sys.stdin.read()
        if hook_input:
            hook_data = json.loads(hook_input)
        else:
            hook_data = {}
    except:
        hook_data = {}

    # Get working directory from hook data
    cwd = hook_data.get("cwd")

    # Get project from working directory
    project = get_project_from_cwd(cwd)
    if not project:
        # Not in a project directory, skip silently
        sys.exit(0)

    # Get transcript path
    transcript_path = hook_data.get("transcript_path")
    if not transcript_path:
        sys.exit(0)

    # Expand ~ in path
    transcript_path = os.path.expanduser(transcript_path)

    if not os.path.exists(transcript_path):
        sys.exit(0)

    # Read transcript
    messages = read_transcript(transcript_path)
    if not messages:
        sys.exit(0)

    # Extract last exchange
    last_user, last_assistant = extract_last_exchange(messages)

    if last_user and last_assistant:
        # Only save if both exist and have content
        if len(last_user) > 0 and len(last_assistant) > 0:
            save_to_history(project, last_user, last_assistant)

    sys.exit(0)

if __name__ == "__main__":
    main()
