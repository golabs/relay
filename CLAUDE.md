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

## Smart Workflow Automation (Human-in-the-Loop)

### Overview
Relay uses intelligent skill orchestration with human approval checkpoints. The system automatically selects appropriate skill workflows based on task patterns, executes autonomously where safe, and requires human approval at critical decision points.

### Workflow Pattern Detection

#### Bug Fix Pattern
**Keywords**: "bug", "broken", "error", "failing", "fix", "crash", "issue"
**Auto-Selected Workflow**:
1. `systematic-debugging` - Find root cause
2. `test-driven-development` - Write test + implement fix
3. `verification-before-completion` - Prove it works

**Checkpoints**:
- After root cause analysis (review findings)
- After implementation (review changes)
- Before commit (final approval)

#### Feature Development Pattern
**Keywords**: "add", "create", "build", "implement", "feature", "functionality"
**Auto-Selected Workflow**:
1. `brainstorming` - Understand requirements
2. `plan-feature` - Design approach
3. `test-driven-development` - Implement with tests
4. `verification-before-completion` - Validate functionality

**Checkpoints**:
- After design (approve architecture)
- After implementation (review code)
- Before commit (final approval)

#### Security-Critical Pattern
**Keywords**: "auth", "login", "security", "password", "token", "permissions"
**Auto-Selected Workflow**:
1. `brainstorming` - Security requirements analysis
2. `security-scan` - Current security assessment
3. `plan-feature` - Secure architecture design
4. `test-driven-development` - Implement with tests
5. `security-scan` - Post-implementation scan
6. `verification-before-completion` - Security validation

**Checkpoints**:
- After security analysis (review findings)
- After design (approve security approach)
- After implementation (review code)
- After security scan (review vulnerabilities)
- Before commit (final approval)

#### Code Quality Pattern
**Keywords**: "review", "refactor", "improve", "optimize", "clean"
**Auto-Selected Workflow**:
1. `code-review` - Analyze current code
2. `refactor` - Make improvements (if needed)
3. `verification-before-completion` - Ensure no regressions

**Checkpoints**:
- After review (approve refactoring plan)
- After refactoring (review changes)
- Before commit (final approval)

### Human-in-the-Loop Principles

1. **Smart Defaults** - System makes technical decisions autonomously based on codebase analysis
2. **Human Approval** - Nothing permanent (commits, deployments) happens without approval
3. **Transparent Execution** - Detailed progress reports at each checkpoint
4. **Safe Automation** - Skills execute autonomously but pause at critical decision points
5. **Course Correction** - User can modify approach at any checkpoint

### Using Smart Orchestration

**Simple Usage**:
```
/orchestrate Fix the authentication bug in login.py
```

System automatically:
- Detects it's a bug fix task
- Selects: systematic-debugging → test-driven-development → verification-before-completion
- Presents workflow for approval
- Executes with checkpoints for review

**No Questions Needed**:
- Task pattern detection is automatic
- Workflow selection uses smart defaults
- Technical decisions made autonomously
- Human approval only at checkpoints (plan, implementation, commit)

### Async Work Support

You can submit tasks and close your browser:
- System continues execution autonomously
- Pauses at approval checkpoints
- Saves detailed reports of all work done
- When you return, review and approve at checkpoints

This enables true async productivity while maintaining quality and control.
