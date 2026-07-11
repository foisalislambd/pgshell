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
import { executeExecCommand } from './commands/exec.js';
import { executeDoctorCommand } from './commands/doctor.js';
import { executeConfigShowCommand, executeConfigClearCommand } from './commands/config.js';
import { printCompletionScript } from './commands/completion.js';
import { flagsFromCommandOpts } from './cli/flags.js';
import chalk from 'chalk';
import { sanitizeErrorMessage } from './utils/sanitizeError.js';

config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };

const program = new Command();

program
  .name('pgshell')
  .description('All-in-one powerful and human-friendly PostgreSQL CLI Manager')
  .version(pkg.version)
  .option('--json', 'Machine-readable JSON output (implies quiet)')
  .option('--csv', 'CSV output for tabular results (implies quiet; ignored if --json)')
  .option('-q, --quiet', 'Suppress non-essential human messages')
  .addHelpText(
    'after',
    `
Commands:
  ui, view          Interactive menu (default)
  query <sql>       Run a raw SQL query
  exec <file.sql>   Run a SQL file
  list              List databases with sizes
  create            Create a database
  drop              Drop a database (--yes to skip confirm)
  table             List tables in a database
  delete            Drop all tables in a database
  doctor            Connection health check
  config show|clear Saved profile (no passwords printed)
  completion        Print shell completion script

Global flags: --json  --csv  -q/--quiet
Config: .env (DB_NAME, …) or DATABASE_URL; saved keychain profile as fallback.
Run "pgshell <command> --help" for details.`
  );

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

const getFlags = (cmd: Command) => flagsFromCommandOpts(cmd.optsWithGlobals());

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
  .action(launchUI);

program.command('view').description('Launch the interactive UI (alias for ui)').action(launchUI);

program
  .command('table [dbName]')
  .description('List all tables in a database with schema, owner, and row estimates')
  .action(async (dbName: string | undefined, _opts, cmd: Command) => {
    try {
      await executeTableCommand(dbName, getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('query <sql>')
  .description('Execute a raw SQL query and display formatted results')
  .action(async (sql: string, _opts, cmd: Command) => {
    try {
      await executeQueryCommand(sql, getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('exec <file>')
  .description('Execute a SQL file against the target database')
  .addHelpText(
    'after',
    `
Examples:
  pgshell exec ./scripts/seed.sql
  pgshell exec ./scripts/seed.sql --json

Runs the file contents as one script (not a migration framework).`
  )
  .action(async (file: string, _opts, cmd: Command) => {
    try {
      await executeExecCommand(file, getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('list')
  .description('List all databases on the server with sizes')
  .action(async (_opts, cmd: Command) => {
    try {
      await executeDbListCommand(getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('create <name>')
  .description('Create a new database')
  .action(async (name: string, _opts, cmd: Command) => {
    try {
      await executeDbCreateCommand(name, getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('drop <name>')
  .description('Drop a database (prompts for confirmation unless --yes)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (name: string, opts: { yes?: boolean }, cmd: Command) => {
    try {
      await executeDbDropCommand(name, opts?.yes ?? false, getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('delete [dbName]')
  .description('Drop all tables in the public schema of a database')
  .action(async (dbName: string | undefined) => {
    try {
      await executeDeleteCommand(dbName);
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('doctor')
  .description('Check connection health: latency, version, user, SSL')
  .action(async (_opts, cmd: Command) => {
    try {
      await executeDoctorCommand(getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

const configCmd = program.command('config').description('Manage saved connection profile');

configCmd
  .command('show')
  .description('Show saved profile (password never printed)')
  .action(async (_opts, cmd: Command) => {
    try {
      await executeConfigShowCommand(getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

configCmd
  .command('clear')
  .description('Clear saved profile and keychain password')
  .action(async (_opts, cmd: Command) => {
    try {
      await executeConfigClearCommand(getFlags(cmd));
    } catch (error) {
      handleExit(error);
    }
  });

program
  .command('completion <shell>')
  .description('Print shell completion script (bash|zsh|powershell)')
  .action((shell: string) => {
    printCompletionScript(shell);
  });

program.parseAsync(process.argv).catch(handleExit);
