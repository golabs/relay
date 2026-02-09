# Relay - Claude Instructions

## CRITICAL: Port Assignment

**Relay MUST ALWAYS run on port 7786. NO EXCEPTIONS.**

```
Relay Server Port: 7786
Preview Server Port: 8800
```

When starting or restarting Relay, use:
```bash
python3 relay.py server -p 7786
```

NEVER use any other port (7787, 7788, etc.) for the Relay server.

See `/opt/clawd/projects/PORT_ASSIGNMENTS.md` for the complete port assignment table for all projects.

## Project Overview

Relay is the central chat interface and orchestration layer for Claude AI interactions. It provides:
- Web-based chat interface
- Skills panel with documentation
- Voice input/output capabilities
- Project management
- Git integration
- Screenshot capture and display

## Key Directories

- `relay/` - Main Python server code
- `relay/templates/` - Frontend HTML, CSS, JS
- `.claude/commands/` - Skill command definitions
- `.claude/skills/` - Detailed skill implementations

## Running the Server

```bash
cd /opt/clawd/projects/relay
python3 relay.py server -p 7786
```

## API Endpoints

All API endpoints are prefixed with `/api/`:
- `/api/health` - Health check
- `/api/chat/start` - Start chat session
- `/api/skills` - List available skills
- `/api/skills/info` - Get skill details

## Important Files

- `relay/server.py` - Main HTTP server
- `relay/api_handlers.py` - API endpoint implementations
- `relay/config.py` - Configuration settings
- `relay/templates/app.js` - Frontend JavaScript
- `relay/templates/styles.css` - UI styling
