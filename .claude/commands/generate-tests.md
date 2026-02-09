---
description: Automated Test Generator - Unit, integration, and E2E test generation
---

# Test Generator

Generate comprehensive tests for code including unit tests, integration tests, and E2E tests.

## Usage

```
/generate-tests [file|function] [--type=TYPE] [--framework=FRAMEWORK]
```

**Types:**
- `unit` - Unit tests for functions/methods (default)
- `integration` - Integration tests for APIs/services
- `e2e` - End-to-end tests with Playwright
- `coverage` - Analyze and fill coverage gaps
- `all` - Generate all test types

**Frameworks:**
- Python: `pytest` (default), `unittest`
- JavaScript/TypeScript: `jest` (default), `vitest`, `mocha`
- E2E: `playwright` (default), `cypress`

## Step 1: Analyze Target

First, understand what to test:

```bash
# Get file info
head -100 [target_file]

# Find existing tests
find . -name "*test*.py" -o -name "*.test.ts" -o -name "*.spec.ts" | head -20

# Check test framework
grep -l "jest\|vitest\|pytest\|mocha" package.json pyproject.toml 2>/dev/null
```

## Step 2: Extract Functions

Parse the target file to identify testable units:

**For Python:**
```bash
# Find functions and classes
grep -n "^def \|^async def \|^class " [file]
```

**For TypeScript/JavaScript:**
```bash
# Find exports and functions
grep -n "^export \|^function \|^const .* = " [file]
```

**Identify for each function:**
- Input parameters and types
- Return type
- Side effects (DB, API, file system)
- Dependencies to mock
- Edge cases

## Step 3: Generate Unit Tests

### Python (pytest)

```python
import pytest
from unittest.mock import Mock, patch, AsyncMock
from [module] import [function]

class Test[FunctionName]:
    """Tests for [function_name]"""

    def test_[scenario]_returns_[expected](self):
        """Test [description]"""
        # Arrange
        [setup]

        # Act
        result = [function]([args])

        # Assert
        assert result == [expected]

    def test_[function]_with_invalid_input_raises_error(self):
        """Test error handling"""
        with pytest.raises([ErrorType]):
            [function]([invalid_args])

    @pytest.mark.asyncio
    async def test_async_[function](self):
        """Test async function"""
        result = await [function]([args])
        assert result == [expected]

    @patch('[module].[dependency]')
    def test_[function]_with_mocked_dependency(self, mock_dep):
        """Test with mocked dependency"""
        mock_dep.return_value = [mock_value]
        result = [function]([args])
        mock_dep.assert_called_once_with([expected_args])
```

### TypeScript (Jest/Vitest)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { [function] } from './[module]';

describe('[FunctionName]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should [expected behavior] when [condition]', () => {
    // Arrange
    const input = [value];

    // Act
    const result = [function](input);

    // Assert
    expect(result).toEqual([expected]);
  });

  it('should throw error for invalid input', () => {
    expect(() => [function]([invalid])).toThrow([ErrorType]);
  });

  it('should handle edge case: [description]', () => {
    const result = [function]([edge_case_input]);
    expect(result).toEqual([expected]);
  });
});
```

## Step 4: Generate Integration Tests

### API Integration Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';

describe('[API Endpoint]', () => {
  let server;

  beforeAll(async () => {
    server = app.listen(0);
  });

  afterAll(async () => {
    server.close();
  });

  describe('POST /api/[endpoint]', () => {
    it('should return 200 with valid request', async () => {
      const response = await request(server)
        .post('/api/[endpoint]')
        .send({ [payload] })
        .expect(200);

      expect(response.body).toMatchObject({
        [expected_shape]
      });
    });

    it('should return 400 for invalid request', async () => {
      const response = await request(server)
        .post('/api/[endpoint]')
        .send({ invalid: true })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      await request(server)
        .post('/api/[endpoint]')
        .expect(401);
    });
  });
});
```

## Step 5: Generate E2E Tests (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('[Feature Name]', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('[base_url]');
  });

  test('user can [action]', async ({ page }) => {
    // Navigate
    await page.click('[selector]');

    // Fill form
    await page.fill('[input_selector]', '[value]');

    // Submit
    await page.click('[submit_button]');

    // Verify
    await expect(page.locator('[result_selector]')).toBeVisible();
    await expect(page.locator('[result_selector]')).toHaveText('[expected]');
  });

  test('handles error state correctly', async ({ page }) => {
    // Trigger error
    await page.fill('[input]', '[invalid_value]');
    await page.click('[submit]');

    // Verify error message
    await expect(page.locator('.error-message')).toBeVisible();
  });

  test('responsive layout works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('[mobile_menu]')).toBeVisible();
  });
});
```

## Step 6: Coverage Gap Analysis

```bash
# Python
pytest --cov=[module] --cov-report=term-missing

# JavaScript/TypeScript
npx vitest run --coverage
npx jest --coverage
```

**Identify uncovered:**
- Functions with 0% coverage
- Branches not tested (if/else)
- Error handlers
- Edge cases

## Test Quality Checklist

For each generated test:
- [ ] Tests one thing (single assertion concept)
- [ ] Has descriptive name
- [ ] Follows AAA pattern (Arrange-Act-Assert)
- [ ] Mocks external dependencies
- [ ] Covers happy path
- [ ] Covers error cases
- [ ] Covers edge cases (null, empty, boundary)
- [ ] Is deterministic (no flaky tests)
- [ ] Cleans up after itself

## Output Format

```markdown
## Generated Tests Report

**Target:** [file/function]
**Framework:** [framework]
**Date:** [timestamp]

### Tests Created

| File | Tests | Coverage |
|------|-------|----------|
| [test_file] | [count] | [%] |

### Test Files Generated

1. `tests/test_[name].py` - [count] tests
2. `tests/[name].test.ts` - [count] tests

### Coverage Improvement

| Metric | Before | After |
|--------|--------|-------|
| Lines | [%] | [%] |
| Branches | [%] | [%] |
| Functions | [%] | [%] |

### Next Steps

1. Review generated tests
2. Run: `pytest` or `npm test`
3. Check coverage: `pytest --cov` or `npm run test:coverage`
```

## Mock Patterns

### Database Mocks
```python
@patch('module.db.session')
def test_with_db_mock(mock_session):
    mock_session.query.return_value.filter.return_value.first.return_value = MockModel()
```

### API Mocks
```typescript
vi.mock('./api', () => ({
  fetchData: vi.fn().mockResolvedValue({ data: 'mocked' })
}));
```

### File System Mocks
```python
@patch('builtins.open', mock_open(read_data='file content'))
def test_file_read(mock_file):
    result = read_file('test.txt')
```
