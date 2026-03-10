import chalk from 'chalk';
import readline from 'readline';
import { connect, disconnect, query, runOnDatabase } from '../db/client.js';
import { renderTable } from '../ui/tableRenderer.js';
import { resolveConnection, replaceDatabaseInUrl } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { printEnvHint } from '../db/env.js';
import { sanitizeErrorMessage } from '../utils/sanitizeError.js';

export async function executeDbListCommand() {
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
    console.log(chalk.cyan('\nDatabases on server:'));
    renderTable(result.rows);
  } catch (error: unknown) {
    console.error(chalk.red(`\nError: ${sanitizeErrorMessage(error)}`));
    process.exit(1);
  } finally {
    await disconnect();
  }
}

export async function executeDbCreateCommand(name: string) {
  const dbName = name.trim();
  if (!dbName) {
    console.error(chalk.red('\nError: Database name cannot be empty.\n'));
    process.exit(1);
  }

  const escaped = dbName.replace(/"/g, '""');

  // Must connect to an existing DB (postgres) to run CREATE DATABASE
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
    console.log(chalk.green(`\n✓ Database "${dbName}" created successfully!`));
  } catch (error: unknown) {
    console.error(chalk.red(`\nError: ${sanitizeErrorMessage(error)}`));
    process.exit(1);
  } finally {
    await disconnect();
  }
}

function promptConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y|yes$/i.test(answer.trim()));
    });
  });
}

export async function executeDbDropCommand(name: string, force = false) {
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

  const escaped = dbName.replace(/"/g, '""');

  if (!force) {
    const confirmed = await promptConfirmation(
      chalk.yellow(`\nAre you sure you want to DROP database "${dbName}"? All data will be lost. (y/N): `)
    );
    if (!confirmed) {
      console.log(chalk.gray('Cancelled.'));
      process.exit(0);
    }
  }

  try {
    await connect({ connectionString });
    await runOnDatabase('postgres', async (adminPool) => {
      await adminPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName]
      );
      await adminPool.query(`DROP DATABASE "${escaped}"`);
    });
    console.log(chalk.green(`\n✓ Database "${dbName}" dropped successfully!`));
  } catch (error: unknown) {
    console.error(chalk.red(`\nError: ${sanitizeErrorMessage(error)}`));
    process.exit(1);
  } finally {
    await disconnect();
  }
}
