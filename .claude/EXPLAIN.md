# EXPLAIN.md - Claude Code Workflow v2

## Quick Start - CLAUDE RUNS EVERYTHING

**User only needs to:**
1. Run `/explain` to start
2. Say **"Proceed with implementation"** when ready

**Claude AUTOMATICALLY runs:**
1. **READ these files first:**
   - `.claude/WORKFLOW.md` - Master workflow guide
   - `CLAUDE.md` - Codebase structure and rules
   - `lessons.md` - Lessons learned
2. `/preflight` - Check environment is healthy
3. Spawn sub-agents to gather real data
4. Output plan to `.claude/OUTPUT.md`
5. *[Wait for user to say "Proceed"]*
6. Implement the changes
7. `/validate` - Run all tests and checks
8. `/code-review` - Review for bugs/quality
9. `/commit` - Commit and push to remote

> **CRITICAL:** Always read `.claude/WORKFLOW.md` and `CLAUDE.md` FIRST before doing anything else.

---

## MODE: EXPLAIN_ONLY (Default)

**DO:**
- Spawn sub-agents (Explore, Plan)
- Reason, plan, analyze, ask questions
- Write to `.claude/OUTPUT.md` and `.claude/QUESTIONS.md`

**DON'T:**
- Write/modify code
- Run commands (except via sub-agents for research)
- Change database, files, or config

**Exit Condition:** User says exactly **"Proceed with implementation"**

---

## PRE-FLIGHT CHECK (AUTOMATIC)

**Claude AUTOMATICALLY runs these checks at the start of /explain:**

```bash
npm run type-check                    # Frontend TypeScript
cd backend && npm run type-check      # Backend TypeScript
cd backend && npm run lint            # ESLint
```

If any fail: Claude fixes the issues before proceeding with the task.
User does NOT need to run /preflight manually - Claude does it.

---

## SUB-AGENTS (Mandatory First Step)

Before ANY reasoning, spawn these agents:

### Phase 1: Explore (ALWAYS)
```
Task(subagent_type="Explore", prompt="...")
```
- Find files related to the task
- Search for existing patterns
- Report: what exists, what's missing

### Phase 2: Plan (If 3+ files)
```
Task(subagent_type="Plan", prompt="...")
```
- Design implementation approach
- List all files to modify
- Identify breaking changes

### Efficiency Rules
| Task Complexity | Agent | Model |
|-----------------|-------|-------|
| Simple lookup | Explore | haiku |
| Pattern search | Explore | sonnet |
| Architecture design | Plan | sonnet |
| Deep investigation | general-purpose | sonnet |

### Parallel Pattern (Complex Tasks)
Spawn multiple agents in one message for speed:
```
Agent 1 (Explore): "Find frontend patterns for X"
Agent 2 (Explore): "Find backend patterns for X"
Agent 3 (Plan): "Design integration approach"
```

---

## PROGRESS TRACKING (Task Tools)

For tasks with 3+ steps, use the Task tools to track progress:

### Creating Tasks
```typescript
// Create tasks at the start of work
TaskCreate({
  subject: "Explore codebase",
  description: "Find relevant files and existing patterns",
  activeForm: "Exploring codebase"
})
TaskCreate({
  subject: "Design approach",
  description: "Plan implementation strategy based on findings",
  activeForm: "Designing approach"
})
TaskCreate({
  subject: "Implement changes",
  description: "Write code per approved plan",
  activeForm: "Implementing changes"
})
TaskCreate({
  subject: "Run tests",
  description: "Verify no regressions with Playwright tests",
  activeForm: "Running tests"
})
```

### Setting Dependencies
```typescript
// Task 2 waits for Task 1, Task 3 waits for Task 2, etc.
TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })
TaskUpdate({ taskId: "3", addBlockedBy: ["2"] })
TaskUpdate({ taskId: "4", addBlockedBy: ["3"] })
```

### Working on Tasks
```typescript
// Mark task as in_progress when starting
TaskUpdate({ taskId: "1", status: "in_progress" })

// Mark completed when done, then start next
TaskUpdate({ taskId: "1", status: "completed" })
TaskUpdate({ taskId: "2", status: "in_progress" })

// Check all tasks
TaskList({})

// Get full details of a specific task
TaskGet({ taskId: "2" })
```

### Task Tool Reference

| Tool | Purpose |
|------|---------|
| `TaskCreate` | Create new task with subject, description, activeForm |
| `TaskUpdate` | Change status, set dependencies (addBlockedBy/addBlocks) |
| `TaskGet` | Get full task details by ID |
| `TaskList` | List all tasks with status summary |

**Rules:**
- Use `TaskCreate` to create tasks with subject, description, and activeForm
- Use `TaskUpdate` to change status: `pending` → `in_progress` → `completed`
- Use `addBlockedBy` to set task dependencies (task waits for listed tasks)
- Use `TaskGet` before updating to ensure you have the latest state
- Use `TaskList` to see all tasks and find your next available task
- Only one task should be `in_progress` at a time
- Mark tasks `completed` immediately when done
- NEVER mark a task `completed` if work is partial or tests are failing

