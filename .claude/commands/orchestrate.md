---
description: Multi-Agent Orchestrator - Decompose complex tasks across specialized agents
---

# Multi-Agent Orchestrator

Coordinate multiple specialized agents to handle complex, multi-faceted tasks in parallel.

## Usage

```
/orchestrate [task description]
```

The orchestrator will:
1. Analyze the task and break it into subtasks
2. Assign subtasks to specialized agents
3. Run agents in parallel where possible
4. Synthesize results and resolve conflicts
5. Deliver a unified output

## Available Agents

| Agent | Role | Best For |
|-------|------|----------|
| **Researcher** | Gathers information, reads docs, explores codebase | Understanding context |
| **Architect** | Designs solutions, plans implementation | Technical decisions |
| **Implementer** | Writes code, makes changes | Code creation |
| **Reviewer** | Reviews code, finds issues | Quality assurance |
| **Tester** | Writes and runs tests | Verification |
| **Documenter** | Writes docs, updates READMEs | Documentation |

## Orchestration Process

### Step 1: Task Decomposition

Analyze the task and create a work breakdown:

```markdown
## Task Analysis

**Original Task:** [user's request]

### Subtasks Identified

1. **Research Phase** (Agent: Researcher)
   - [ ] Understand current implementation
   - [ ] Identify affected files
   - [ ] Gather requirements

2. **Design Phase** (Agent: Architect)
   - [ ] Design solution approach
   - [ ] Identify dependencies
   - [ ] Plan file changes

3. **Implementation Phase** (Agent: Implementer)
   - [ ] Implement core changes
   - [ ] Update related files
   - [ ] Handle edge cases

4. **Testing Phase** (Agent: Tester)
   - [ ] Write unit tests
   - [ ] Run existing tests
   - [ ] Verify functionality

5. **Review Phase** (Agent: Reviewer)
   - [ ] Code review changes
   - [ ] Check for issues
   - [ ] Validate against requirements

6. **Documentation Phase** (Agent: Documenter)
   - [ ] Update inline docs
   - [ ] Update README if needed
   - [ ] Add usage examples
```

### Step 2: Launch Parallel Agents

Use the Task tool to launch agents that can run in parallel:

```
# Launch in parallel (no dependencies between these):
- Researcher agent: Gather context about [area]
- Researcher agent: Find similar implementations

# After research completes, launch:
- Architect agent: Design solution based on research

# After design, launch in parallel:
- Implementer agent: Implement feature A
- Implementer agent: Implement feature B
- Tester agent: Write tests for feature A
- Tester agent: Write tests for feature B

# After implementation:
- Reviewer agent: Review all changes

# Finally:
- Documenter agent: Update documentation
```

### Step 3: Agent Prompts

**Researcher Agent:**
```
You are a code researcher. Your task is to:
1. Explore the codebase to understand [specific area]
2. Find all files related to [feature]
3. Document existing patterns and conventions
4. Identify potential integration points

Output a structured summary of findings.
```

**Architect Agent:**
```
You are a software architect. Based on the research:
1. Design a solution for [task]
2. Consider trade-offs and alternatives
3. Plan the file changes needed
4. Identify potential risks

Output a technical design document.
```

**Implementer Agent:**
```
You are a code implementer. Following the design:
1. Implement [specific component]
2. Follow existing code patterns
3. Handle error cases
4. Write clean, maintainable code

Make the code changes and report what was done.
```

**Reviewer Agent:**
```
You are a code reviewer. Review the changes:
1. Check for bugs and issues
2. Verify code follows patterns
3. Check for security issues
4. Suggest improvements

Output review findings with severity levels.
```

**Tester Agent:**
```
You are a test writer. For the implementation:
1. Write unit tests for new code
2. Write integration tests if needed
3. Run existing tests to verify no regressions
4. Report coverage changes

Generate test files and report results.
```

**Documenter Agent:**
```
You are a documentation writer. For the changes:
1. Update inline code comments
2. Update README if API changed
3. Add usage examples
4. Update changelog

Make documentation updates and report changes.
```

### Step 4: Result Synthesis

Collect outputs from all agents and synthesize:

```markdown
## Orchestration Results

**Task:** [original task]
**Agents Used:** [count]
**Status:** [COMPLETE/PARTIAL/FAILED]

### Research Summary
[Key findings from researcher agents]

### Design Decisions
[Architecture decisions made]

### Implementation Summary
| File | Changes | Status |
|------|---------|--------|
| [file] | [description] | [status] |

### Test Results
- Tests added: [count]
- Tests passed: [count]
- Coverage: [%]

### Review Findings
| Severity | Issue | Resolution |
|----------|-------|------------|
| [level] | [issue] | [how resolved] |

### Documentation Updates
- [List of docs updated]

### Conflicts Resolved
[Any conflicts between agent outputs and how they were resolved]
```

### Step 5: Conflict Resolution

When agents disagree:

1. **Implementation Conflicts:** Prefer the approach that:
   - Matches existing patterns
   - Has better test coverage
   - Is simpler

2. **Design Conflicts:** Prefer:
   - More maintainable solution
   - Better separation of concerns
   - Clearer abstractions

3. **Review Conflicts:** Prioritize:
   - Security issues
   - Bug fixes
   - Performance concerns
   - Style issues (lowest)

## Example Orchestration

**User Request:** "Add user authentication with JWT tokens"

**Orchestration Plan:**

```
Phase 1 (Parallel):
├── Researcher: Find existing auth code
├── Researcher: Check current user model
└── Researcher: Review security requirements

Phase 2 (After Phase 1):
└── Architect: Design JWT auth system

Phase 3 (Parallel, after Phase 2):
├── Implementer: Create JWT middleware
├── Implementer: Add login/logout endpoints
├── Implementer: Update user model
└── Tester: Write auth tests

Phase 4 (After Phase 3):
└── Reviewer: Review all auth changes

Phase 5 (After Phase 4):
└── Documenter: Update API docs
```

## Output

```markdown
## Orchestration Complete

**Task:** Add user authentication with JWT tokens
**Duration:** [time]
**Agents Used:** 8

### Summary

Successfully implemented JWT authentication:
- Added JWT middleware in `src/middleware/auth.ts`
- Created login/logout endpoints in `src/routes/auth.ts`
- Updated User model with password hashing
- Added 15 new tests with 94% coverage
- Updated API documentation

### Files Changed
| File | Changes |
|------|---------|
| src/middleware/auth.ts | Created (new) |
| src/routes/auth.ts | Created (new) |
| src/models/User.ts | Updated |
| tests/auth.test.ts | Created (new) |
| README.md | Updated |

### Next Steps
1. Set JWT_SECRET environment variable
2. Run `npm run migrate` to update database
3. Test endpoints with `curl` examples in docs
```
