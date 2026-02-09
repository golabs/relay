# Claude Development Workflow - Master Guide

## Overview

This document connects all Claude commands into a comprehensive development workflow.
Copy this entire `.claude/` folder to any project for a complete Claude system.

**All workflow files are now in `.claude/` for portability.**

---

## IMPORTANT: Claude Runs Commands Automatically

**User only needs to:**
1. Run `/explain` to start a task
2. Say **"Proceed with implementation"** when ready

**Claude AUTOMATICALLY executes:**
- `/preflight` at the START of /explain
- `/validate` after implementation
- `/code-review` after validation passes
- `/commit` after review passes (includes push)

**User does NOT manually run:** /preflight, /validate, /code-review, or /commit
Claude handles the entire workflow automatically.

---

## The Development Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEVELOPMENT LIFECYCLE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│   │ PREFLIGHT│───▶│  EXPLAIN │───▶│   PLAN   │───▶│ EXECUTE  │     │
│   │ /preflight│    │ explain  │    │ /plan-   │    │ /execute │     │
│   │          │    │ .md      │    │  feature │    │          │     │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│        │                                                │            │
│        │         ┌──────────────────────────────────────┘            │
│        │         ▼                                                   │
│        │    ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│        │    │ VALIDATE │───▶│  REVIEW  │───▶│  COMMIT  │           │
│        │    │ /validate│    │ /code-   │    │ /commit  │           │
│        │    │          │    │  review  │    │          │           │
│        │    └──────────┘    └──────────┘    └──────────┘           │
│        │         │                                                   │
│        │         ▼ (if issues found)                                │
│        │    ┌──────────┐                                            │
│        └───▶│  DEBUG   │                                            │
│             │ /debug-  │                                            │
│             │  trace   │                                            │
│             └──────────┘                                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: PREFLIGHT (Automatic at Start)

**Command:** `/preflight` - **Claude runs this automatically**

**When:** Automatically at the start of `/explain`

**What it does:**
- Checks TypeScript compilation (frontend + backend)
- Runs linting
- Verifies database file integrity
- Confirms environment is healthy

**Output:** READY / NOT READY status

```bash
# Commands Claude runs:
npm run type-check && cd backend && npm run type-check && npm run lint
```

**User does NOT need to run /preflight manually.**

---

## Phase 2: EXPLAIN (Understand Before Coding)

**Command:** `/explain`

**When:** Before implementing any feature or fix

**What it does:**
- Forces EXPLAIN_ONLY mode (no coding yet)
- Spawns sub-agents to gather real data
- Produces structured analysis in `.claude/OUTPUT.md`
- Captures questions in `.claude/QUESTIONS.md`

**Trigger:** `/explain` (reads task from `.claude/task.md`)

**Exit:** User says "Proceed with implementation"

---

## Phase 3: PLAN (Detailed Planning for Complex Features)

**Command:** `/plan-feature [feature-description]`

**When:** Complex features (3+ files, architectural decisions)

**What it does:**
- Deep codebase analysis with sub-agents
- External research for best practices
- Creates comprehensive implementation plan
- Outputs to `.agents/plans/[feature-name].md`

**Output:** Plan file with step-by-step tasks, validation commands, acceptance criteria

**Skip when:** Simple bug fixes, single-file changes

---

## Phase 4: EXECUTE (Implementation)

**Command:** `/execute [path-to-plan]` OR "Proceed with implementation"

**When:** After plan is approved OR after explain phase is approved

**What it does:**
- Implements tasks in order
- Validates after each change
- Creates tests per plan
- Runs validation commands

**Key rules:**
- Small atomic changes
- Type-check after each file
- Don't skip validation

---

## Phase 5: VALIDATE (Automatic After Implementation)

**Command:** `/validate` - **Claude runs this automatically**

**When:** Automatically after implementation completes

**What it does:**
- Runs full test suite
- Checks linting and types
- Verifies build succeeds
- Runs Playwright E2E tests

**Commands Claude runs:**
```bash
# Frontend
npm run type-check
npm run build

# Backend
cd backend && npm run type-check && npm run lint && npm run test
```

**If validation fails:** Claude fixes issues and re-runs until pass.

---

## Phase 6: REVIEW (Automatic After Validation)

**Command:** `/code-review` - **Claude runs this automatically**

**When:** Automatically after validation passes

**What it does:**
- Reviews changed files for bugs
- Checks security issues
- Verifies pattern adherence
- Outputs to `.agents/code-reviews/[name].md`

