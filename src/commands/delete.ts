import chalk from 'chalk';
import { connect, disconnect, query } from '../db/client.js';
import { resolveConnection, replaceDatabaseInUrl } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { fuzzySelect } from '../ui/fuzzySelect.js';
import { printEnvHint } from '../db/env.js';
import { sanitizeErrorMessage } from '../utils/sanitizeError.js';
import { promptConfirmation } from '../utils/promptConfirm.js';
import { CLEAN_PUBLIC_SCHEMA_SQL, PUBLIC_CLEANUP_DETAIL_SQL, formatCleanupItems, parseCleanupItems } from '../db/publicCleanup.js';

const GET_DATABASES_SQL = `
  SELECT datname as "Database", pg_size_pretty(pg_database_size(datname)) as "Size"
  FROM pg_database
  WHERE datistemplate = false
  ORDER BY datname;
`;

/**
 * Clear user objects in the public schema.
 * - pgshell delete database-name  → that database
 * - pgshell delete  → DB_NAME/DATABASE_URL, or an interactive pick
 */
export async function executeDeleteCommand(dbNameArg?: string): Promise<void> {
  try {
    const resolved = await resolveConnection(promptForCredentials);

    let connectionString = resolved.connectionString;
    let targetDbName: string;

    if (dbNameArg?.trim()) {
      targetDbName = dbNameArg.trim();
      connectionString = replaceDatabaseInUrl(resolved.connectionString, targetDbName);
      console.log(chalk.gray(`Target database: "${targetDbName}"\n`));
    } else if (resolved.targetDatabase) {
      targetDbName = resolved.targetDatabase;
      connectionString = replaceDatabaseInUrl(resolved.connectionString, targetDbName);
      console.log(chalk.gray(`Using .env → target database: "${targetDbName}"\n`));
    } else {
      if (!process.stdin.isTTY) {
        console.error(
          chalk.red(
            '\nError: No target database configured. Set DB_NAME in .env, pass a database name, or run from an interactive terminal.\n'
          )
        );
        printEnvHint();
        process.exit(1);
      }
      connectionString = replaceDatabaseInUrl(connectionString, 'postgres');
      await connect({ connectionString });

      const dbResult = await query(GET_DATABASES_SQL);
      const databases = dbResult.rows as { Database: string; Size: string }[];

      if (databases.length === 0) {
        console.log(chalk.yellow('No databases found on server.'));
        await disconnect();
        process.exit(1);
      }

      const selected = await fuzzySelect(
        'Select database to clean (type to search):',
        databases.map((r) => ({ name: `${r.Database} (${r.Size})`, value: r.Database }))
      );

      await disconnect();
      connectionString = replaceDatabaseInUrl(resolved.connectionString, selected);
      targetDbName = selected;
      console.log(chalk.gray(`Target database: "${selected}"\n`));
    }

    await connect({ connectionString });

    const detail = await query(PUBLIC_CLEANUP_DETAIL_SQL);
    const items = parseCleanupItems(detail.rows as { kind: string; name: string }[]);

    if (items.length === 0) {
      console.log(chalk.yellow(`Nothing to clean in "${targetDbName}". Extension objects are left in place.`));
      await disconnect();
      return;
    }

    console.log(chalk.cyan(`Public schema in "${targetDbName}" will be cleared:`));
    console.log(chalk.dim(formatCleanupItems(items)));
    console.log();

    const confirmed = await promptConfirmation(
      chalk.yellow(
        `Drop these tables, views, sequences, functions, and types in "${targetDbName}"? Extension objects stay. This cannot be undone. (y/N): `
      )
    );

    if (!confirmed) {
      console.log(chalk.gray('Cancelled.'));
      await disconnect();
      process.exit(0);
    }

    await query(CLEAN_PUBLIC_SCHEMA_SQL);
    console.log(chalk.green(`\n✓ Public schema cleaned in "${targetDbName}".`));
  } catch (err) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('\nError: Missing database credentials. Run from a terminal or create a .env file.\n'));
      printEnvHint();
    } else {
      console.error(chalk.red(`\nError: ${sanitizeErrorMessage(err)}\n`));
    }
    process.exit(1);
  } finally {
    await disconnect();
  }
}
