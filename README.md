<p align="center">
  <a href="https://www.npmjs.com/package/pgshell"><img src="https://img.shields.io/npm/v/pgshell?color=cb3837&logo=npm" alt="npm" /></a>
  <a href="https://github.com/Foisalislambd/pgshell/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Foisalislambd/pgshell/ci.yml?branch=main&label=CI" alt="CI" /></a>
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License" />
</p>

<h1 align="center">PgShell</h1>
<p align="center">
  <strong>Your friendly PostgreSQL companion for the terminal</strong>
</p>

<p align="center">
  <em>Explore, modify, and monitor PostgreSQL databases — no GUI, no fuss.</em>
</p>

---

## 🚀 Quick Start (30 seconds)

**New here?** Follow these three steps:

1. **Install**
   ```bash
   npm install -g pgshell
   ```

2. **Configure** — Create a `.env` file in your project folder (or where you'll run `pgshell`):
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=your_database
   ```
   Or use a single URL: `DATABASE_URL="postgresql://user:password@localhost:5432/dbname"`

3. **Run**
   ```bash
   pgshell
   ```

That's it! PgShell will connect and show you an interactive menu. If you skip the `.env`, PgShell will ask for connection details the first time — and optionally save your password in your OS keychain (Windows Credential Manager, macOS Keychain, or Linux Secret Service) so you don't have to type it again.

---

## ✨ What is PgShell?

PgShell is a terminal-based tool that gives you full control over PostgreSQL. Use the **interactive menu** for guided tasks, or run **direct commands** for quick one-liners — no more opening a separate GUI.

| | |
|---|---|
| 🖥️ | **Interactive UI** — Guided menus for browsing, creating, and managing |
| ⚡ | **CLI commands** — `pgshell query "SELECT * FROM users"` |
| 🔐 | **Flexible setup** — `.env`, URI, or interactive prompts; password stored securely in your OS keychain |
| 📊 | **Formatted output** — Clean tables with syntax highlighting |

---

## 📋 Table of Contents

- [Quick Start](#-quick-start-30-seconds)
- [Requirements](#-requirements)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Commands Reference](#-commands-reference)
- [Interactive UI](#-interactive-ui)
- [Examples](#-examples)
- [Project Structure](#-project-structure)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## 🛠 Requirements

- **Node.js** 18 or newer
- **PostgreSQL** server (local or remote)
- Your database credentials

---

## 📦 Installation

**Global install** (run from anywhere):

```bash
npm install -g pgshell
```

Then try:
```bash
pgshell
# or
pgshell query "SELECT 1"
```

---

**From source** (for development or contributions):

```bash
git clone https://github.com/Foisalislambd/pgshell
cd pgshell
npm install
npm run build
```

Run it:
```bash
node dist/index.js
# or with hot reload during development
npm run dev
```

**Use locally without publishing:**
```bash
npm link
pgshell
```

---

## ⚙️ Configuration

PgShell reads credentials from a `.env` file in the **directory where you run it**. Put your project or working folder in mind when creating it.

### Option 1 — Individual variables

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=your_database
```

### Option 2 — Connection URL

```env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

> `DATABASE_URL` overrides individual variables if both exist.

### Option 3 — Standard PostgreSQL vars

```env
PGUSER=postgres
PGPASSWORD=yourpassword
PGHOST=localhost
PGPORT=5432
PGDATABASE=yourdatabase
```

### Password storage (keychain)

When you connect interactively (without working `.env` login), PgShell can save your password in your **OS keychain** so you don't have to re-enter it. It uses Windows Credential Manager, macOS Keychain, or Linux Secret Service. Connection profiles (host, port, user) are stored in `~/.pgshell/config.json` — passwords are never saved in plain text.

**Fallback:** If `.env` login credentials fail, PgShell uses those saved system credentials and takes **only the database name** (`DB_NAME` / `PGDATABASE` / path in `DATABASE_URL`) from the project `.env`. You can also keep just `DB_NAME` in `.env` and rely entirely on the saved profile for host/user/password.

### Cloud & SSL

SSL is enabled automatically when your connection string contains `sslmode=require`, `amazonaws.com`, or `supabase.com`.

---

## 🚀 Usage

1. Install: `npm install -g pgshell`
2. (Optional) Create a `.env` in your project directory — see [Configuration](#-configuration)
3. Run `pgshell` — if `.env` exists, it connects automatically; otherwise it prompts for connection details

---

## 📂 Commands Reference

All commands support `.env` credentials. If no `.env` is present, PgShell will prompt you when needed.

**Global flags (most commands):** `--json` · `--csv` · `-q` / `--quiet`

| Command | Description |
|---------|-------------|
| `pgshell` or `pgshell ui` or `pgshell view` | Launch the interactive menu |
| `pgshell query "<sql>"` | Run a raw SQL query |
| `pgshell exec <file.sql>` | Run a SQL file |
| `pgshell list` | List all databases with sizes |
| `pgshell create <name>` | Create a new database |
| `pgshell drop <name>` | Drop a database (`--yes` to skip confirmation) |
| `pgshell table [dbName]` | List all tables — specify `dbName` or use `.env` / select interactively |
| `pgshell delete [dbName]` | Drop all tables in a database — with confirmation |
| `pgshell doctor` | Connection health check (latency, version, SSL, credential source) |
| `pgshell config show` | Show saved profile (never prints password) |
| `pgshell config clear` | Clear saved profile + keychain password |
| `pgshell completion <shell>` | Print bash / zsh / powershell completion |

**Examples:**

```bash
# Query (human / JSON / CSV)
pgshell query "SELECT * FROM users LIMIT 5"
pgshell query "SELECT * FROM users LIMIT 5" --json
pgshell list --csv

# SQL file
pgshell exec ./scripts/seed.sql

# Databases
pgshell list
pgshell create my_app_db
pgshell drop old_db --yes
pgshell doctor --json

# Tables
pgshell table my_database --json

# Shell completion
eval "$(pgshell completion bash)"
```

Results appear as formatted tables (or JSON/CSV). On errors, PgShell exits with code 1.

---

## 📱 Interactive UI

Run `pgshell` or `pgshell ui` to open the interactive menu.

| Menu Option | What it does |
|-------------|--------------|
| 📂 **List all databases** | See all databases with sizes |
| ➕ **Create database** | Create a new database |
| 🗑️ **Delete database** | Drop a database (with confirmation) |
| 🔄 **Switch database** | Reconnect to a different database |
| 📋 **List all tables** | Tables in `public` schema with owner and row estimates |
| 🔍 **View table data** | Browse rows with configurable limit |
| 📖 **Table structure** | Columns, types, nullability, defaults |
| ➕ **Create new table** | Define tables with column syntax |
| 📥 **Add new row** | Insert with guided prompts per column |
| 🗑️ **Delete one table** | Drop a single table (with confirmation) |
| 🚨 **Delete all tables** | Drop all `public` tables (extra confirmation) |
| ⚡ **Run custom SQL** | Execute any SQL command |
| 🕘 **Recent queries** | Re-run from `~/.pgshell/history.json` |
| 📊 **Monitor active queries** | Live view of running queries |
| ❌ **Disconnect & Exit** | Close connection and quit |

### When you don't have a `.env`

1. **Localhost** — Enter host, port, user, password, database
2. **External / URI** — Paste the full `postgresql://` connection string

### Tips

- **Ctrl+C** — Safe exit
- Blank insert fields → use DEFAULT or NULL
- Table and database names: letters, numbers, underscores, or hyphens
- Dangerous SQL is blocked in table creation
- Dropping the database you're connected to? PgShell reconnects to `postgres` automatically

---

## 📝 Examples

**List tables from CLI**
```bash
pgshell table
# or for a specific database
pgshell table my_database
```

**Quick SQL**
```bash
pgshell query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
```

**Create a table** (interactive)
```bash
pgshell
# → Create new table
# Name: users
# Columns: id SERIAL PRIMARY KEY, email VARCHAR(255), created_at TIMESTAMP DEFAULT NOW()
```

**Insert a row** (interactive)
```bash
pgshell
# → Add new row → pick table → enter values
```

---

## 📂 Project Structure

```
pgshell/
├── src/
│   ├── index.ts                 # CLI entry, Commander
│   ├── cli/
│   │   ├── flags.ts            # --json / --csv / --quiet
│   │   └── output.ts           # Shared emitters
│   ├── commands/
│   │   ├── query.ts             # Direct query command
│   │   ├── exec.ts              # SQL file runner
│   │   ├── doctor.ts            # Connection health
│   │   ├── config.ts            # Saved profile show/clear
│   │   ├── completion.ts        # Shell completion scripts
│   │   ├── database.ts         # list/create/drop DB commands
│   │   ├── table.ts            # List tables command
│   │   └── delete.ts           # Drop all tables command
│   ├── db/
│   │   ├── client.ts           # Connection pool, pg wrapper
│   │   ├── connectionResolver.ts # .env + keychain + prompt resolution
│   │   ├── credentials.ts     # Keychain + ~/.pgshell/config
│   │   ├── queryHistory.ts    # Interactive SQL history
│   │   ├── cliCredentials.ts  # Interactive credential prompts
│   │   └── env.ts             # .env hint printing
│   ├── ui/
│   │   ├── mainMenu.ts         # Interactive menu
│   │   ├── tableRenderer.ts   # cli-table3 output
│   │   └── fuzzySelect.ts     # Fuzzy search selection
│   └── utils/
│       ├── banner.ts           # ASCII banner
│       ├── sanitizeError.ts   # Error sanitization
│       ├── spinner.ts         # ora spinner wrapper
│       ├── sqlHighlight.ts    # SQL syntax highlighting
│       ├── sqlIdent.ts        # Identifier escape/validation
│       └── promptConfirm.ts   # y/N CLI confirmation
├── tests/                       # Unit tests (Vitest)
├── .github/workflows/ci.yml     # CI pipeline
├── .env.example
├── package.json
└── README.md
```

### NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run with hot reload |
| `npm run build` | Build to `dist/` |
| `npm start` | Run built output |
| `npm run typecheck` | TypeScript check without emit |
| `npm run lint` | ESLint |
| `npm test` | Run unit tests |
| `npm run ci` | Typecheck + lint + test + build |

---

## 🔧 Troubleshooting

**"Missing database credentials"**  
Create a `.env` in the folder where you run `pgshell`, or run from a terminal so PgShell can prompt you. For non-interactive use (scripts, CI), you must provide credentials via `.env` or `DATABASE_URL`.

**Connection refused**  
Ensure PostgreSQL is running and the host/port in your config are correct. For remote servers, check firewall and SSH/network access.

**SSL errors**  
For cloud providers (e.g. AWS RDS, Supabase), SSL is usually required. Use a URL with `sslmode=require` or the provider's recommended params.

---

## 📄 License

[ISC](./LICENSE)

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security reports: [SECURITY.md](./SECURITY.md).
