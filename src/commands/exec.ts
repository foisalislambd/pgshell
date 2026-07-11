import { readFileSync } from 'fs';
import chalk from 'chalk';
import { connect, disconnect, query } from '../db/client.js';
import { resolveConnection } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { printEnvHint } from '../db/env.js';
import { sanitizeErrorMessage } from '../utils/sanitizeError.js';
import { withSpinner } from '../utils/spinner.js';
import type { CliFlags } from '../cli/flags.js';
import { resolveCliFlags } from '../cli/flags.js';
import { emitRows, logInfo, printJson } from '../cli/output.js';

/**
 * Run a SQL file as a single script (PostgreSQL accepts multiple statements).
 * Not a migration runner — keep scripts simple.
 */
export async function executeExecCommand(filePath: string, flagsInput: Partial<CliFlags> = {}) {
  const flags = resolveCliFlags(flagsInput);
  let sql: string;
  try {
    sql = readFileSync(filePath, 'utf8');
  } catch {
    console.error(chalk.red(`\nError: Could not read SQL file: ${filePath}\n`));
    process.exit(1);
  }

  if (!sql.trim()) {
    console.error(chalk.red('\nError: SQL file is empty.\n'));
    process.exit(1);
  }

  let connectionString: string;
  try {
    const resolved = await resolveConnection(promptForCredentials);
    if (!resolved.targetDatabase) {
      console.error(chalk.red('\nError: exec requires a target database. Add DB_NAME to your .env file.\n'));
      printEnvHint();
      process.exit(1);
    }
    connectionString = resolved.connectionString;
  } catch (err) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('\nError: Missing database credentials.\n'));
      printEnvHint();
    } else {
      console.error(chalk.red(`\nError: ${sanitizeErrorMessage(err)}\n`));
    }
    process.exit(1);
  }

  try {
    await connect({ connectionString });
    const run = () => query(sql);
    const result = flags.quiet
      ? await run()
      : await withSpinner(`Running ${filePath}...`, run, { failMessage: 'Script failed' });

    const rows = (result.rows ?? []) as Record<string, unknown>[];
    const commandLabel = result.command || 'script';

    if (flags.format === 'json') {
      printJson({
        ok: true,
        file: filePath,
        command: commandLabel,
        rowCount: result.rowCount,
        rows
      });
      return;
    }

    if (flags.format === 'csv') {
      emitRows(flags, rows);
      return;
    }

    logInfo(flags, chalk.green(`\n✓ Executed ${filePath} (${commandLabel})`));
    if (rows.length > 0) {
      emitRows(flags, rows);
    }
  } catch (error: unknown) {
    console.error(chalk.red(`\nExec Error: ${sanitizeErrorMessage(error)}`));
    process.exit(1);
  } finally {
    await disconnect();
  }
}
