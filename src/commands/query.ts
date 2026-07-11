import chalk from 'chalk';
import { connect, disconnect, query } from '../db/client.js';
import { resolveConnection } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { printEnvHint } from '../db/env.js';
import { sanitizeErrorMessage } from '../utils/sanitizeError.js';
import { withSpinner } from '../utils/spinner.js';
import { highlightSql } from '../utils/sqlHighlight.js';
import type { CliFlags } from '../cli/flags.js';
import { emitRows, logInfo } from '../cli/output.js';
import { resolveCliFlags } from '../cli/flags.js';

export async function executeQueryCommand(sql: string, flagsInput: Partial<CliFlags> = {}) {
  const flags = resolveCliFlags(flagsInput);
  let connectionString: string;
  try {
    const resolved = await resolveConnection(promptForCredentials);
    if (!resolved.targetDatabase) {
      console.error(chalk.red('\nError: query command requires a target database. Add DB_NAME to your .env file.\n'));
      printEnvHint();
      process.exit(1);
    }
    connectionString = resolved.connectionString;
  } catch (err) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('\nError: Missing database credentials. Run from a terminal or create a .env file with DB_NAME.\n'));
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
      : await withSpinner('Running query...', run, { failMessage: 'Query failed' });

    const commandLabel = result.command || 'query';
    const rows = (result.rows ?? []) as Record<string, unknown>[];

    if (flags.format === 'human') {
      logInfo(flags, chalk.dim('\nQuery: ') + highlightSql(sql));
      const rowCount = result.rowCount !== null ? `(${result.rowCount} rows affected)` : '';
      console.log(chalk.green(`\n✓ ${chalk.bold(commandLabel)} ${rowCount}`));
      if (rows.length > 0) {
        emitRows(flags, rows);
      } else {
        console.log(chalk.dim('No rows returned.'));
      }
      return;
    }

    emitRows(flags, rows, {
      jsonEnvelope: {
        command: commandLabel,
        rowCount: result.rowCount,
        sql
      }
    });
  } catch (error: unknown) {
    console.error(chalk.red(`\nQuery Error: ${sanitizeErrorMessage(error)}`));
    process.exit(1);
  } finally {
    await disconnect();
  }
}
