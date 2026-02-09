---
description: Security Scanner - OWASP Top 10, secret detection, CVE checking, comprehensive scan
---

# Security Scanner

Comprehensive security analysis with multiple scanning engines and detailed remediation guidance.

## Usage

```
/security-scan [path] [--level=LEVEL] [--report]
```

**Scan Levels:**
- `quick` - Fast scan for critical issues only
- `standard` - OWASP Top 10 + secrets (default)
- `deep` - Full scan with CVE checking and dependencies
- `audit` - Deep scan + generates compliance report

## Scan Categories

### 1. OWASP Top 10 (2021)

| ID | Category | What to Check |
|----|----------|---------------|
| A01 | Broken Access Control | Auth bypasses, missing checks |
| A02 | Cryptographic Failures | Weak encryption, exposed data |
| A03 | Injection | SQL, Command, XSS, Template |
| A04 | Insecure Design | Logic flaws, missing controls |
| A05 | Security Misconfiguration | Debug mode, default creds |
| A06 | Vulnerable Components | Outdated dependencies |
| A07 | Auth Failures | Weak passwords, session issues |
| A08 | Data Integrity Failures | Insecure deserialization |
| A09 | Logging Failures | Missing audit logs |
| A10 | SSRF | Server-side request forgery |

### 2. Secret Detection

Search for exposed credentials:
- API Keys and tokens (AWS, GCP, Azure, generic)
- Private keys (RSA, EC, PEM files)
- Hardcoded passwords
- JWT secrets
- Database connection strings
- OAuth credentials

### 3. Injection Vulnerabilities

**SQL Injection Detection:**
- Raw query usage
- String interpolation in SQL statements
- Missing parameterized queries

**Command Injection Detection:**
- Dangerous process spawning functions
- Shell commands with user input
- Unsafe subprocess calls

**XSS Detection:**
- Unsafe HTML rendering patterns
- Unescaped template outputs
- Dynamic script evaluation

### 4. Authentication Issues

Check for:
- Hardcoded credentials
- Weak password policies
- Missing auth middleware on routes
- Insecure session handling
- Missing token expiration

### 5. Dependency Vulnerabilities

Run dependency audits:
- `npm audit` for Node.js projects
- `safety check` for Python projects
- Check for outdated packages

### 6. Configuration Issues

Check for:
- Debug mode in production configs
- CORS misconfiguration (open origins)
- Missing security headers
- Insecure cookie settings
- Exposed admin interfaces

### 7. File System Security

Check for:
- Path traversal vulnerabilities
- Dangerous file operations
- Insecure file upload handling
- Missing file type validation

### 8. Logging and Monitoring

Check for:
- Sensitive data in logs
- Missing error handling
- Insufficient audit logging

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| **CRITICAL** | Immediate exploitation risk | Fix immediately |
| **HIGH** | Significant security risk | Fix before release |
| **MEDIUM** | Potential vulnerability | Fix within sprint |
| **LOW** | Best practice violation | Add to backlog |
| **INFO** | Informational finding | Review when able |

## Output Format

Generate report in markdown and optionally HTML:

```markdown
## Security Scan Report

**Project:** [name]
**Scan Date:** [timestamp]
**Scan Level:** [level]

### Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | [n] | [status] |
| HIGH | [n] | [status] |
| MEDIUM | [n] | [status] |
| LOW | [n] | [status] |

### Overall Status: [PASS / FAIL / WARNING]

### Issues Found
[List of issues with file locations and remediation steps]

### Dependency Vulnerabilities
[Table of vulnerable packages with fix versions]

### Recommendations
[Prioritized action items]

### Compliance Checklist
[Security controls verification]
```

## Remediation Guidance

For each issue type, provide:
1. What was found
2. Why it's a risk
3. How to fix it
4. References (OWASP, CWE)

## Tools Integration

The scanner can leverage external tools when available:
- **bandit** - Python security linter
- **semgrep** - Multi-language static analysis
- **detect-secrets** - Secret detection
- **safety** - Python dependency checker
- **npm audit** - Node.js dependency checker
- **snyk** - Comprehensive vulnerability scanner

## Quick Commands

```
/security-scan .                    # Standard scan
/security-scan . --level=quick      # Fast scan
/security-scan . --level=deep       # Full scan
/security-scan src/api --report     # Scan with HTML report
```
