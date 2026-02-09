#!/usr/bin/env python3
"""Auto-restart chat-relay.py when it changes - allows browser refresh to get updates"""

import os
import sys
import time
import subprocess
import signal
from pathlib import Path

RELAY_SCRIPT = Path(__file__).parent / "chat-relay.py"
CHECK_INTERVAL = 1  # seconds

def get_mtime(path):
    """Get modification time of a file."""
    try:
        return path.stat().st_mtime
    except:
        return 0

def start_server():
    """Start the relay server."""
    return subprocess.Popen(
        [sys.executable, str(RELAY_SCRIPT)],
        cwd=RELAY_SCRIPT.parent
    )

def main():
    print(f"🔄 Server watcher started - monitoring {RELAY_SCRIPT.name}")
    print("   Server will auto-restart on file changes. Just refresh your browser!")

    server = start_server()
    last_mtime = get_mtime(RELAY_SCRIPT)

    try:
        while True:
            time.sleep(CHECK_INTERVAL)

            current_mtime = get_mtime(RELAY_SCRIPT)
            if current_mtime > last_mtime:
                print(f"\n🔁 {RELAY_SCRIPT.name} changed - restarting server...")
                last_mtime = current_mtime

                # Kill old server
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()

                # Start new server
                time.sleep(0.5)  # Brief pause
                server = start_server()
                print("✅ Server restarted - refresh your browser!")

            # Check if server died unexpectedly
            if server.poll() is not None:
                print("\n⚠️ Server died - restarting...")
                server = start_server()

    except KeyboardInterrupt:
        print("\n👋 Stopping server watcher...")
        server.terminate()
        server.wait()
        print("Done")

if __name__ == "__main__":
    main()