**If issues found:** Claude fixes them before proceeding.

---

## Phase 7: COMMIT (Automatic After Review)

**Command:** `/commit` - **Claude runs this automatically**

**When:** Automatically after code review passes

**What it does:**
- Creates atomic commit with proper message
- Uses conventional commit format (feat, fix, docs, etc.)
- Pushes to remote repository
- Displays confirmation block

**User does NOT need to request commit - Claude does it automatically.**

---

## Bug Fix Workflow

For bug fixes, use this specialized flow:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   RCA    │───▶│IMPLEMENT │───▶│ VALIDATE │───▶│  COMMIT  │
│ /rca #N  │    │ /implement│    │ /validate│    │ /commit  │
│          │    │  -fix #N │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

**Commands:**
1. `/rca [github-issue-id]` - Root cause analysis
2. `/implement-fix [github-issue-id]` - Implement from RCA
3. `/validate` - Run tests
4. `/commit` - Finalize

---

## Debug Workflow

When something goes wrong:

**Command:** `/debug-trace`

**When:**
- UI shows wrong data
- Data not saving correctly
- "Column not found" errors
- Any mysterious bugs

**What it does:**
- Systematic data flow tracing
- Database → API → Frontend → UI verification
- Identifies FIRST point of failure
- Max 22 minutes to resolution

---

## Quick Reference: Which Command When?

| Situation                | Command(s)                               |
|--------------------------|------------------------------------------|
| Starting fresh on a task | `/preflight` → `/explain`                |
| Complex new feature      | `/plan-feature` → `/execute`             |
| Simple bug fix           | `/explain` → "Proceed"                   |
| GitHub issue fix         | `/rca` → `/implement-fix`                |
| Something broke          | `/debug-trace`                           |
| Before committing        | `/validate` → `/code-review` → `/commit` |
| After pulling new code   | `/preflight`                             |
| Security review          | `/security-check`                        |
| Major tech decision      | `/adr [title]`                           |

---

## Decision Matrix: /explain vs /plan-feature

**Key Question:** How complex is the task?

| Task Complexity | Files Affected | External Research | Use Command | Full Workflow |
|-----------------|----------------|-------------------|-------------|---------------|
| **Simple** (bug fix, typo, config) | 1-2 files | None | `/explain` | `/preflight` → `/explain` → "Proceed" → `/validate` → `/commit` |
| **Medium** (small feature, refactor) | 2-3 files | Minimal | `/explain` | `/preflight` → `/explain` → "Proceed" → `/validate` → `/commit` |
| **Complex** (new feature, API) | 3+ files | Yes | `/plan-feature` | `/preflight` → `/plan-feature` → `/execute` → `/validate` → `/commit` |
| **Architectural** (major change) | Many files | Extensive | Both | `/preflight` → `/explain` → `/plan-feature` → `/execute` → `/validate` → `/commit` |

### When to Use Each Command

**Use `/explain` when:**
- Quick understanding of current state
- Simple bug fixes or configuration changes
- Tasks with clear, immediate implementation path
- You need to gather questions before planning

**Use `/plan-feature` when:**
- Feature affects 3+ files
- External documentation research is needed
- Architectural decisions must be made
- You want a reusable plan file for `/execute`
- Multiple implementation phases are required

**Use BOTH sequentially when:**
- Task is complex AND you need initial clarification
- Architectural change that requires understanding before planning
- Flow: `/explain` (understand) → Answer questions → `/plan-feature` (blueprint)

### Output Comparison

| Aspect | /explain | /plan-feature |
|--------|----------|---------------|
| **Output File** | `.claude/OUTPUT.md` | `.agents/plans/{feature-name}.md` |
| **Output Type** | Analysis & questions | Step-by-step implementation plan |
| **Reusable** | No (overwritten per task) | Yes (persists as plan file) |
| **External Research** | Minimal | Extensive (docs, best practices) |
| **Validation Commands** | General | Specific per task |

---

## File Structure

