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

## Releases

A push to `main` publishes `package.json`'s version after CI passes.

- npmjs (`pgshell`) uses npm Trusted Publisher. No npm access token is stored. On npmjs.com, package **pgshell** → **Trusted Publisher**: organization or user `foisalislambd`, repository `pgshell`, workflow filename `ci.yml`, environment blank. Allow `npm publish`. The owner string is case-sensitive and must match GitHub's canonical login.
- GitHub Packages publishes the same version as `@foisalislambd/pgshell`, using the workflow's built-in `GITHUB_TOKEN`.
- After both publishes, the workflow creates a GitHub Release and tag `v` + version (for example `v1.2.2`) on that commit.
- Put `skip release` in the commit message to push without publishing or tagging.
- If that version is already on a registry, or the GitHub Release already exists, that step is skipped.
- CI failure skips the publish job.

Bump `version` in `package.json` before a push that should ship a new release.

## Reporting issues

Use [GitHub Issues](https://github.com/Foisalislambd/pgshell/issues) with:

1. PgShell version (`pgshell --version`)
2. Node.js version
3. Steps to reproduce
4. Expected vs actual behavior (sanitize passwords from logs)
