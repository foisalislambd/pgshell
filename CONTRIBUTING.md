# Contributing to PgShell

Thanks for helping improve PgShell.

## Development setup

```bash
git clone https://github.com/Foisalislambd/pgshell.git
cd pgshell
npm install
npm run dev
```

## Checks before opening a PR

```bash
npm run ci
```

This runs typecheck, lint, unit tests, and a production build.

## Guidelines

- Keep changes focused — prefer small PRs over large mixed ones
- Match existing TypeScript style and module layout under `src/`
- Add or update unit tests under `tests/` for pure logic changes
- Do not commit `.env` files or real credentials
- Update `CHANGELOG.md` under an `[Unreleased]` or version section when behavior changes

## Reporting issues

Use [GitHub Issues](https://github.com/Foisalislambd/pgshell/issues) with:

1. PgShell version (`pgshell --version`)
2. Node.js version
3. Steps to reproduce
4. Expected vs actual behavior (sanitize passwords from logs)
