---
description: Review and improve TASK.md structure and syntax before running explain
---

# Review Task - Task File Enhancement

## Purpose

Transform raw task definitions into professional, LLM-ready task specifications.
This command refines structure and clarity, optionally adding codebase context.

## Mode Selection

Check `$ARGUMENTS` for mode:
- Empty or "quick" → **Quick Mode** (default)
- "thorough" → **Thorough Mode** (with codebase analysis)

**Quick Mode (Default):** Structure and clarity improvements only
**Thorough Mode:** Adds codebase context gathering (use when task involves existing code)

---

## Process

### Phase 1: Read Current Task

Read `.claude/TASK.md` and extract:
- Raw user input or voice transcription
- Existing sections (if any)
- Referenced files, components, or features

### Phase 2: Structure Validation

Check and ensure these sections exist:

1. **Overview** - Brief description (transform voice to written)
2. **User Story** - Clear As a/I want/So that format
3. **Requirements** - Specific, actionable checkbox items
4. **Acceptance Criteria** - Testable checkbox items
5. **Technical Notes** - Optional implementation hints

### Phase 3: Clarity Enhancement

- Convert conversational language to professional technical writing
- Expand abbreviations and clarify jargon
- Add specificity where requirements are vague
- Remove redundancy

### Phase 4: Codebase Context (Thorough Mode Only)

**Only execute if `$ARGUMENTS` = "thorough"**

1. Spawn Explore sub-agent to find relevant context:
   ```
   Task(subagent_type="Explore", model="haiku", prompt="
   Find codebase context for: [task summary from TASK.md]
   Look for:
   1. Files related to the task domain
   2. Similar existing implementations
   3. Integration points
   4. Relevant patterns
   Return: file paths with relevance descriptions
   ")
   ```

2. Add **Context References** section to output with:
   - Relevant files and why they matter
   - Patterns to follow from existing code
   - Integration points where changes connect

3. Read `.claude/STACK.md` if it exists and add **Validation Approach** section with:
   - Type check command from stack
   - Test command from stack
   - Lint command from stack

### Phase 5: Write Enhanced Task

Save improved TASK.md preserving:
- User's original intent
- Any manually added notes
- Existing checkbox states (if partially complete)

---

## Output Format

Enhanced TASK.md should follow this structure:

```markdown
# TASK.md - [Descriptive Title]

## Overview

[One paragraph summary of the task]

## User Story

As a [user type]
I want to [action/goal]
So that [benefit/value]

## Requirements

- [ ] [Specific requirement 1]
- [ ] [Specific requirement 2]
- [ ] [Additional requirements...]

## Acceptance Criteria

- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]
- [ ] [Additional criteria...]

## Context References (thorough mode only)

**Relevant Files:**
- `path/to/file.ext` - [why relevant]

**Patterns to Follow:**
- [Pattern observed in codebase]

**Integration Points:**
- [Where changes connect to existing code]

## Validation Approach (if STACK.md exists)

Based on detected stack:
- Type check: [command]
- Tests: [command]
- Lint: [command]

## Technical Notes (Optional)

[Implementation hints, constraints, references]
```

---

## Summary Output

After processing, display:
- Changes made to structure
- Clarity improvements applied
- Context added (if thorough mode)
- Suggestions for user to review

---

## Important Notes

- Do NOT run /explain after - let user verify first
- Do NOT perform implementation planning (use /plan-feature for that)
- Preserve user intent even when clarifying language
- Use `/reviewtask thorough` for codebase context mode
- Default "quick" mode maintains backwards compatibility