**When to Use Tasks:**
- Complex multi-step tasks (3+ steps)
- Plan mode - track planning phases
- User provides multiple items to do
- Non-trivial work that benefits from progress visibility

**When NOT to Use Tasks:**
- Single trivial task (just do it directly)
- Task can be completed in <3 trivial steps
- Pure research/exploration (use Explore agent instead)

---

## OUTPUT FORMAT

Write to `.claude/OUTPUT.md` in this order:
- format all created or updated markdown files


### 1. Sub-Agent Findings
```markdown
## Discovery Results
**Explore Agent Found:**
- [file paths and patterns discovered]

**Plan Agent Recommends:**
- [approach and file list]
```

### 2. Task Summary
One paragraph: what we're doing and why.

### 3. Assumptions & Questions
- Assumptions clearly labeled
- Questions written to `.claude/QUESTIONS.md`

### 4. Step-by-Step Plan
Numbered steps with specific file paths and commands.

### 5. Risk Assessment
What could go wrong? How do we mitigate?

### 6. Commands to Run
```bash
# Exact commands for execution phase
npm install xxx
npx playwright test
```

---

## QUESTIONS.md

When you have questions, write them to `.claude/QUESTIONS.md` AND display them:

```markdown
## Questions

**Q1:** [Question text]
**Answer:**

**Q2:** [Question text]
**Answer:**
```

Clear this file at task start. Write "No questions at this time." if none.

When you have proceed with implementation reivew answers in the Questions.md file alert if some questions were not answered

---

## FAILURE RECOVERY

### When Stuck (>10 min on same issue)
1. STOP - don't keep trying the same thing
2. Document what you tried in `.claude/OUTPUT.md`
3. Ask user via `.claude/QUESTIONS.md` or AskUserQuestion tool
4. Wait for guidance

### When Sub-Agent Fails
1. Try once more with clearer prompt
2. If still fails, use different agent type
3. If all fail, ask user for help

### When Tests Fail
1. Read error message carefully
2. Fix ONE thing at a time
3. Re-run test after each fix
4. Don't move on until green

### Escalation Rules
| Situation | Action |
|-----------|--------|
| Unclear requirements | Ask user (`.claude/QUESTIONS.md`) |
| Multiple valid approaches | Present options, let user choose |
| Need to change scope | Ask permission first |
| Breaking change detected | Stop, warn user, get approval |

---

## BAD PATTERNS (Don't Do These)

### 1. Reasoning Without Data
```
BAD:  "I assume the auth system uses JWT..."
GOOD: "Explore agent found JWT in backend/src/middleware/auth.ts:15"
```

### 2. Fixing Symptoms Not Causes
```
BAD:  UI shows wrong value → change UI display
GOOD: UI shows wrong value → trace data flow → find root cause
```

### 3. Big Bang Implementation
```
BAD:  Write 500 lines, then test
GOOD: Write 50 lines, test, repeat
```

### 4. Ignoring Existing Patterns
```
BAD:  Create new helper function
GOOD: Check if similar helper exists first (Explore agent)
```

### 5. Assuming Instead of Verifying
```
BAD:  "The API should return..."
GOOD: "Network tab shows API returns: {actual response}"
```

---

## EXECUTION MODE

After user says **"Proceed with implementation"**:

### Pre-Flight
- [ ] Confirm plan is still correct
- [ ] TaskCreate called for all implementation steps
- [ ] Dependencies set with TaskUpdate (addBlockedBy)
- [ ] No unanswered questions in `.claude/QUESTIONS.md`

### During Implementation
- Small atomic changes
- Type-check after each file change
- Commit logical chunks (if requested)

### Validation (MANDATORY)
```bash
# After EVERY change
npm run type-check                    # Frontend
cd backend && npm run type-check      # Backend
npx playwright test tests/verify-app-health.spec.ts
```

### Post-Implementation
- [ ] All tests pass
- [ ] UPDATES.md updated
- [ ] No hardcoded secrets
- [ ] Final code matches approved plan

---

## POST-IMPLEMENTATION (AUTOMATIC)

**CRITICAL: After implementation is complete, Claude MUST automatically execute these steps in order:**

### Step 1: Run Validation
```bash
# Frontend
npm run type-check
npm run build

# Backend
cd backend && npm run type-check
cd backend && npm run lint
cd backend && npm run build
cd backend && npm run test
```

If validation fails: FIX the issues, then re-run validation.

### Step 2: Run Code Review
- Review all changed files for bugs, security issues, pattern adherence
- Create review report in `.agents/code-reviews/[date]-[name].md`
- If issues found: fix them before proceeding

### Step 3: Commit and Push
- Stage all changed files (excluding secrets, node_modules, etc.)
- Create commit with conventional format
- Push to remote
- Display confirmation block

**This is AUTOMATIC - Claude executes all three steps without waiting for user to request each one.**

