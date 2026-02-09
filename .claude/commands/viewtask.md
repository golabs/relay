---
description: "View and analyze TASK.md with intelligent context gathering"
---

# View Task - Streamlined Task Analysis

## Mission

Provide a **quick, focused analysis** of the current task defined in `.claude/TASK.md` with intelligent codebase context gathering. This is a lightweight alternative to `/plan-feature` for understanding what needs to be done.

**Core Principle**: Analyze and inform, don't plan implementation details. The goal is rapid task comprehension.

## Process

### Step 1: Read Task Definition

Read `.claude/TASK.md` and extract:
- Task title and overview
- User story (if provided)
- Requirements and acceptance criteria
- Technical notes

### Step 2: Feature Understanding

**Analyze the task:**
- Identify the core problem being solved
- Determine feature type: New Capability / Enhancement / Refactor / Bug Fix
- Assess complexity: Low / Medium / High
- List affected systems and components

**Refine user story if needed:**
```
As a <type of user>
I want to <action/goal>
So that <benefit/value>
```

### Step 3: Codebase Intelligence (Use Explore Agent)

Spawn an Explore agent to gather targeted context:

```
Task(subagent_type="Explore", model="haiku", prompt="
Find codebase context for this task: [task summary]

Look for:
1. Files directly related to the task's domain
2. Similar existing implementations or patterns
3. Integration points that may be affected
4. Relevant test files

Return: file paths with brief descriptions of relevance
")
```

### Step 4: Pattern Recognition

From the Explore results, identify:
- Existing patterns relevant to this task
- Naming conventions in the affected area
- Similar implementations to reference
- Potential conflicts or constraints

## Output Format

Display the analysis inline (no file output) in this structure:

```markdown
# Task Analysis: [Task Title]

## Overview
[One paragraph summary of what this task is about]

## Classification
- **Type**: [New Capability / Enhancement / Refactor / Bug Fix]
- **Complexity**: [Low / Medium / High]
- **Affected Areas**: [List of components/systems]

## User Story
As a [user type]
I want to [action]
So that [benefit]

## Requirements Summary
- [Key requirement 1]
- [Key requirement 2]
- [...]

## Relevant Codebase Context
| File | Relevance |
|------|-----------|
| `path/to/file.ts` | [Why it's relevant] |
| `path/to/other.ts` | [Why it's relevant] |

## Patterns to Follow
- [Pattern 1 with file reference]
- [Pattern 2 with file reference]

## Integration Points
- [Integration point 1]
- [Integration point 2]

## Quick Notes
- [Any important observations]
- [Potential gotchas noticed]
```

## Usage Notes

- This command is for **understanding**, not planning
- For full implementation planning, use `/plan-feature` instead
- For immediate implementation, use `/explain` to enter EXPLAIN_ONLY mode
- Keep analysis concise - aim for quick comprehension
- Use `model="haiku"` for Explore agent to minimize latency

## When to Use

- When you want to understand a task before deciding how to approach it
- When onboarding to a new task defined in TASK.md
- When you need quick context about what's involved
- As a precursor to `/explain` or `/plan-feature`
