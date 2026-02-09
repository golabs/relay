# Pre-Flight Checks

Run pre-flight checks before starting any development task. This command adapts to the project's detected technology stack.

## Prerequisites

First, check if `.claude/STACK.md` exists and has been configured. If not, run `/discover-stack` first.

If STACK.md shows `{not detected}` for Primary Language, prompt the user:
> "Project stack hasn't been detected yet. Would you like me to run `/discover-stack` first?"

## Dynamic Check Execution

Read `.claude/STACK.md` and execute checks based on detected technologies. Skip sections for tools not detected.

---

## 1. Type Checking (if detected)

### TypeScript Projects
If TypeScript detected with type-check command in STACK.md:
```bash
{type-check command from STACK.md}
```
**Expected:** No TypeScript errors (exit code 0)

### Python Projects (mypy)
If mypy detected:
```bash
{mypy command from STACK.md}
```
**Expected:** No type errors

---

## 2. Linting (if detected)

### ESLint
If ESLint detected:
```bash
{eslint command from STACK.md}
```
**Expected:** No ESLint errors or warnings

### Ruff
If Ruff detected:
```bash
{ruff command from STACK.md}
```
**Expected:** No linting errors

### Other Linters
Execute any other detected linters (Flake8, Pylint, Biome) using their commands from STACK.md.

---

## 3. Formatting Check (if detected)

### Prettier
If Prettier detected:
```bash
npx prettier --check .
```
**Expected:** All files formatted correctly

### Black
If Black detected:
```bash
black --check .
```
**Expected:** All files formatted correctly

---

## 4. Dependency Health

### Node.js Projects
If Node.js detected:
```bash
npm ls --depth=0 2>&1 | head -20
```
**Expected:** No missing or invalid dependencies

### Python Projects
If Python detected with uv:
```bash
uv pip check
```
Or with pip:
```bash
pip check
```
**Expected:** No dependency conflicts

---

## 5. Database Checks (if detected)

### Prisma
If Prisma detected:
```bash
npx prisma validate
```
**Expected:** Schema is valid

Check for multiple .db files:
```bash
find . -name "*.db" -type f 2>/dev/null | grep -v node_modules
```
**Expected:** Only expected database files present

### SQLAlchemy/Alembic
If Alembic detected:
```bash
alembic check
```
**Expected:** No pending migrations

---

## 6. Environment Check

Check for required environment files based on detected stack:
- If `.env.example` exists, verify `.env` exists
- If DATABASE_URL is expected, verify it's configured

---

## 7. Server Health (optional)

If dev servers appear to be running, check health endpoints:

### Backend
```bash
curl -s http://localhost:{detected-port}/health || echo "Backend not running (OK if starting fresh)"
```

### Frontend
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:{detected-port}/ || echo "Frontend not running (OK if starting fresh)"
```

---

## 8. Summary Report

After all checks complete, provide a summary based on what was actually checked:

```markdown
## Pre-Flight Check Results

| Check | Status | Notes |
|-------|--------|-------|
| Type Check | PASS/FAIL/SKIP | {tool used or "not configured"} |
| Linting | PASS/FAIL/SKIP | {tool used or "not configured"} |
| Formatting | PASS/FAIL/SKIP | {tool used or "not configured"} |
| Dependencies | PASS/FAIL/SKIP | {package manager} |
| Database | PASS/FAIL/SKIP | {database tool or "none detected"} |
| Environment | PASS/FAIL/SKIP | |
| Server Health | PASS/FAIL/SKIP | |

### Overall Status: READY / NOT READY

[If NOT READY, list specific issues to fix before proceeding]
```

---

## Quick Fix Commands

Based on detected stack, suggest relevant fixes:

### Node.js Projects
```bash
# Reinstall dependencies
rm -rf node_modules && npm install

# Fix linting issues
npm run lint -- --fix

# Fix formatting
npx prettier --write .
```

### Python Projects
```bash
# Reinstall dependencies (uv)
uv sync

# Reinstall dependencies (pip)
pip install -r requirements.txt

# Fix linting (ruff)
ruff check --fix .

# Fix formatting (black)
black .
```

### Prisma Projects
```bash
# Regenerate client
npx prisma generate

# Apply migrations
npx prisma migrate dev
```

---

## When to Use

Run `/preflight` before:
- Starting any new task
- After pulling new code
- After dependency changes
- When something "feels wrong"
- Before starting development servers
