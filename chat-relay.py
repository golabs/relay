#!/usr/bin/env python3
"""
Chat Relay - Simple two-panel chat relay for Claude CLI

This is the entry point for the modular relay system.
The actual implementation is in the relay/ package:
  - relay/config.py      - Configuration and constants
  - relay/server.py      - HTTP server with caching
  - relay/api_handlers.py - API endpoint handlers
  - relay/utils.py       - Utility functions
  - relay/templates/     - HTML, CSS, JS templates
"""

import sys
import os

# Add the relay package directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from relay.server import main

if __name__ == "__main__":
    main()
