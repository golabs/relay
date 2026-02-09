---
description: Answer a question from TASK.md
---

# Question Mode

Read the question from `.claude/TASK.md` and answer it.

## Instructions

1. Read `.claude/TASK.md` to get the user's question
2. Answer the question thoroughly and accurately
3. Write the answer to `.claude/OUTPUT.md` in this format:

```markdown
# OUTPUT.md - Question Response

**Generated:** [date]
**Mode:** QUESTION

---

## Question

[The user's question from TASK.md]

---

## Answer

[Your detailed answer]

---

## Sources (if applicable)

- [Any relevant files or references used]
```

4. Display the answer in the terminal as well
5. If the question is unclear, ask for clarification using AskUserQuestion tool

## Notes

- Keep answers concise but complete
- Reference specific file paths and line numbers when discussing code
- If the question requires code exploration, use appropriate tools first
