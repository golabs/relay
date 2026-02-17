"""Configuration constants and paths for the relay system."""

import os
from pathlib import Path

# Base directories
RELAY_DIR = Path(__file__).parent.parent
TEMPLATES_DIR = Path(__file__).parent / "templates"

# Multi-instance support via environment variables
# RELAY_USER: which user this instance serves (default: axion)
# RELAY_PORT: which port to listen on (default: 7786)
RELAY_USER = os.environ.get("RELAY_USER", "axion")
RELAY_PORT = int(os.environ.get("RELAY_PORT", "7786"))

# User-specific directories: .queue-{user}/, .history-{user}/, etc.
# Default user (axion) uses the original directory names for backward compatibility
def _user_dir(base_name):
    """Get user-specific directory path. Axion uses original names for compat."""
    if RELAY_USER == "axion":
        return RELAY_DIR / base_name
    return RELAY_DIR / f"{base_name}-{RELAY_USER}"

QUEUE_DIR = _user_dir(".queue")
HISTORY_DIR = _user_dir(".history")
SCREENSHOTS_DIR = _user_dir(".screenshots")
TEMP_DIR = _user_dir(".temp")

# Projects directory - scan for available projects
PROJECTS_DIR = Path("/opt/clawd/projects")

# Multi-user configuration
# Users dict: username -> display name
USERS = {
    "axion": "Axion",      # Admin user (a28m2t2xu8go4a0qgblz7xxze)
    "xfg6gb": "XFG",       # Second user
}

# User-specific port assignments
USER_PORTS = {
    "axion": 7786,
    "xfg6gb": 6001,
}

# User-specific input panel names (the text input panel)
USER_INPUT_PANEL_NAMES = {
    "axion": "BRETT",
    "xfg6gb": "Hudson",
}

# Admin users can see ALL projects across all users
ADMIN_USERS = ["axion"]

# Default user when none is selected
DEFAULT_USER = "axion"

# Shared projects visible to all users (from PROJECTS_DIR root)
SHARED_PROJECTS = ["relay", "general"]

# Per-user project directories: /opt/clawd/projects/{username}/
# Admin also sees projects in PROJECTS_DIR root (legacy projects)
def get_user_projects_dir(username):
    """Get the projects directory for a specific user."""
    return PROJECTS_DIR / username

# Axion outbox for sending messages to UI
AXION_OUTBOX = QUEUE_DIR / "AXION_OUTBOX.json"

# Ensure directories exist
QUEUE_DIR.mkdir(exist_ok=True)
HISTORY_DIR.mkdir(exist_ok=True)
SCREENSHOTS_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

# Server configuration
# Port is determined by RELAY_PORT env var, defaulting to 7786 (axion)
# See /opt/clawd/projects/PORT_ASSIGNMENTS.md for full port assignments.
# axion: 7786, xfg6gb: 6001
DEFAULT_PORT = RELAY_PORT

# Cache configuration
# Set to False to always serve fresh HTML/JS/CSS (useful during development)
HTML_CACHE_ENABLED = False
API_CACHE_HEADERS = {
    "/api/projects": "no-cache",  # Always fresh
    "/api/health": "no-cache",
    "/api/screenshots": "no-cache",  # Always fresh
    "/screenshots/": "max-age=3600",  # 1 hour for images (they don't change)
}

# Polling configuration (defaults, can be overridden in JS)
POLLING_CONFIG = {
    "job_status_initial_ms": 1000,
    "job_status_max_ms": 3000,
    "axion_messages_ms": 5000,
    "health_check_ms": 5000,
}

# Watcher configuration
HEARTBEAT_FILE = QUEUE_DIR / "watcher.heartbeat"
MAX_JOB_RUNTIME_SECONDS = 30 * 60  # 30 minutes max per job
PROCESS_CHECK_INTERVAL = 0.5  # seconds

# Session caching
SESSION_CACHE_TTL_SECONDS = 30

# Old job cleanup configuration
OLD_JOB_CLEANUP_ENABLED = True
OLD_JOB_CLEANUP_INTERVAL_SECONDS = 3600  # Run cleanup every hour
OLD_JOB_AGE_DAYS = 3  # Delete jobs older than 3 days
OLD_QUESTIONS_AGE_DAYS = 2  # Delete stuck questions older than 2 days
OLD_LOCK_AGE_DAYS = 1  # Delete orphaned lock files older than 1 day
