# Format Text Feature - Playwright Test Guide

## Quick Start

```bash
# Check if watcher queue is clear (should be < 10)
ls /opt/clawd/projects/relay/.queue/*.json.lock | wc -l

# Run all format tests
npx playwright test test_format_feature.spec.ts

# Run with visual output
npx playwright test test_format_feature.spec.ts --headed

# Run in debug mode
npx playwright test test_format_feature.spec.ts --debug
```

## Test File

**Location:** `/opt/clawd/projects/relay/tests/test_format_feature.spec.ts`

## What It Tests

1. ✅ Relay loads at http://localhost:7786
2. ✅ Project can be selected from dropdown
3. ✅ Raw text can be entered in BRETT panel
4. ✅ Format button (✨) can be clicked
5. ✅ Button changes to ⏳ during processing
6. ✅ Formatted TASK.md appears in AXION panel
7. ✅ Output has correct structure (Overview, User Story, Requirements, Acceptance Criteria)
8. ✅ Input area is cleared after formatting
9. ✅ Empty input shows error message
10. ✅ Project selection is required

## Expected Output Format

The format feature converts raw text like:

> "fix the login bug when user types wrong password it crashes need to show error message instead"

Into a structured TASK.md with:

```markdown
# TASK.md - [Title]

## Overview
[Description of the task]

## User Story
As a [role]
I want [goal]
So that [benefit]

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## Test Configuration

- **Timeout:** 5 minutes per test (300000ms)
- **Format Timeout:** 3 minutes (180000ms)
- **Browser:** Chromium (headless)
- **Viewport:** 1920x1080
- **Screenshots:** Saved to `/opt/clawd/projects/relay/.screenshots/`

## Troubleshooting

### Test Times Out

**Symptom:** Format button stays in ⏳ state for > 3 minutes

**Cause:** Watcher queue is busy

**Fix:**
```bash
# Check queue size
ls /opt/clawd/projects/relay/.queue/*.json.lock | wc -l

# Wait for queue to clear, then retry
```

### Project Dropdown Not Found

**Symptom:** Error about `#projectDropdown` not visible

**Fix:** The correct selector is `#projectSelect` (already fixed in current version)

### Screenshots Not Saved

**Symptom:** No screenshots in `.screenshots/` directory

**Fix:**
```bash
# Create directory
mkdir -p /opt/clawd/projects/relay/.screenshots

# Run test again
```

## Selectors Reference

```javascript
'#projectSelect'      // Project dropdown
'#inputArea'         // BRETT input textarea
'#formatBtn'         // Format button (✨)
'#axionPaneContent'  // AXION panel scrollable container
'#responseArea'      // AXION response area (where formatted text appears)
```

## Success Criteria

All 3 tests should pass:

```
✓ should format raw text into TASK.md structure
✓ should handle empty input gracefully
✓ should require project selection
```

## Example Run

```bash
$ npx playwright test test_format_feature.spec.ts

Running 3 tests using 1 worker

Step 1: Opening Relay at http://localhost:7786
✓ Relay loaded successfully

Step 2: Selecting project: relay
✓ Project selected: relay

Step 3: Entering test input text in BRETT panel
✓ Test input entered

Step 4: Clicking format button (✨)
✓ Format button clicked

Step 5: Waiting for formatting to start...
✓ Formatting started (button shows ⏳)

Step 6: Waiting for formatting to complete
✓ Formatting completed (button restored to ✨)

Step 7: Verifying input area is cleared
✓ Input area cleared successfully

Step 8: Verifying formatted output in AXION panel
✓ Found "Formatted TASK.md:" header
✓ Found "# TASK.md" heading
✓ Found "## Overview" section
✓ Found "## User Story" section
✓ Found "## Requirements" section
✓ Found checkboxes in requirements
✓ Found "## Acceptance Criteria" section

=== All Tests Passed! ===

  3 passed (45s)
```

## Files Generated

- `01_relay_loaded.png` - Initial page load
- `02_project_selected.png` - After selecting project
- `03_text_entered.png` - After entering test input
- `04_format_clicked.png` - After clicking format button
- `05_formatting_started.png` - Button showing ⏳
- `06_formatting_complete.png` - After formatting completes
- `07_final_result.png` - Final state with formatted text
- `08_empty_input_error.png` - Empty input error test
- `09_no_project_error.png` - No project error test

## Report

Full test report: `/opt/clawd/projects/relay/.screenshots/test_format_feature_report.md`
