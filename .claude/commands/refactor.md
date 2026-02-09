---
description: Smart Code Refactoring Agent - Dead code, patterns, performance, type safety
---

# Smart Code Refactoring

Analyze and refactor code for quality improvements using multiple analysis strategies.

## Usage

```
/refactor [path] [--mode=MODE]
```

**Modes:**
- `full` - Complete analysis (default)
- `dead-code` - Find unused code only
- `patterns` - Extract repeated patterns
- `performance` - Performance optimizations
- `types` - Type safety improvements
- `deps` - Dependency audit

## Analysis Steps

### Step 1: Gather Context

First, identify the target scope:

```bash
# If path provided, use it. Otherwise, get changed files
git diff --name-only HEAD~5 | head -20

# Get project language/framework
ls package.json pyproject.toml requirements.txt Cargo.toml go.mod 2>/dev/null
```

### Step 2: Dead Code Detection

**For Python:**
```bash
# Use vulture if available
which vulture && vulture . --min-confidence 80 2>/dev/null | head -50

# Fallback: find unused imports
grep -rn "^import \|^from .* import" --include="*.py" . | head -30
```

**For JavaScript/TypeScript:**
```bash
# Check for unused exports
grep -rn "^export " --include="*.ts" --include="*.tsx" --include="*.js" . | head -30

# Find unused functions (grep for definitions not called)
grep -rn "^function \|^const .* = \(.*\) =>" --include="*.ts" --include="*.js" . | head -30
```

**Look for:**
- [ ] Unused imports
- [ ] Unused functions/methods
- [ ] Unused variables
- [ ] Commented-out code blocks
- [ ] Dead conditional branches
- [ ] Unreachable code after return/throw

### Step 3: Pattern Extraction

Search for repeated code patterns:

```bash
# Find similar code blocks (3+ lines repeated)
# Look for copy-paste patterns
grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.ts" --include="*.py" --include="*.js" . | head -20
```

**Identify:**
- [ ] Repeated error handling patterns
- [ ] Similar API call structures
- [ ] Duplicate validation logic
- [ ] Copy-pasted utility functions
- [ ] Similar component structures

**Suggest extractions:**
- Create shared utility functions
- Build reusable hooks/components
- Extract to base classes
- Create factory patterns

### Step 4: Performance Analysis

**Check for:**

```bash
# Find potential N+1 queries
grep -rn "\.map.*await\|\.forEach.*await\|for.*await" --include="*.ts" --include="*.js" . | head -20

# Find synchronous operations that could be parallel
grep -rn "await.*\nawait" --include="*.ts" --include="*.js" . | head -20
```

**Performance Issues:**
- [ ] N+1 query patterns
- [ ] Missing Promise.all for parallel operations
- [ ] Large array operations without streaming
- [ ] Missing memoization for expensive calculations
- [ ] Unnecessary re-renders (React)
- [ ] Missing database indexes

### Step 5: Type Safety

**For TypeScript:**
```bash
# Find any types
grep -rn ": any\|as any" --include="*.ts" --include="*.tsx" . | head -30

# Find non-null assertions
grep -rn "!\." --include="*.ts" --include="*.tsx" . | head -20

# Check for implicit any
grep -rn "noImplicitAny" tsconfig.json
```

**For Python:**
```bash
# Find untyped functions
grep -rn "^def \|^async def " --include="*.py" . | grep -v "->" | head -20
```

**Improvements:**
- [ ] Replace `any` with proper types
- [ ] Add return types to functions
- [ ] Use type guards instead of assertions
- [ ] Add generics where appropriate
- [ ] Enable strict TypeScript settings

### Step 6: Dependency Audit

```bash
# Check outdated packages
npm outdated 2>/dev/null | head -20
pip list --outdated 2>/dev/null | head -20

# Check for duplicates
npm ls --all 2>/dev/null | grep -E "deduped|UNMET" | head -20

# Security check
npm audit --json 2>/dev/null | head -50
```

**Check:**
- [ ] Outdated dependencies
- [ ] Duplicate packages
- [ ] Unused dependencies
- [ ] Security vulnerabilities
- [ ] License compatibility

## Output Format

Generate refactoring report:

```markdown
## Refactoring Analysis Report

**Scope:** [files analyzed]
**Date:** [timestamp]

### Summary

| Category | Issues Found | Priority |
|----------|-------------|----------|
| Dead Code | [count] | [HIGH/MED/LOW] |
| Patterns | [count] | [HIGH/MED/LOW] |
| Performance | [count] | [HIGH/MED/LOW] |
| Type Safety | [count] | [HIGH/MED/LOW] |
| Dependencies | [count] | [HIGH/MED/LOW] |

### Dead Code (Remove)

1. **[file:line]** - [description]
   ```
   [code snippet]
   ```

### Pattern Extractions (Refactor)

1. **Pattern:** [name]
   **Files:** [list]
   **Suggestion:** [how to extract]

### Performance Improvements

1. **[file:line]** - [issue]
   **Fix:** [suggestion]

### Type Safety Fixes

1. **[file:line]** - [issue]
   **Suggested type:** [type]

### Dependency Updates

| Package | Current | Latest | Action |
|---------|---------|--------|--------|
| [name] | [ver] | [ver] | Update/Remove |

### Recommended Actions

1. [Priority action items]
```

## Auto-Fix Mode

When `--fix` flag is provided, automatically apply safe refactorings:

1. Remove unused imports
2. Delete commented-out code
3. Add missing return types (TypeScript)
4. Replace `any` with `unknown` where safe
5. Update minor dependency versions

**Never auto-fix:**
- Logic changes
- API modifications
- Breaking changes
- Unclear patterns
