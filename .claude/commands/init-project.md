# Initialize Project

Set up a new project with ClaudeMax and start the development environment.

## Phase 1: Stack Discovery

First, run automatic stack detection to understand the project:

```
Run /discover-stack
```

This will:
- Detect languages, frameworks, and tools
- Generate `.claude/STACK.md` with project configuration
- Identify available commands for build, test, lint, etc.

---

## Phase 2: Dependency Installation

Based on detected stack, install dependencies:

### Node.js Projects
If package.json detected:
```bash
npm install
# or yarn install / pnpm install based on lock file
```

For monorepos with workspaces:
```bash
npm install  # at root - installs all workspace deps
```

For separate frontend/backend:
```bash
npm install && cd backend && npm install && cd ..
# or
cd frontend && npm install && cd ../backend && npm install && cd ..
```

### Python Projects
If pyproject.toml or requirements.txt detected:

With uv (preferred):
```bash
uv sync
```

With pip:
```bash
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

With poetry:
```bash
poetry install
```

---

## Phase 3: Environment Setup

### Check for Environment Templates
If `.env.example` or `.env.template` exists:
```bash
cp .env.example .env
```
Then prompt user to fill in required values.

### Database Setup
Based on detected database:

**Prisma:**
```bash
npx prisma generate
npx prisma migrate dev
```

**Alembic:**
```bash
alembic upgrade head
```

**SQLite:**
Usually auto-created on first run, no action needed.

---

## Phase 4: Build Verification

Run a quick build to verify setup:

### TypeScript Projects
```bash
{type-check command from STACK.md}
```

### Python Projects
```bash
{mypy command from STACK.md if available}
```

---

## Phase 5: Start Development Servers

Based on detected stack, start development servers:

### Single Server Projects
```bash
{dev command from STACK.md}
```

### Frontend + Backend Projects
Start in separate terminals or background:

**Terminal 1 - Backend:**
```bash
{backend dev command}
```

**Terminal 2 - Frontend:**
```bash
{frontend dev command}
```

---

## Phase 6: Validate Setup

Run preflight checks to verify everything is working:

```
Run /preflight
```

If all checks pass, the project is ready for development.

---

## Quick Reference

After initialization, display the key information:

```markdown
## Project Initialized Successfully

### Detected Stack
- **Language:** {from STACK.md}
- **Framework:** {from STACK.md}
- **Package Manager:** {from STACK.md}

### Key Commands
| Action | Command |
|--------|---------|
| Dev Server | {from STACK.md} |
| Build | {from STACK.md} |
| Test | {from STACK.md} |
| Lint | {from STACK.md} |

### Access Points
{List URLs based on detected ports}

### Next Steps
1. Review `.claude/STACK.md` for detected configuration
2. Run `/preflight` to verify environment health
3. Start coding!
```

---

## Troubleshooting

### Dependencies Failed to Install
- Check for correct Node.js/Python version
- Try clearing caches: `rm -rf node_modules` or `rm -rf .venv`
- Check for conflicting global packages

### Database Setup Failed
- Verify DATABASE_URL in .env
- Check that database service is running (for PostgreSQL, MySQL)
- For SQLite, ensure directory is writable

### Build Failed
- Run `/preflight` to identify specific issues
- Check STACK.md for correct commands
- Verify all peer dependencies are installed

---

## Manual Override

If auto-detection missed something, manually edit `.claude/STACK.md` to:
- Add missing tools or frameworks
- Correct detected commands
- Add project-specific notes

Re-run `/discover-stack` to refresh detection while preserving manual edits in the Notes section.
