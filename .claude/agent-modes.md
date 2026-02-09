# Agent Modes for Relay

When sending messages from Relay, you can prefix your message with an agent mode to spawn specialized sub-agents.

## Available Agent Modes

### Research & Exploration
| Prefix | Agent Type | Description |
|--------|------------|-------------|
| `@explore` | Explore | Fast codebase exploration - find files, search patterns, understand structure |
| `@research` | general-purpose | Deep research - multiple searches, web lookups, comprehensive analysis |

### Planning & Architecture
| Prefix | Agent Type | Description |
|--------|------------|-------------|
| `@plan` | Plan | Design implementation approach - architecture, file changes, trade-offs |
| `@architect` | Plan | Same as @plan - for architecture decisions |

### Development & Implementation
| Prefix | Agent Type | Description |
|--------|------------|-------------|
| `@dev` | general-purpose | Full development mode - research, plan, and implement |
| `@implement` | general-purpose | Skip to implementation (assumes you've already planned) |

### Code Quality
| Prefix | Agent Type | Description |
|--------|------------|-------------|
| `@review` | general-purpose | Code review - find bugs, security issues, improvements |
| `@debug` | general-purpose | Debug mode - trace issues, find root causes |
| `@test` | general-purpose | Testing focus - write/run tests, verify behavior |

### Quick Tasks
| Prefix | Agent Type | Description |
|--------|------------|-------------|
| `@quick` | haiku | Fast simple tasks - quick lookups, small changes |
| `@fix` | general-purpose | Fix a specific bug or issue |

## Usage Examples

```
@explore where is authentication handled?
@plan add dark mode to the settings page
@review check the new API handlers for security issues
@debug the file browser isn't showing hidden files
@quick what port does the relay server use?
```

## Auto-Detection

If no prefix is provided, Claude will auto-detect the best approach based on keywords:
- Questions starting with "where", "what", "how" -> Explore first
- Requests with "add", "create", "implement" -> Plan then Dev
- Requests with "fix", "broken", "not working" -> Debug mode
- Requests with "review", "check", "security" -> Review mode

## Parallel Agents

For complex tasks, Claude may spawn multiple agents in parallel:
```
@explore find frontend auth + @explore find backend auth + @plan design SSO integration
```

## Model Selection

| Task Complexity | Model |
|-----------------|-------|
| Quick lookups, simple changes | haiku |
| Standard development work | sonnet |
| Complex architecture, deep analysis | sonnet/opus |

## Integration with /explain Workflow

These agent modes work with the /explain workflow:
1. Use `@explore` and `@plan` during EXPLAIN_ONLY mode
2. Use `@dev` or `@implement` after "Proceed with implementation"
3. Use `@review` before committing
