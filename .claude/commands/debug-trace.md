Systematic data flow tracing for debugging issues.

**CRITICAL:** This skill prevents 2-hour debugging sessions that should take 6 minutes.

## The Golden Rule

**NEVER assume - ALWAYS verify** at each step of the data flow.

---

## Step 1: Identify the Symptom

Before doing ANYTHING, clearly state:

1. **What is wrong?** (e.g., "UI shows 'General' instead of 'Cargo'")
2. **Where does it appear?** (e.g., "Policy detail page, claimType field")
3. **What is expected?** (e.g., "Should show 'Cargo' as saved")

---

## Step 2: Trace the Data Flow

Check EACH layer in order. Find the FIRST point where data is wrong.

### Layer 1: Database

```bash
cd backend && npx prisma studio
```

Or query directly:
```sql
-- Check the actual value in database
SELECT id, claimType, type FROM Policy WHERE id = 'xxx';
```

**Question:** Is the value correct in the database?
- YES → Problem is after database (continue to Layer 2)
- NO → Problem is in save operation (check service layer)

### Layer 2: Backend API Response

**Action:** Check browser Network tab

1. Open DevTools (F12)
2. Go to Network tab
3. Trigger the action that loads the data
4. Find the API request (e.g., `/api/items/xxx`)
5. Click on it → Preview/Response tab

**Question:** Does the API response contain the correct value?
- YES → Problem is in frontend (continue to Layer 3)
- NO → Problem is in backend transformation (check service layer)

### Layer 3: Frontend Transformation

**Action:** Check how frontend maps the response

Common locations to check:
- `src/contexts/*Context.tsx` - data transformations
- `src/services/*Service.ts` - API response handling

**Question:** Is the frontend mapping the correct field?

Common mistake patterns:
```typescript
// WRONG: Using wrong field name
claimType: response.data.type  // "type" is different from "claimType"!

// RIGHT: Using correct field name
claimType: response.data.claimType

// WRONG: Double extraction
const data = response.data.data;  // axios already extracts .data!

// RIGHT: Single extraction
const data = response.data;
```

### Layer 4: UI Display

**Action:** Check the component rendering

**Question:** Is the component receiving correct props?

Add temporary console.log if needed:
```typescript
console.log('Props received:', { claimType, type });
```

---

## Step 3: Report Findings

After tracing, document:

```markdown
## Debug Trace Results

### Symptom
[What's wrong]

### Data Flow Trace
| Layer | Value Found | Correct? |
|-------|-------------|----------|
| Database | [value] | YES/NO |
| API Response | [value] | YES/NO |
| Frontend Transform | [value] | YES/NO |
| UI Display | [value] | YES/NO |

### First Point of Failure
[Layer X] - [Specific issue found]

### Root Cause
[Why the data is wrong at this point]

### Fix Location
File: [path]
Line: [number]
Change: [what to change]
```

---

## Quick Reference: Common Issues

| Symptom | Most Likely Cause | Check First |
|---------|-------------------|-------------|
| UI shows wrong value | Field mapping in Context | Network tab → compare fields |
| Data not saving | Missing field in request | Network tab → request body |
| "Column not found" | Schema out of sync | Run `prisma db push` |
| Data "lost" after refresh | Multiple .db files | Run `find backend -name "*.db"` |
| Auth-related display issues | Context loading order | Check `isAuthenticated` guards |

---

## Time Limits

| Task | Max Time | If Exceeded |
|------|----------|-------------|
| Identify symptom | 2 min | Ask user for clarification |
| Trace to root cause | 10 min | Re-read this protocol |
| Implement fix | 5 min | The fix should be simple |
| Verify fix | 5 min | Run Playwright |

**Total: 22 minutes max for any debug task**

If taking longer, STOP and:
1. Re-read the Debugging Protocol in CLAUDE.md
2. Check lessons-compressed.md for similar issues
3. Ask the user for help

---

## After Fixing

1. Run Playwright verification:
```bash
npx playwright test tests/verify-app-health.spec.ts --reporter=list
```

2. Update UPDATES.md with the fix

3. Consider if this pattern should be added to lessons.md
