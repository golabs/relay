"""Utility functions for the relay system."""

import json
import os
import fcntl
import tempfile
import hashlib
import logging
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


def atomic_write_json(filepath: Path, data: dict) -> None:
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


def atomic_write_text(filepath: Path, content: str) -> None:
    """Write text atomically using temp file + rename."""
    temp_fd, temp_path = tempfile.mkstemp(dir=filepath.parent, suffix='.tmp')
    try:
        with os.fdopen(temp_fd, 'w') as f:
            f.write(content)
        os.rename(temp_path, filepath)
    except Exception as e:
        logger.error(f"atomic_write_text failed for {filepath}: {e}")
        try:
            os.unlink(temp_path)
        except:
            pass
        raise


def lock_file(filepath: Path, exclusive: bool = True):
    """Acquire a file lock. Returns file handle (caller must close)."""
    lock_path = filepath.with_suffix(filepath.suffix + '.lock')
    f = open(lock_path, 'w')
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        return f
    except Exception as e:
        f.close()
        raise


def unlock_file(lock_handle) -> None:
    """Release a file lock."""
    if lock_handle:
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
            lock_handle.close()
        except Exception as e:
            logger.warning(f"unlock_file error: {e}")


def compute_etag(content: bytes) -> str:
    """Compute an ETag for content using MD5 hash."""
    return hashlib.md5(content).hexdigest()[:16]


def safe_json_load(filepath: Path, default: Any = None) -> Any:
    """Safely load JSON from a file, returning default on error."""
    if not filepath.exists():
        return default
    try:
        with open(filepath) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"Failed to load JSON from {filepath}: {e}")
        return default


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text."""
    import re
    text = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)  # CSI sequences
    text = re.sub(r'\x1b\][^\x07]*\x07', '', text)     # OSC sequences ending with BEL
    text = re.sub(r'\x1b\][^\x1b]*\x1b\\', '', text)   # OSC sequences ending with ST
    text = re.sub(r'\x1b[PX^_][^\x1b]*\x1b\\', '', text)  # DCS, SOS, PM, APC
    text = re.sub(r'\x1b[\x40-\x5F]', '', text)        # Fe escape sequences
    text = re.sub(r'\x1b.', '', text)                  # Any remaining escapes
    text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F]', '', text)  # Control chars except newlines/tabs
    text = re.sub(r'\x1b\[?[0-9;]*$', '', text)        # Partial escapes at end
    text = re.sub(r'<[a-z]$', '', text)
    return text.strip()


class SessionCache:
    """Cache for session mappings with TTL."""

    def __init__(self, ttl_seconds: int = 30):
        self.ttl = ttl_seconds
        self._cache: Dict[str, str] = {}
        self._cache_time: float = 0

    def get(self, project: str) -> Optional[str]:
        """Get cached session ID for a project, or None if expired/missing."""
        import time
        if time.time() - self._cache_time > self.ttl:
            return None
        return self._cache.get(project)

    def set(self, project: str, session_id: str) -> None:
        """Cache a session ID for a project."""
        import time
        self._cache[project] = session_id
        self._cache_time = time.time()

    def invalidate(self) -> None:
        """Invalidate the entire cache."""
        self._cache = {}
        self._cache_time = 0

    def reload(self, sessions: Dict[str, str]) -> None:
        """Reload the cache with new session data."""
        import time
        self._cache = sessions.copy()
        self._cache_time = time.time()
