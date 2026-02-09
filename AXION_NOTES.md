# Relay - Axion's Notes

## Project Overview
Voice/text communication interface between Brett and Axion. Allows thoughtful, pauseable conversations for development work.

## Key Dates
- **2026-01-27**: Set up as systemd service on port 7785

## Setup
- **Service**: `relay.service` (systemd, auto-starts on boot)
- **Port**: 7785 (fixed for Brett's SSH tunnels)
- **API**: Calls Clawdbot's /v1/chat/completions directly

## Recent Changes
- 2026-01-27: Added "🤔 Thinking..." animation with pulsing dots
- 2026-01-27: Better error messages
- 2026-01-27: Changed port from 8888 to 7785

## Architecture
- Single Python file (`relay.py`)
- HTTP server with embedded HTML/JS frontend
- Voice recognition (Web Speech API)
- Polls RESPONSE.md for updates
- Direct API calls for instant responses

## Known Issues
- ~3-4 second response time is normal (LLM processing)
- SSH tunnel required for remote access

## Decisions & Context
- Brett prefers Relay for thoughtful dev work, WhatsApp for quick stuff
- Heartbeat polling removed - using direct API calls instead

---
*Last updated: 2026-01-27*
