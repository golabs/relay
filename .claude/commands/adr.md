---
description: Create an Architecture Decision Record for significant technical decisions
argument-hint: [decision title, e.g., "Use PostgreSQL over MongoDB"]
---

# Architecture Decision Record (ADR)

Create a structured record of architectural decisions for future reference.

## When to Use

- Choosing between technologies (databases, frameworks, libraries)
- Significant design pattern decisions
- Breaking changes to existing architecture
- New integration approaches
- Performance optimization strategies

## ADR Template

Create file at `.claude/adrs/ADR-[number]-[title].md`:

```markdown
# ADR-[number]: [Title]

**Date:** [YYYY-MM-DD]
**Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-XXX]
**Decision Makers:** [Names/roles]

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision Drivers

- [Driver 1: e.g., Performance requirements]
- [Driver 2: e.g., Team expertise]
- [Driver 3: e.g., Cost constraints]
- [Driver 4: e.g., Maintenance burden]

## Considered Options

### Option 1: [Name]
**Pros:**
- Pro 1
- Pro 2

**Cons:**
- Con 1
- Con 2

### Option 2: [Name]
**Pros:**
- Pro 1
- Pro 2

**Cons:**
- Con 1
- Con 2

### Option 3: [Name]
**Pros:**
- Pro 1
- Pro 2

**Cons:**
- Con 1
- Con 2

## Decision

We will use **[Option X]** because:
1. [Reason 1]
2. [Reason 2]
3. [Reason 3]

## Consequences

### Positive
- [Positive consequence 1]
- [Positive consequence 2]

### Negative
- [Negative consequence 1]
- [Negative consequence 2]

### Risks
- [Risk 1 and mitigation]
- [Risk 2 and mitigation]

## Implementation Notes

[Any specific implementation guidance]

## References

- [Link to relevant documentation]
- [Link to discussion thread]
- [Link to related ADRs]
```

---

## Process

### Step 1: Research (Use Sub-Agents)

```
Task(subagent_type="Explore", prompt="Find existing patterns for [decision area]")
Task(subagent_type="general-purpose", prompt="Research best practices for [technology choice]")
```

### Step 2: Document Options

For each viable option, document:
- Technical fit
- Team capability
- Cost (licensing, infrastructure, maintenance)
- Risk profile
- Migration path (if replacing existing solution)

### Step 3: Create ADR

1. Create `.claude/adrs/` directory if it doesn't exist
2. Number sequentially (ADR-001, ADR-002, etc.)
3. Use descriptive title (e.g., `ADR-003-use-postgresql-for-primary-database.md`)

### Step 4: Review

- [ ] All stakeholders identified
- [ ] At least 2 options considered
- [ ] Pros/cons balanced and honest
- [ ] Consequences clearly stated
- [ ] Implementation path defined

---

## ADR Numbering

| Range | Category |
|-------|----------|
| 001-099 | Infrastructure & DevOps |
| 100-199 | Backend Architecture |
| 200-299 | Frontend Architecture |
| 300-399 | Data & Storage |
| 400-499 | Security & Auth |
| 500-599 | Integration & APIs |
| 600-699 | Testing Strategy |
| 700-799 | Performance & Scaling |

---

## Example ADRs

### ADR-301: Use PostgreSQL over MongoDB
- **Context:** Need primary database for production
- **Decision:** PostgreSQL for ACID compliance, Prisma support
- **Consequences:** Need DBA expertise, better data integrity

### ADR-201: React Context over Redux
- **Context:** State management for medium-sized app
- **Decision:** React Context sufficient, less boilerplate
- **Consequences:** May need refactor if app grows significantly

### ADR-401: JWT with Refresh Tokens
- **Context:** Authentication strategy
- **Decision:** JWT (15min) + refresh tokens (7 days)
- **Consequences:** Stateless API, requires token rotation logic

---

## Maintaining ADRs

1. **Never delete** - Mark as deprecated/superseded instead
2. **Link related ADRs** - Create a decision trail
3. **Review quarterly** - Are decisions still valid?
4. **Update status** - Keep current with reality

---

## Quick Create

For simple decisions, use this abbreviated format:

```markdown
# ADR-[number]: [Title]

**Date:** [YYYY-MM-DD] | **Status:** Accepted

## Context
[1-2 sentences]

## Decision
[1-2 sentences]

## Consequences
- [Key consequence 1]
- [Key consequence 2]
```
