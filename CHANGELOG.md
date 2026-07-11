# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-07-11

### Added
- Global flags: `--json`, `--csv`, `-q` / `--quiet` for scripting
- `pgshell exec <file.sql>` — run a SQL file
- `pgshell doctor` — connection health (latency, version, SSL, credential source)
- `pgshell config show|clear` — inspect / remove saved profile (never prints password)
- `pgshell completion <bash|zsh|powershell>`
- Interactive **Recent queries** (`~/.pgshell/history.json`)
- Shared CLI output helpers (`src/cli/`)
- ESLint flat config, VS Code launch/debug configs
- Unit tests for CSV/JSON flags and history preview

### Changed
- `npm run ci` now runs typecheck → lint → test → build
- Docs/README updated for new commands and flags

## [1.1.0] - 2026-07-11

### Added
- Unit tests (Vitest) for identifier helpers, error sanitization, and URL helpers
- GitHub Actions CI (Node 18/20/22): typecheck, test, build
- `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.editorconfig`
- `engines.node` (`>=18`), `bugs` URL, and publish `files` allowlist

### Fixed
- Empty `DB_PASSWORD` / `PGPASSWORD` no longer treated as missing (trust/peer auth)
- `pgshell drop` no longer opens a redundant second admin pool
- Credential reset now applies new URI query string / database and clears stale keychain entries
- CLI `y/N` confirmation no longer accepts words like `yellow` as yes
- CLI and interactive UI share the same identifier validation (including hyphens)

### Changed
- Stricter TypeScript config (`noUnusedLocals`, `noImplicitReturns`, scoped `include`)
- npm package metadata and publish contents aligned for production releases
- Connection resolve: if `.env` login fails, fall back to saved system credentials and use **only the database name** from project `.env`

## [1.0.9] - 2026-07-10

### Changed
- Patch release and connection/error-handling improvements

## [1.0.8] - 2026-07-09

### Changed
- Documentation site version sync and homepage URL updates

[1.2.0]: https://github.com/Foisalislambd/pgshell/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Foisalislambd/pgshell/compare/v1.0.9...v1.1.0
[1.0.9]: https://github.com/Foisalislambd/pgshell/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/Foisalislambd/pgshell/releases/tag/v1.0.8
