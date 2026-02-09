---
description: Show workflow summary and available commands
---

# Help - Workflow Quick Reference

Display a condensed summary of the PRISM workflow and available commands.

## Instructions

Output the following reference directly to the user (not to OUTPUT.md):

---

## PRISM Workflow Commands

### Development Lifecycle
```
/preflight → /explain → /plan-feature → /execute → /validate → /code-review → /commit
```

### Command Reference

| Command | Purpose |
|---------|---------|
| `/discover-stack` | Auto-detect project technologies and generate STACK.md |
| `/init-project` | Set up project with stack discovery and dependencies |
| `/preflight` | Run pre-flight checks based on detected stack |
| `/explain` | Analyze task before coding (EXPLAIN_ONLY mode) |
| `/plan-feature` | Create detailed implementation plan for complex features |
| `/execute` | Execute an implementation plan |
| `/validate` | Run tests, linting, type-checks based on detected stack |
| `/code-review` | Review code for quality and bugs |
| `/commit` | Create a git commit |

### Bug Fix Commands
| Command | Purpose |
|---------|---------|
| `/rca [issue]` | Root cause analysis for GitHub issue |
| `/implement-fix [issue]` | Implement fix from RCA document |
| `/debug-trace` | Systematic data flow tracing for debugging |

### Other Commands
| Command | Purpose |
|---------|---------|
| `/security-check` | OWASP Top 10 and secrets review |
| `/adr [title]` | Create Architecture Decision Record |
| `/question` | Answer a question from TASK.md |
| `/help` | Show this reference |

### Quick Reference
| Situation | Commands |
|-----------|----------|
| New project | `/discover-stack` → `/init-project` |
| Starting fresh | `/preflight` → `/explain` |
| Complex feature | `/plan-feature` → `/execute` |
| Simple bug fix | `/explain` → "Proceed" |
| GitHub issue | `/rca` → `/implement-fix` |
| Something broke | `/debug-trace` |
| Before commit | `/validate` → `/code-review` → `/commit` |

### Workflow Files
- `.claude/TASK.md` - Current task definition
- `.claude/OUTPUT.md` - Analysis/plan output
- `.claude/QUESTIONS.md` - Questions for clarification
- `.claude/STACK.md` - Auto-detected project configuration
- `.claude/WORKFLOW.md` - Full workflow documentation

### PRISM UI Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+1-5` | Switch panes |
| `Ctrl+Enter` | Run Claude |
| `Ctrl+S` | Save |
| `Ctrl+M` | Voice mode |
| `Ctrl+Shift+R` | Read OUTPUT.md |
| `Ctrl+Shift+C` | Copy OUTPUT.md |

---

For full documentation, see `.claude/WORKFLOW.md`.