```
.claude/
├── WORKFLOW.md          # This file - master guide
├── explain.md           # Full workflow reference
├── task.md              # Current task definition
├── QUESTIONS.md         # Questions for user
├── OUTPUT.md            # Analysis output
├── database.md          # Database schema reference
├── adrs/                # Architecture Decision Records
│   └── ADR-XXX-title.md
├── commands/
│   ├── explain.md       # /explain - Start task analysis
│   ├── task.md          # /task - View/set current task
│   ├── commit.md        # /commit
│   ├── preflight.md     # /preflight
│   ├── debug-trace.md   # /debug-trace
│   ├── security-check.md    # /security-check - OWASP review
│   ├── adr.md               # /adr - Architecture decisions
│   ├── core_piv_loop/
│   │   ├── plan-feature.md   # /plan-feature
│   │   ├── execute.md        # /execute
│   │   └── prime.md          # /prime
│   ├── github_bug_fix/
│   │   ├── rca.md            # /rca
│   │   └── implement-fix.md  # /implement-fix
│   └── validation/
│       ├── validate.md       # /validate
│       ├── code-review.md    # /code-review
│       └── code-review-fix.md

Project Root:
├── CLAUDE.md            # Project-specific rules (auto-loaded)
├── lessons.md           # Lessons learned
└── UPDATES.md           # Changelog
```

---

## Security & Architecture

### Security Check

**Command:** `/security-check`

**When:**
- Before every release
- After adding authentication/authorization
- After adding file upload functionality
- After adding new API endpoints
- When handling user input

**What it does:**
- OWASP Top 10 vulnerability scan
- Secrets & credentials detection
- SQL injection patterns
- XSS vulnerabilities
- Input validation review
- Dependency audit (`npm audit`)

**Output:** Security report in `.claude/OUTPUT.md`

---

### Architecture Decision Records (ADR)

**Command:** `/adr [decision-title]`

**When:**
- Choosing between technologies
- Significant design pattern decisions
- Breaking changes to architecture
- New integration approaches

**What it does:**
- Creates structured decision record
- Documents alternatives considered
- Records rationale and consequences
- Outputs to `.claude/adrs/ADR-XXX-title.md`

**ADR Categories:**
| Range | Category |
|-------|----------|
| 001-099 | Infrastructure & DevOps |
| 100-199 | Backend Architecture |
| 200-299 | Frontend Architecture |
| 300-399 | Data & Storage |
| 400-499 | Security & Auth |
| 500-599 | Integration & APIs |

---

## Making This Portable

To use this system on a new project:

1. **Copy the `.claude/` folder** to new project root
2. **Create `CLAUDE.md`** in project root for project-specific rules
3. **Update `/validate`** command for project's test framework
4. **Create `lessons.md`** for project-specific lessons
5. **Create `UPDATES.md`** for changelog

Everything else is already in `.claude/` and ready to use.

---

## Integration with explain.md

The `/explain` command triggers the full automated workflow:

**AT START - Claude automatically runs:**
1. `/preflight` - Check environment health
2. Read `CLAUDE.md`, `lessons.md`, task files
3. Spawn sub-agents (Explore, Plan) for real data
4. Output analysis to `.claude/OUTPUT.md`
5. Questions to `.claude/QUESTIONS.md`

**USER ACTION:** Say "Proceed with implementation"

**AFTER IMPLEMENTATION - Claude automatically runs:**
1. `/validate` - Tests, linting, type checks (fix issues if any)
2. `/code-review` - Bug and quality review (fix issues if any)
3. `/commit` - Commit and push to remote
4. Display **Execution Summary** with workflow status

**User only says "/explain" and "Proceed" - Claude handles everything else.**

---

## Execution Summary (Mandatory)

**At the end of EVERY task, Claude MUST display:**

```
═══════════════════════════════════════════════════════════
  📋 EXECUTION SUMMARY
═══════════════════════════════════════════════════════════

  📁 FILES MODIFIED: [list of files changed/created]
  📁 FILES READ: [list of files read for context]
  ⚡ COMMANDS EXECUTED: [list of bash commands run]
  📝 WHAT WAS DONE: [brief description]

═══════════════════════════════════════════════════════════
  ✅ WORKFLOW STATUS
═══════════════════════════════════════════════════════════

  /validate     ✅ Passed
  /code-review  ✅ Passed
  /commit       ✅ Complete (pushed to origin/main)

═══════════════════════════════════════════════════════════
```

**After implementation, Claude AUTOMATICALLY runs the workflow.**
User does not need to manually request /validate, /code-review, or /commit.

---

## Best Practices

### DO:
- Always `/preflight` before starting
- Use `.claude/explain.md` for thinking first
- `/plan-feature` for complex work
- `/validate` before every commit
- Update `UPDATES.md` after changes
- Display Execution Summary after every task

### DON'T:
- Skip preflight checks
- Code before understanding (explain phase)
- Commit without validation
- Ignore failing tests
- Assume - always verify
- End a task without showing Execution Summary
