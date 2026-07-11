# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.2.x   | Yes       |
| 1.1.x   | Best effort |
| < 1.1   | Best effort |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Email or message the maintainer via GitHub: [@Foisalislambd](https://github.com/Foisalislambd)

Include:

- Description of the issue
- Steps to reproduce
- Impact (credential leak, SQL injection path, etc.)
- PgShell and Node.js versions

You should receive an acknowledgement within a few days. Please give us time to publish a fix before any public disclosure.

## Security notes for users

- Prefer OS keychain storage or environment variables over committing passwords
- Never share `.env` files or connection strings that contain secrets
- PgShell redacts connection strings from many error messages, but always review logs before sharing
