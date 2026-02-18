#!/bin/bash
kill $(cat /opt/clawd/projects/relay/.queue/watcher.pid 2>/dev/null) 2>/dev/null
pkill -f "python3.*/watcher.py" 2>/dev/null
sleep 3
echo done