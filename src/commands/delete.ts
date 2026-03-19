import chalk from 'chalk';
import readline from 'readline';
import { connect, disconnect, query } from '../db/client.js';
import { resolveConnection, replaceDatabaseInUrl } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { fuzzySelect } from '../ui/fuzzySelect.js';
import { printEnvHint } from '../db/env.js';
import { sanitizeErrorMessage } from '../utils/sanitizeError.js';

const GET_DATABASES_SQL = `
  SELECT datname as "Database", pg_size_pretty(pg_database_size(datname)) as "Size"
  FROM pg_database
  WHERE datistemplate = false
  ORDER BY datname;
`;

const GET_TABLES_SQL = `
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
`;

const DROP_ALL_TABLES_SQL = `
  DO $$
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
      EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
  END $$;
`;

function promptConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y|yes$/i.test(answer.trim()));
    });
  });
}

/**
 * Delete (drop) all tables in a database.
 * - pgshell delete database-name  → drops all tables in that database
 * - pgshell delete  → if .env has DB_NAME/DATABASE_URL, use it; else prompt to select database
 */
export async function executeDeleteCommand(dbNameArg?: string): Promise<void> {
  try {
    const resolved = await resolveConnection(promptForCredentials);

    let connectionString = resolved.connectionString;
    let targetDbName: string;

    if (dbNameArg?.trim()) {
      // Direct database name provided
      targetDbName = dbNameArg.trim();
      connectionString = replaceDatabaseInUrl(resolved.connectionString, targetDbName);
      console.log(chalk.gray(`Target database: "${targetDbName}"\n`));
    } else if (resolved.targetDatabase) {
      // .env has database configured
      targetDbName = resolved.targetDatabase;
      connectionString = replaceDatabaseInUrl(resolved.connectionString, targetDbName);
      console.log(chalk.gray(`Using .env → target database: "${targetDbName}"\n`));
    } else {
      // No .env database - show selection
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
        'Select database to delete all tables from (type to search):',
        databases.map((r) => ({ name: `${r.Database} (${r.Size})`, value: r.Database }))
      );

      await disconnect();
      connectionString = replaceDatabaseInUrl(resolved.connectionString, selected);
      targetDbName = selected;
      console.log(chalk.gray(`Target database: "${selected}"\n`));
    }

    await connect({ connectionString });

    // Check how many tables exist
    const tablesResult = await query(GET_TABLES_SQL);
    const tables = tablesResult.rows as { tablename: string }[];

    if (tables.length === 0) {
      console.log(chalk.yellow(`No tables found in database "${targetDbName}". Nothing to delete.`));
      await disconnect();
      return;
    }

    console.log(chalk.cyan(`Found ${tables.length} table(s) in "${targetDbName}":`));
    tables.forEach((t) => console.log(chalk.dim(`  - ${t.tablename}`)));
    console.log();

    const confirmed = await promptConfirmation(
      chalk.yellow(`Are you sure you want to DROP all ${tables.length} table(s) in "${targetDbName}"? This cannot be undone. (y/N): `)
    );

    if (!confirmed) {
      console.log(chalk.gray('Cancelled.'));
      await disconnect();
      process.exit(0);
    }

    await query(DROP_ALL_TABLES_SQL);
    console.log(chalk.green(`\n✓ All ${tables.length} table(s) dropped from "${targetDbName}" successfully!`));
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
