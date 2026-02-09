#!/usr/bin/env python3
"""Health monitor for Chat Relay - checks watcher status and provides feedback"""

import json
import time
import subprocess
from pathlib import Path
from datetime import datetime

QUEUE_DIR = Path(__file__).parent / ".queue"
HEARTBEAT_FILE = QUEUE_DIR / "watcher.heartbeat"
RELAY_LOG = QUEUE_DIR / "relay.log"

def check_watcher_alive(max_age_seconds=10):
    """Check if watcher is alive based on heartbeat file."""
    if not HEARTBEAT_FILE.exists():
        return False, "No heartbeat file - watcher may not be running"

    try:
        mtime = HEARTBEAT_FILE.stat().st_mtime
        age = time.time() - mtime
        if age > max_age_seconds:
            return False, f"Heartbeat stale ({int(age)}s old) - watcher may be stuck or stopped"

        with open(HEARTBEAT_FILE) as f:
            data = json.load(f)

        return True, {
            "status": "alive",
            "last_beat": datetime.fromtimestamp(data.get("timestamp", 0)).isoformat(),
            "age_seconds": round(age, 1),
            "jobs_processed": data.get("jobs_processed", 0),
            "current_job": data.get("current_job"),
            "pid": data.get("pid")
        }
    except Exception as e:
        return False, f"Error reading heartbeat: {e}"

def check_pending_jobs():
    """Check for pending jobs in queue."""
    pending = []
    processing = []

    for job_file in QUEUE_DIR.glob("*.json"):
        if job_file.name == "watcher.heartbeat":
            continue
        try:
            with open(job_file) as f:
                job = json.load(f)

            job_info = {
                "id": job.get("id", job_file.stem),
                "status": job.get("status", "unknown"),
                "age_seconds": round(time.time() - job.get("created", time.time()), 1),
                "message_preview": job.get("message", "")[:50],
                "activity": job.get("activity", "")
            }

            if job.get("status") == "pending":
                pending.append(job_info)
            elif job.get("status") == "processing":
                processing.append(job_info)
        except:
            pass

    return pending, processing

def check_watcher_process():
    """Check if watcher.py process is running."""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "watcher.py"],
            capture_output=True,
            text=True,
            timeout=5
        )
        pids = result.stdout.strip().split('\n')
        pids = [p for p in pids if p]
        return len(pids) > 0, pids
    except:
        return False, []

def full_health_check():
    """Run complete health check and return status."""
    print("=" * 60)
    print("CHAT RELAY HEALTH CHECK")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print()

    # Check watcher process
    process_running, pids = check_watcher_process()
    print(f"1. WATCHER PROCESS:")
    if process_running:
        print(f"   [OK] Running (PIDs: {', '.join(pids)})")
    else:
        print(f"   [ERROR] Not running!")
        print(f"   Start with: python3 /opt/clawd/projects/relay/watcher.py &")
    print()

    # Check heartbeat
    heartbeat_ok, heartbeat_info = check_watcher_alive()
    print(f"2. WATCHER HEARTBEAT:")
    if heartbeat_ok:
        print(f"   [OK] Last beat: {heartbeat_info['age_seconds']}s ago")
        print(f"   Jobs processed: {heartbeat_info['jobs_processed']}")
        if heartbeat_info['current_job']:
            print(f"   Currently processing: {heartbeat_info['current_job']}")
    else:
        print(f"   [WARNING] {heartbeat_info}")
    print()

    # Check queue
    pending, processing = check_pending_jobs()
    print(f"3. JOB QUEUE:")
    print(f"   Pending: {len(pending)}")
    print(f"   Processing: {len(processing)}")

    for job in processing:
        print(f"   -> [{job['id']}] {job['activity'] or 'Working...'} ({job['age_seconds']}s)")

    for job in pending:
        print(f"   [!] [{job['id']}] Waiting ({job['age_seconds']}s) - {job['message_preview']}...")
    print()

    # Overall status
    print("=" * 60)
    if process_running and heartbeat_ok:
        print("OVERALL: [HEALTHY] System is working normally")
    elif process_running and not heartbeat_ok:
        print("OVERALL: [WARNING] Watcher running but heartbeat stale - may be stuck")
    else:
        print("OVERALL: [ERROR] Watcher not running - messages won't be processed!")
    print("=" * 60)

    return {
        "healthy": process_running and heartbeat_ok,
        "watcher_running": process_running,
        "heartbeat_ok": heartbeat_ok,
        "pending_jobs": len(pending),
        "processing_jobs": len(processing)
    }

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--json":
        # JSON output for programmatic use
        result = {
            "timestamp": time.time(),
            "watcher_process": check_watcher_process(),
            "heartbeat": check_watcher_alive(),
            "queue": check_pending_jobs()
        }
        print(json.dumps(result, indent=2))
    else:
        full_health_check()
