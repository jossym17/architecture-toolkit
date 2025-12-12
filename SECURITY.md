# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email the maintainers or use GitHub's private vulnerability reporting feature
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours of your report
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: 90 days

### Security Measures in Place

This project implements several security measures:

- **Path Traversal Protection**: All file operations validate paths to prevent directory traversal attacks
- **Input Validation**: All user inputs are validated and sanitized using Zod schemas
- **ID Format Validation**: Artifact IDs are validated against strict patterns
- **Dependency Auditing**: Regular `npm audit` checks in CI pipeline
- **No Arbitrary Code Execution**: Templates and plugins are sandboxed

### Scope

The following are in scope for security reports:

- Path traversal vulnerabilities
- Injection attacks (command, template)
- Denial of service vulnerabilities
- Information disclosure
- Authentication/authorization bypasses (if applicable)

### Out of Scope

- Issues in dependencies (report to the dependency maintainers)
- Issues requiring physical access
- Social engineering attacks
- Issues in unsupported versions

## Security Best Practices for Users

1. Keep the toolkit updated to the latest version
2. Review custom templates before importing
3. Run with minimal file system permissions
4. Use in trusted environments only

Thank you for helping keep Architecture Toolkit secure!
