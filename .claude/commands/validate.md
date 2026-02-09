Run comprehensive validation of the HubAI project.

Execute the following commands in sequence and report results:

## 1. Frontend TypeScript Check

```bash
npm run type-check
```

**Expected:** No TypeScript errors (exit code 0)

## 2. Frontend Build

```bash
npm run build
```

**Expected:** Build completes successfully, outputs to `dist/` directory

## 3. Backend TypeScript Check

```bash
cd backend && npm run type-check
```

**Expected:** No TypeScript errors (exit code 0)

## 4. Backend Lint Check

```bash
cd backend && npm run lint
```

**Expected:** No ESLint errors or warnings

## 5. Backend Build

```bash
cd backend && npm run build
```

**Expected:** Build completes successfully, outputs to `backend/dist/` directory

## 6. Backend Unit Tests

```bash
cd backend && npm run test
```

**Expected:** All tests pass

## 7. Check for Database Issues

```bash
dir /s /b backend\*.db 2>nul || find backend -name "*.db" -type f 2>/dev/null
```

**Expected:** Only ONE database file at `backend/prisma/dev.db`

If multiple .db files found:
- STOP and alert the user
- Check DATABASE_URL uses absolute path

## 8. Playwright E2E Tests (If Servers Running)

```bash
npx playwright test tests/verify-app-health.spec.ts --reporter=list
```

**Expected:** All tests pass

**Note:** Requires frontend (localhost:5173) and backend (localhost:3001) to be running.

If servers not running, skip this step and note it in the report.

## 9. Summary Report

After all validations complete, provide a summary:

```markdown
## HubAI Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Frontend TypeScript | PASS/FAIL | |
| Frontend Build | PASS/FAIL | |
| Backend TypeScript | PASS/FAIL | |
| Backend Lint | PASS/FAIL | |
| Backend Build | PASS/FAIL | |
| Backend Tests | PASS/FAIL | X passed, Y failed |
| Database Files | PASS/FAIL | Count: X |
| Playwright E2E | PASS/FAIL/SKIP | |

### Overall Status: READY / NOT READY

[If NOT READY, list issues to fix before proceeding]
```

## Quick Fix Commands

If issues found:

```bash
# Regenerate Prisma client
cd backend && npm run prisma:generate

# Clear and rebuild frontend
npm run clean && npm install && npm run build

# Clear and rebuild backend
cd backend && rm -rf dist node_modules && npm install && npm run build

# Kill port conflicts
npx kill-port 3001 5173

# Reset database (CAUTION: loses data)
cd backend && rm prisma/dev.db && npm run prisma:migrate -- --name reset && npm run prisma:seed
```

## When to Use

Run `/validate` before:
- Creating a commit
- After implementing a feature
- After fixing a bug
- Before code review
- When something "feels wrong"
