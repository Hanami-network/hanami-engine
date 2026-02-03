# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes       |
| < 0.4   | No        |

## Reporting a vulnerability

If you discover a security issue in the HANAMI on-chain program or supporting
code, please report it privately. Do **not** open a public GitHub issue.

Email: `security@hanami.network`

We aim to respond within 72 hours and to publish a fix or coordinated disclosure
within 30 days for critical issues.

## Scope

In scope:

- The Anchor program in `programs/hanami/`
- The TypeScript SDK in `sdk/`
- The CLI in `cli/`
- Build configuration and CI

Out of scope:

- Issues in third-party dependencies (report upstream)
- Front-end demo code
- Test fixtures and mock mints

## Hardening notes

- All on-chain math uses checked arithmetic with explicit overflow handling
- Account constraints are enforced at the program boundary, not in the SDK
- The chirigiwa penalty is fixed at compile time and cannot be tampered with
- The integration suite covers fee isolation, double-settle rejection, and
  premature settle attempts
