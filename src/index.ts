#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runInteractiveUI } from './ui/mainMenu.js';
import { executeQueryCommand } from './commands/query.js';
import { executeDbListCommand, executeDbCreateCommand, executeDbDropCommand } from './commands/database.js';
import { executeTableCommand } from './commands/table.js';
import { executeDeleteCommand } from './commands/delete.js';
import chalk from 'chalk';
import { sanitizeErrorMessage } from './utils/sanitizeError.js';

config(); // Load .env file automatically

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };

const program = new Command();

program
  .name('pgshell')
  .description('All-in-one powerful and human-friendly PostgreSQL CLI Manager')
  .version(pkg.version)
  .addHelpText(
    'after',
    `
Commands:
  ui, view     Interactive menu (default) — browse DBs, tables, run SQL
  query <sql>  Run a raw SQL query
  list         List all databases with sizes
  create       Create a new database
  drop         Drop a database (use --yes to skip confirmation)
  table        List all tables in a database
  delete       Drop all tables in a database

Config: .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) or DATABASE_URL.
Run "pgshell <command> --help" for details on any command.`
  );

// Helper to handle any top-level graceful exits
const handleExit = (error: unknown) => {
  const e = error as Error & { name?: string };
  if (e?.name === 'ExitPromptError' || e?.message?.includes('SIGINT')) {
    console.log(chalk.gray('\nGoodbye! 👋\n'));
    process.exit(0);
  } else {
    console.error(chalk.red(`\nFatal Error: ${sanitizeErrorMessage(error)}\n`));
    process.exit(1);
  }
};

// Interactive Mode (Default if no args)
const launchUI = async () => {
  try {
    await runInteractiveUI();
  } catch (error) {
    handleExit(error);
  }
};

program
  .command('ui', { isDefault: true })
  .description('Launch the interactive menu for databases and tables')
  .addHelpText(
    'after',
    `
Examples:
  pgshell          Start interactive UI (default)
  pgshell ui       Same as above

Use .env or enter credentials when prompted. Browse databases, tables,
run SQL, monitor queries, create/drop tables — all from the menu.`
  )
  .action(launchUI);

program
  .command('view')
  .description('Launch the interactive UI (alias for ui)')
  .action(launchUI);

// List tables
program
  .command('table [dbName]')
  .description('List all tables in a database with schema, owner, and row estimates')
  .addHelpText(
    'after',
    `
Examples:
  pgshell table              Use .env DB or fuzzy-select database
  pgshell table my_database  List tables in my_database directly

Shows: schema, table name, type, owner, estimated row count.`
  )
  .action(async (dbName?: string) => {
    try {
      await executeTableCommand(dbName);
    } catch (error) {
      handleExit(error);
    }
  });

// Direct Query Execution
program
  .command('query <sql>')
  .description('Execute a raw SQL query and display formatted results')
  .addHelpText(
    'after',
    `
Examples:
  pgshell query "SELECT * FROM users LIMIT 5"
  pgshell query "SELECT COUNT(*) FROM orders"
  pgshell query "INSERT INTO logs (message) VALUES ('test')"

Requires .env credentials. Output is formatted as a table. Exits with code 1 on errors.`
  )
  .action(async (sql) => {
    try {
      await executeQueryCommand(sql);
    } catch (error) {
      handleExit(error);
    }
  });

// Database commands
program
  .command('list')
  .description('List all databases on the server with sizes')
  .addHelpText(
    'after',
    `
Examples:
  pgshell list

Shows database names and sizes (human-readable). Uses .env or prompts for credentials.`
  )
  .action(async () => {
    try {
      await executeDbListCommand();
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('create <name>')
  .description('Create a new database')
  .addHelpText(
    'after',
    `
Examples:
  pgshell create my_app_db
  pgshell create test_backup

Connects to postgres by default. Database name: letters, numbers, underscores only.`
  )
  .action(async (name) => {
    try {
      await executeDbCreateCommand(name);
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('drop <name>')
  .description('Drop a database (prompts for confirmation unless --yes)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .addHelpText(
    'after',
    `
Examples:
  pgshell drop old_database       Prompts: "Are you sure?"
  pgshell drop old_database --yes No prompt, drops immediately

Cannot be undone. If you drop the DB you're connected to, PgShell reconnects to postgres.`
  )
  .action(async (name, opts: { yes?: boolean }) => {
    try {
      await executeDbDropCommand(name, opts?.yes ?? false);
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('delete [dbName]')
  .description('Drop all tables in the public schema of a database')
  .addHelpText(
    'after',
    `
Examples:
  pgshell delete              Use .env DB or fuzzy-select database
  pgshell delete my_database  Drop all tables in my_database

Prompts for confirmation before dropping. Cannot be undone. Shows table list before asking.`
  )
  .action(async (dbName?: string) => {
    try {
      await executeDeleteCommand(dbName);
    } catch (error) {
      handleExit(error);
    }
  });

// Catch unhandled rejections globally from Commander
program.parseAsync(process.argv).catch(handleExit);
