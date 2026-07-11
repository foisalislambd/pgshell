import chalk from 'chalk';
import { connect, disconnect, query } from '../db/client.js';
import { resolveConnection, replaceDatabaseInUrl } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { printEnvHint } from '../db/env.js';
import { sanitizeErrorMessage } from '../utils/sanitizeError.js';
import { promptConfirmation } from '../utils/promptConfirm.js';
import { escapeSqlIdentifier, isValidIdentifierName } from '../utils/sqlIdent.js';
import type { CliFlags } from '../cli/flags.js';
import { resolveCliFlags } from '../cli/flags.js';
import { emitRows, logInfo } from '../cli/output.js';

export async function executeDbListCommand(flagsInput: Partial<CliFlags> = {}) {
  const flags = resolveCliFlags(flagsInput);
  let connectionString: string;
  try {
    const resolved = await resolveConnection(promptForCredentials);
    connectionString = replaceDatabaseInUrl(resolved.connectionString, 'postgres');
  } catch (err) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('\nError: Missing database credentials. Run from a terminal or create a .env file.\n'));
      printEnvHint();
    } else {
      console.error(chalk.red(`\nError: ${sanitizeErrorMessage(err)}\n`));
    }
    process.exit(1);
  }

  try {
    await connect({ connectionString });
    const result = await query(`
      SELECT datname as "Database", pg_size_pretty(pg_database_size(datname)) as "Size"
      FROM pg_database
      WHERE datistemplate = false
      ORDER BY datname
    `);
    const rows = result.rows as Record<string, unknown>[];
    emitRows(flags, rows, {
      jsonEnvelope: { type: 'databases' },
      humanTitle: '\nDatabases on server:',
      emptyHumanMessage: 'No databases found.'
    });
  } catch (error: unknown) {
    console.error(chalk.red(`\nError: ${sanitizeErrorMessage(error)}`));
    process.exit(1);
  } finally {
    await disconnect();
  }
}

export async function executeDbCreateCommand(name: string, flagsInput: Partial<CliFlags> = {}) {
  const flags = resolveCliFlags(flagsInput);
  const dbName = name.trim();
  if (!dbName) {
    console.error(chalk.red('\nError: Database name cannot be empty.\n'));
    process.exit(1);
  }

  if (!isValidIdentifierName(dbName)) {
    console.error(
      chalk.red(
        '\nError: Database name must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens.\n'
      )
    );
    process.exit(1);
  }

  const escaped = escapeSqlIdentifier(dbName);

  let adminConnectionString: string;
  try {
    const resolved = await resolveConnection(promptForCredentials);
    adminConnectionString = replaceDatabaseInUrl(resolved.connectionString, 'postgres');
  } catch (err) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('\nError: Missing database credentials. Run from a terminal or create a .env file.\n'));
      printEnvHint();
    } else {
      console.error(chalk.red(`\nError: ${sanitizeErrorMessage(err)}\n`));
    }
    process.exit(1);
  }

  try {
    await connect({ connectionString: adminConnectionString });
    await query(`CREATE DATABASE "${escaped}"`);
    if (flags.format !== 'human') {
      console.log(JSON.stringify({ ok: true, created: dbName }, null, 2));
    } else {
      logInfo(flags, chalk.green(`\n✓ Database "${dbName}" created successfully!`));
    }
  } catch (error: unknown) {
    console.error(chalk.red(`\nError: ${sanitizeErrorMessage(error)}`));
    process.exit(1);
  } finally {
    await disconnect();
  }
}

export async function executeDbDropCommand(
  name: string,
  force = false,
  flagsInput: Partial<CliFlags> = {}
) {
  const flags = resolveCliFlags(flagsInput);
  let connectionString: string;
  try {
    const resolved = await resolveConnection(promptForCredentials);
    connectionString = replaceDatabaseInUrl(resolved.connectionString, 'postgres');
  } catch (err) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('\nError: Missing database credentials. Run from a terminal or create a .env file.\n'));
      printEnvHint();
    } else {
      console.error(chalk.red(`\nError: ${sanitizeErrorMessage(err)}\n`));
    }
    process.exit(1);
  }

  const dbName = name.trim();
  if (!dbName) {
    console.error(chalk.red('\nError: Database name cannot be empty.\n'));
    process.exit(1);
  }

  if (!isValidIdentifierName(dbName)) {
    console.error(
      chalk.red(
        '\nError: Database name must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens.\n'
      )
    );
    process.exit(1);
  }

  const escaped = escapeSqlIdentifier(dbName);

  if (!force) {
    const confirmed = await promptConfirmation(
      chalk.yellow(`\nAre you sure you want to DROP database "${dbName}"? All data will be lost. (y/N): `)
    );
    if (!confirmed) {
      logInfo(flags, chalk.gray('Cancelled.'));
      process.exit(0);
    }
  }

  try {
    await connect({ connectionString });
    await query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await query(`DROP DATABASE "${escaped}"`);
    if (flags.format !== 'human') {
      console.log(JSON.stringify({ ok: true, dropped: dbName }, null, 2));
    } else {
      logInfo(flags, chalk.green(`\n✓ Database "${dbName}" dropped successfully!`));
    }
  } catch (error: unknown) {
    console.error(chalk.red(`\nError: ${sanitizeErrorMessage(error)}`));
    process.exit(1);
  } finally {
    await disconnect();
  }
}
