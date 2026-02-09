---
description: Security review for OWASP top 10, secrets, and vulnerabilities
---

# Security Check

Perform a comprehensive security review of changed or specified files.

## What to Check

### 1. Secrets & Credentials (CRITICAL)

Search for hardcoded secrets:

```bash
# API keys, tokens, passwords
grep -rn "api_key\|apikey\|api-key\|secret\|password\|token\|auth" --include="*.ts" --include="*.tsx" --include="*.js" src/ backend/src/

# AWS/Azure/GCP credentials
grep -rn "AKIA\|aws_secret\|azure\|gcp" --include="*.ts" --include="*.js" src/ backend/src/

# Private keys
grep -rn "BEGIN RSA\|BEGIN PRIVATE\|BEGIN EC" --include="*.ts" --include="*.js" --include="*.pem" .
```

**Check for:**
- [ ] No hardcoded API keys
- [ ] No hardcoded passwords
- [ ] No private keys in code
- [ ] All secrets in `.env` files
- [ ] `.env` files in `.gitignore`

### 2. SQL Injection

Search for raw SQL queries:

```bash
grep -rn "query\|execute\|raw" --include="*.ts" backend/src/
```

**Check for:**
- [ ] Using Prisma parameterized queries (safe)
- [ ] No string concatenation in SQL
- [ ] No `${}` interpolation in raw queries
- [ ] User input never directly in queries

**Bad Pattern:**
```typescript
// DANGEROUS - SQL Injection
const result = await prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`;
```

**Good Pattern:**
```typescript
// SAFE - Prisma handles escaping
const user = await prisma.user.findUnique({ where: { id: userId } });
```

### 3. Cross-Site Scripting (XSS)

Search for dangerous patterns:

```bash
grep -rn "dangerouslySetInnerHTML\|innerHTML\|outerHTML" --include="*.tsx" --include="*.ts" src/
```

**Check for:**
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] User input escaped before display
- [ ] Using React's built-in escaping (default safe)
- [ ] No `eval()` or `new Function()` with user input

### 4. Authentication & Authorization

**Check for:**
- [ ] JWT tokens have expiration
- [ ] Refresh tokens properly rotated
- [ ] Protected routes check authentication
- [ ] Role-based access control enforced
- [ ] Password hashing using bcrypt (not MD5/SHA1)

```bash
# Check auth middleware usage
grep -rn "verifyToken\|authenticate\|authorize" --include="*.ts" backend/src/
```

### 5. Input Validation

**Check for:**
- [ ] All API endpoints validate input
- [ ] File uploads check type and size
- [ ] Email/phone validation before use
- [ ] Numeric inputs bounded (no negative, overflow)

```bash
# Check for validation
grep -rn "validate\|sanitize\|zod\|joi" --include="*.ts" backend/src/
```

### 6. Sensitive Data Exposure

**Check for:**
- [ ] Passwords never logged
- [ ] API responses don't include sensitive fields
- [ ] Error messages don't expose internals
- [ ] PII redacted in logs

```bash
# Check logging
grep -rn "console.log\|logger\|winston" --include="*.ts" backend/src/ | head -20
```

### 7. CORS & Headers

**Check for:**
- [ ] CORS configured properly (not `*` in production)
- [ ] Security headers set (helmet.js or manual)
- [ ] HTTPS enforced in production
- [ ] Cookies have secure flags

```bash
# Check CORS config
grep -rn "cors\|origin\|Access-Control" --include="*.ts" backend/src/
```

### 8. Dependencies

```bash
# Check for known vulnerabilities
npm audit
cd backend && npm audit
```

**Check for:**
- [ ] No critical vulnerabilities
- [ ] Dependencies up to date
- [ ] No deprecated packages

### 9. File Operations

**Check for:**
- [ ] Path traversal prevented (`../` in file paths)
- [ ] File uploads to safe directory
- [ ] File types validated (not just extension)

```bash
grep -rn "readFile\|writeFile\|unlink\|path.join" --include="*.ts" backend/src/
```

### 10. Rate Limiting

**Check for:**
- [ ] Login endpoint rate limited
- [ ] API endpoints have rate limiting
- [ ] Brute force protection on auth

```bash
grep -rn "rateLimit\|rate-limit\|throttle" --include="*.ts" backend/src/
```

---

## Output Report

Generate report in `.claude/OUTPUT.md`:

```markdown
## Security Check Results

**Date:** [timestamp]
**Scope:** [files/directories checked]

### Summary

| Category | Status | Issues |
|----------|--------|--------|
| Secrets & Credentials | ✅/❌ | [count] |
| SQL Injection | ✅/❌ | [count] |
| XSS | ✅/❌ | [count] |
| Authentication | ✅/❌ | [count] |
| Input Validation | ✅/❌ | [count] |
| Data Exposure | ✅/❌ | [count] |
| CORS & Headers | ✅/❌ | [count] |
| Dependencies | ✅/❌ | [count] |
| File Operations | ✅/❌ | [count] |
| Rate Limiting | ✅/❌ | [count] |

### Critical Issues (Fix Immediately)

[List any critical security issues]

### High Priority Issues

[List high priority issues]

### Recommendations

[List security improvements]

### Overall Status: PASS / FAIL
```

---

## When to Run

- Before every release
- After adding authentication/authorization
- After adding file upload functionality
- After adding new API endpoints
- When handling user input
- During code review (`/code-review` can trigger this)

---

## Quick Fixes

### If secrets found:
1. Remove from code immediately
2. Rotate the exposed credential
3. Move to `.env` file
4. Add to `.gitignore`
5. Check git history for exposure

### If SQL injection found:
1. Replace with Prisma query methods
2. Use parameterized queries
3. Never concatenate user input

### If XSS found:
1. Remove `dangerouslySetInnerHTML`
2. Use DOMPurify for HTML sanitization
3. Escape user input before display
