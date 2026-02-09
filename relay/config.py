"""Configuration constants and paths for the relay system."""

import os
from pathlib import Path

# Base directories
RELAY_DIR = Path(__file__).parent.parent
QUEUE_DIR = RELAY_DIR / ".queue"
HISTORY_DIR = RELAY_DIR / ".history"
SCREENSHOTS_DIR = RELAY_DIR / ".screenshots"
TEMP_DIR = RELAY_DIR / ".temp"
TEMPLATES_DIR = Path(__file__).parent / "templates"

# Projects directory - scan for available projects
PROJECTS_DIR = Path("/opt/clawd/projects")

# Axion outbox for sending messages to UI
AXION_OUTBOX = QUEUE_DIR / "AXION_OUTBOX.json"

# Ensure directories exist
QUEUE_DIR.mkdir(exist_ok=True)
HISTORY_DIR.mkdir(exist_ok=True)
SCREENSHOTS_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

# Server configuration
# CRITICAL: Relay MUST ALWAYS run on port 7786. NO EXCEPTIONS.
# See /opt/clawd/projects/PORT_ASSIGNMENTS.md for full port assignments.
DEFAULT_PORT = 7786  # DO NOT CHANGE THIS VALUE

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