### Failure Handling
- If /validate fails → Fix issues → Re-run /validate
- If /code-review finds critical issues → Fix issues → Re-run /code-review
- If /commit fails (hooks) → Fix issues → Create NEW commit (never --amend)
- Only stop and ask user if truly blocked

---

## EXECUTION SUMMARY (MANDATORY)

**After ANY work is completed (explain, implementation, fix, etc.), ALWAYS display this summary block:**

```
═══════════════════════════════════════════════════════════
  📋 EXECUTION SUMMARY
═══════════════════════════════════════════════════════════

  📁 FILES MODIFIED:
  - path/to/file1.ts (lines X-Y)
  - path/to/file2.ts (created)
  - path/to/file3.ts (deleted)

  📁 FILES READ:
  - path/to/file4.ts
  - path/to/file5.md

  ⚡ COMMANDS EXECUTED:
  - npm run type-check
  - npm run build
  - git commit -m "..."
  - git push origin main

  📝 WHAT WAS DONE:
  - [Brief description of work performed]
  - [Key changes made]
  - [Problems solved]

═══════════════════════════════════════════════════════════
  ✅ WORKFLOW STATUS
═══════════════════════════════════════════════════════════

  /validate     ✅ Passed / ❌ Failed / ⏳ Running
  /code-review  ✅ Passed / ❌ Failed / ⏳ Running
  /commit       ✅ Complete / ❌ Failed / ⏳ Running

═══════════════════════════════════════════════════════════
```

**Rules:**
- This summary MUST appear at the end of EVERY task/work session
- Include ALL files that were read, modified, or created
- Include ALL bash commands that were executed
- If no files were modified (research only), state "No files modified"
- The WORKFLOW STATUS shows automatic validation/review/commit results

---

## DEFINITION OF DONE

Task is complete ONLY when:
- [ ] Requirements satisfied
- [ ] Playwright tests pass
- [ ] Type-checks pass
- [ ] No TODOs left
- [ ] UPDATES.md updated
- [ ] `.claude/OUTPUT.md` has final summary
- [ ] All tasks marked `completed` (verify with `TaskList`)
- [ ] Execution Summary displayed to user
- [ ] `/validate` passes
- [ ] `/code-review` passes
- [ ] `/commit` completed (committed AND pushed)

---

## COMMAND REFERENCE

| Command                | When to Use                       |
|------------------------|-----------------------------------|
| `/preflight`           | Before starting any task          |
| `/explain`             | Start task in EXPLAIN_ONLY mode   |
| `/task [desc]`         | View or set current task          |
| `/plan-feature [desc]` | Complex features (3+ files)       |
| `/execute [plan-path]` | Implement from a plan file        |
| `/debug-trace`         | When something is broken          |
| `/validate`            | Before committing                 |
| `/code-review`         | After validation, before commit   |
| `/security-check`      | OWASP top 10 security review      |
| `/adr [title]`         | Architecture Decision Record      |
| `/commit`              | Finalize changes (user requested) |
| `/rca [issue-id]`      | GitHub bug analysis               |
| `/implement-fix [id]`  | Fix from RCA document             |

---

## ACKNOWLEDGMENT

Before starting, Claude MUST:

1. **READ these files (in order):**
   - `.claude/WORKFLOW.md` - Understand the full workflow
   - `CLAUDE.md` - Understand codebase rules and structure
   - `lessons.md` - Learn from past mistakes
   - `.claude/TASK.md` - Understand current task

2. **Run /preflight checks:**
   - `npm run type-check` (frontend)
   - `cd backend && npm run type-check && npm run lint`

3. **Clear output files:**
   - Clear `.claude/OUTPUT.md` (write header with fresh timestamp)
   - Clear `.claude/QUESTIONS.md` (write "No questions at this time.")

4. **State:**

```
I am in EXPLAIN_ONLY mode.

Files read: WORKFLOW.md, CLAUDE.md, lessons.md, TASK.md
Pre-flight: [PASSED/FAILED - details]

Sub-agents I will spawn:
1. Explore - [what I'm looking for]
2. Plan - [if needed, why]

Progress tracking: [Yes/No - TaskCreate/TaskUpdate]

I will output to .claude/OUTPUT.md and questions to .claude/QUESTIONS.md.

After implementation is complete, I will AUTOMATICALLY:
1. Run /validate (fix any issues)
2. Run /code-review (fix any issues)
3. Run /commit (commit and push)
4. Display EXECUTION SUMMARY with workflow status
```

## END OF TASK REQUIREMENTS

**CRITICAL: At the end of ANY implementation task, Claude MUST NO EXCEPTIONS:**

1. **AUTOMATICALLY run /validate** - Fix issues if found, re-run until pass
2. **AUTOMATICALLY run /code-review** - Fix critical issues if found
3. **AUTOMATICALLY run /commit** - Commit and push changes
4. **Display the Execution Summary block** with workflow status

**This is NOT optional.** Claude executes the full workflow automatically after implementation.
User does NOT need to manually request /validate, /code-review, or /commit.

For research-only tasks (no code changes): Skip validation workflow, just show summary.

---

## TASK

See `.claude/TASK.md`
