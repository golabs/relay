# Create Git Commit

Create a commit. Only push if user explicitly requests it.

## Prerequisites

Before committing, ensure:
1. `/validate` has passed
2. `/code-review` has passed (no unresolved issues)

## Step 1: Review Changes

```bash
git status
git diff --stat HEAD
```

Review what will be committed.

## Step 2: Stage Files

```bash
# Stage specific files (PREFERRED)
git add path/to/file1.ts path/to/file2.ts

# Or stage all tracked changes
git add -u

# Or stage everything (use cautiously)
git add .
```

**NEVER commit:** `.env`, credentials, secrets, `node_modules/`

## Step 3: Create Commit

Use conventional commit format:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <short description>

<longer description if needed>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### Commit Types

| Type | Use For |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Code restructure |
| `chore` | Build/deps/tooling |
| `test` | Tests |

## Step 4: Push to Remote (ONLY IF REQUESTED)

**⚠️ IMPORTANT: Do NOT push automatically. Only push if user explicitly asks.**

If user explicitly requests push (e.g., "commit and push", "push it", "push to remote"):

```bash
# Get current branch
BRANCH=$(git branch --show-current)

# Push to origin
git push origin $BRANCH
```

**Safety rules:**
- ⛔ NEVER push automatically without user request
- ⛔ NEVER `git push --force` to main/master
- ✅ Only push when user explicitly asks
- ✅ Always verify branch before push

## Step 5: Confirm Success

After commit and push, **ALWAYS display this confirmation block**:

```
═══════════════════════════════════════════════════════════
  ✅ COMMIT AND PUSH SUCCESSFUL
═══════════════════════════════════════════════════════════

  Commit:  <commit-hash> <commit-message-first-line>
  Branch:  <branch-name>
  Remote:  origin/<branch-name>

  Files changed: <count>
  Insertions:    +<count>
  Deletions:     -<count>

═══════════════════════════════════════════════════════════
```

## Pre-Commit Hook Failures

If hooks fail:
1. Read the error message
2. Fix the issue (don't use `--no-verify`)
3. Re-stage files: `git add .`
4. Create NEW commit (never `--amend` after hook failure)

## Summary Checklist

- [ ] `/validate` passed
- [ ] `/code-review` passed
- [ ] Files staged (no secrets)
- [ ] Conventional commit format
- [ ] Co-Authored-By footer included
- [ ] Pushed to remote **ONLY if user explicitly requested**
- [ ] Confirmation displayed to user
