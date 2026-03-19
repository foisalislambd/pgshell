import chalk from 'chalk';
import { connect, disconnect, query } from '../db/client.js';
import { renderTable } from '../ui/tableRenderer.js';
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
  SELECT 
    t.table_schema AS "Schema",
    t.table_name AS "Table",
    t.table_type AS "Type",
    COALESCE(pt.tableowner, '-') AS "Owner",
    COALESCE(pst.n_live_tup::text, '0') AS "Est. Rows"
  FROM information_schema.tables t
  LEFT JOIN pg_tables pt ON pt.tablename = t.table_name AND pt.schemaname = t.table_schema
  LEFT JOIN pg_stat_user_tables pst ON pst.relname = t.table_name AND pst.schemaname = t.table_schema
  WHERE t.table_schema = 'public'
  ORDER BY t.table_name;
`;

export async function executeTableCommand(dbNameArg?: string) {
  try {
    const resolved = await resolveConnection(promptForCredentials);

    let connectionString = resolved.connectionString;
    let targetDbName: string | null;

    if (dbNameArg?.trim()) {
      targetDbName = dbNameArg.trim();
      connectionString = replaceDatabaseInUrl(resolved.connectionString, targetDbName);
      console.log(chalk.gray(`Connecting to "${targetDbName}"...\n`));
    } else if (resolved.targetDatabase) {
      targetDbName = resolved.targetDatabase;
      console.log(chalk.gray(`Using .env → connecting to "${targetDbName}"\n`));
    } else {
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
        'Select database to view tables (type to search):',
        databases.map((r) => ({ name: `${r.Database} (${r.Size})`, value: r.Database }))
      );

      await disconnect();
      connectionString = replaceDatabaseInUrl(resolved.connectionString, selected);
      targetDbName = selected;
      console.log(chalk.gray(`Connecting to "${selected}"...\n`));
    }

    await connect({ connectionString });

    try {
      await query('ANALYZE');
    } catch {
      /* ANALYZE can fail on read-only replicas - proceed anyway */
    }

    const result = await query(GET_TABLES_SQL);

    if (result.rows.length === 0) {
      console.log(chalk.yellow('No tables found in public schema.'));
    } else {
      const dbLabel = targetDbName ? chalk.dim(` (database: ${targetDbName})`) : '';
      console.log(chalk.cyan('\nTables' + dbLabel + ':'));
      renderTable(result.rows);
    }
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
