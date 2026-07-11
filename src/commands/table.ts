import chalk from 'chalk';
import { connect, disconnect, query } from '../db/client.js';
import { resolveConnection, replaceDatabaseInUrl } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { fuzzySelect } from '../ui/fuzzySelect.js';
import { printEnvHint } from '../db/env.js';
import { sanitizeErrorMessage } from '../utils/sanitizeError.js';
import type { CliFlags } from '../cli/flags.js';
import { resolveCliFlags } from '../cli/flags.js';
import { emitRows, logDim } from '../cli/output.js';

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

export async function executeTableCommand(dbNameArg?: string, flagsInput: Partial<CliFlags> = {}) {
  const flags = resolveCliFlags(flagsInput);
  try {
    const resolved = await resolveConnection(promptForCredentials);

    let connectionString = resolved.connectionString;
    let targetDbName: string | null;

    if (dbNameArg?.trim()) {
      targetDbName = dbNameArg.trim();
      connectionString = replaceDatabaseInUrl(resolved.connectionString, targetDbName);
      logDim(flags, `Connecting to "${targetDbName}"...\n`);
    } else if (resolved.targetDatabase) {
      targetDbName = resolved.targetDatabase;
      logDim(flags, `Using .env → connecting to "${targetDbName}"\n`);
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
        if (flags.format === 'json') {
          console.log(JSON.stringify({ database: null, rowCount: 0, rows: [] }, null, 2));
        } else {
          console.log(chalk.yellow('No databases found on server.'));
        }
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
      logDim(flags, `Connecting to "${selected}"...\n`);
    }

    await connect({ connectionString });

    try {
      await query('ANALYZE');
    } catch {
      /* ANALYZE can fail on read-only replicas - proceed anyway */
    }

    const result = await query(GET_TABLES_SQL);
    const rows = result.rows as Record<string, unknown>[];

    emitRows(flags, rows, {
      jsonEnvelope: { type: 'tables', database: targetDbName },
      humanTitle: `\nTables${targetDbName ? ` (database: ${targetDbName})` : ''}:`,
      emptyHumanMessage: 'No tables found in public schema.'
    });
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
