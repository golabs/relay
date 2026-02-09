---
description: Code Analytics Dashboard - Complexity, churn, dependencies, tech debt tracking
---

# Code Analytics Dashboard

Generate comprehensive code analytics with visualizations for project health tracking.

## Usage

```
/analyze-code [path] [--report=TYPE]
```

**Report Types:**
- `full` - Complete analysis (default)
- `complexity` - Cyclomatic complexity metrics
- `churn` - Code change frequency analysis
- `dependencies` - Dependency graph and audit
- `debt` - Technical debt estimation
- `hotspots` - High-risk file identification

## Step 1: Project Overview

```bash
# Count files and lines
find . -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.tsx" | wc -l
find . -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.tsx" | xargs wc -l 2>/dev/null | tail -1

# Get language breakdown
find . -type f -name "*.py" | wc -l
find . -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l
find . -type f \( -name "*.js" -o -name "*.jsx" \) | wc -l

# Check project age and activity
git log --reverse --format="%ai" | head -1
git log -1 --format="%ai"
git shortlog -sn | head -10
```

## Step 2: Complexity Analysis

### Cyclomatic Complexity

**For Python:**
```bash
# Using radon
pip install radon 2>/dev/null
radon cc . -a -s --json 2>/dev/null | head -100

# Manual check for complex functions
grep -rn "def \|if \|elif \|for \|while \|except " --include="*.py" . | wc -l
```

**For JavaScript/TypeScript:**
```bash
# Find complex functions (many if/for/while)
grep -rn "if (\|for (\|while (\|switch (\|case " --include="*.ts" --include="*.js" . | wc -l

# Find long functions
grep -n "^function \|=> {" --include="*.ts" --include="*.js" . | head -30
```

### Complexity Categories

| Grade | Complexity | Risk Level |
|-------|------------|------------|
| A | 1-5 | Low - Simple |
| B | 6-10 | Low - Well-structured |
| C | 11-20 | Moderate - Needs attention |
| D | 21-30 | High - Consider refactoring |
| E | 31-40 | Very High - Refactor soon |
| F | 41+ | Extreme - Immediate refactor |

## Step 3: Code Churn Analysis

```bash
# Most frequently changed files (last 6 months)
git log --since="6 months ago" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -20

# Files with most commits
git log --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20

# Recent activity by author
git shortlog -sn --since="30 days ago"

# Churn velocity (commits per week)
git log --since="30 days ago" --oneline | wc -l
```

### Churn Risk Assessment

High churn + high complexity = **Hotspot** (prioritize for refactoring)

## Step 4: Dependency Analysis

```bash
# Node.js dependencies
cat package.json | grep -A 100 '"dependencies"' | head -50
npm ls --depth=0 2>/dev/null

# Python dependencies
cat requirements.txt 2>/dev/null | head -30
pip list 2>/dev/null | head -30

# Check for outdated
npm outdated 2>/dev/null
pip list --outdated 2>/dev/null

# Dependency count
npm ls --all 2>/dev/null | wc -l
```

### Dependency Metrics

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Direct deps | <20 | 20-50 | >50 |
| Total deps | <200 | 200-500 | >500 |
| Outdated | <10% | 10-30% | >30% |
| Vulnerabilities | 0 | 1-5 low | Any high |

## Step 5: Technical Debt Estimation

### Debt Indicators

```bash
# TODO/FIXME/HACK counts
grep -rn "TODO\|FIXME\|HACK\|XXX\|DEPRECATED" --include="*.ts" --include="*.py" --include="*.js" . | wc -l

# Console.log/print statements (should be removed)
grep -rn "console.log\|print(" --include="*.ts" --include="*.py" --include="*.js" . | wc -l

# Type any usage (TypeScript)
grep -rn ": any\|as any" --include="*.ts" --include="*.tsx" . | wc -l

# Long files (>500 lines)
find . -name "*.ts" -o -name "*.py" -o -name "*.js" | xargs wc -l 2>/dev/null | awk '$1 > 500' | head -20

# Deeply nested code
grep -rn "        if\|        for\|        while" --include="*.ts" --include="*.py" . | wc -l
```

### Debt Score Calculation

| Category | Weight | Formula |
|----------|--------|---------|
| TODOs | 1 point | count × 1 |
| FIXMEs | 2 points | count × 2 |
| HACKs | 3 points | count × 3 |
| High complexity | 5 points | F-grade functions × 5 |
| Missing tests | 2 points | uncovered functions × 2 |
| Outdated deps | 1 point | outdated × 1 |

**Debt Levels:**
- 0-50: Healthy
- 51-100: Manageable
- 101-200: Needs attention
- 200+: Critical

## Step 6: Generate Dashboard

Create an interactive HTML report at `/opt/clawd/projects/.preview/code-analytics-[project].html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Code Analytics - [Project]</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        /* Dashboard styles */
        body { font-family: system-ui; background: #0a0a1a; color: #e2e8f0; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 20px; }
        .metric { font-size: 2.5rem; font-weight: bold; color: #00f0ff; }
        .label { color: #94a3b8; font-size: 0.9rem; }
        .chart-container { height: 300px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Code Analytics Dashboard</h1>

        <!-- Overview Cards -->
        <div class="grid">
            <div class="card">
                <div class="metric">[total_files]</div>
                <div class="label">Total Files</div>
            </div>
            <div class="card">
                <div class="metric">[total_lines]</div>
                <div class="label">Lines of Code</div>
            </div>
            <div class="card">
                <div class="metric">[complexity_avg]</div>
                <div class="label">Avg Complexity</div>
            </div>
            <div class="card">
                <div class="metric">[debt_score]</div>
                <div class="label">Tech Debt Score</div>
            </div>
        </div>

        <!-- Charts -->
        <div class="card">
            <h2>Complexity Distribution</h2>
            <canvas id="complexityChart"></canvas>
        </div>

        <div class="card">
            <h2>Code Churn (Last 30 Days)</h2>
            <canvas id="churnChart"></canvas>
        </div>

        <div class="card">
            <h2>Hotspots</h2>
            <table>
                <tr><th>File</th><th>Complexity</th><th>Churn</th><th>Risk</th></tr>
                <!-- Hotspot rows -->
            </table>
        </div>
    </div>

    <script>
        // Chart.js initialization
        new Chart(document.getElementById('complexityChart'), {
            type: 'doughnut',
            data: {
                labels: ['A (Simple)', 'B (Low)', 'C (Moderate)', 'D+ (High)'],
                datasets: [{
                    data: [/* counts */],
                    backgroundColor: ['#22c55e', '#3b82f6', '#eab308', '#ef4444']
                }]
            }
        });
    </script>
</body>
</html>
```

## Output Format

```markdown
## Code Analytics Report

**Project:** [name]
**Analyzed:** [timestamp]
**Files:** [count] | **Lines:** [count]

### Health Score: [A-F] ([score]/100)

### Summary

| Metric | Value | Status |
|--------|-------|--------|
| Avg Complexity | [value] | [status] |
| Code Churn | [commits/week] | [status] |
| Tech Debt Score | [score] | [status] |
| Dependency Health | [%] | [status] |
| Test Coverage | [%] | [status] |

### Hotspots (High Risk Files)

| File | Complexity | Churn | Action |
|------|------------|-------|--------|
| [file] | [score] | [count] | [recommendation] |

### Recommendations

1. **Immediate:** [action items]
2. **Short-term:** [action items]
3. **Long-term:** [action items]

### Dashboard

View interactive dashboard: [http://127.0.0.1:8800/code-analytics-[project].html]
```
