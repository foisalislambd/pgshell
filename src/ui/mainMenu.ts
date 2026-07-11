import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { connect, disconnect, query as dbQuery, getAdminConnectionString, getConnectionString, runOnDatabase } from '../db/client.js';
import { renderTable } from './tableRenderer.js';
import { fuzzySelect } from './fuzzySelect.js';
import { resolveConnection, replaceDatabaseInUrl, getConnectionStringForDb } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { loadStoredProfile, saveStoredProfile, setStoredPassword, deleteStoredPassword, type StoredConnectionProfile } from '../db/credentials.js';
import { printBanner } from '../utils/banner.js';
import { isDatabaseDoesNotExistError, sanitizeErrorMessage } from '../utils/sanitizeError.js';
import { withSpinner } from '../utils/spinner.js';
import { highlightSql } from '../utils/sqlHighlight.js';
import { escapeSqlIdentifier, isValidIdentifierName } from '../utils/sqlIdent.js';

const GET_DATABASES_SQL = `
  SELECT datname as "Database", pg_size_pretty(pg_database_size(datname)) as "Size"
  FROM pg_database
  WHERE datistemplate = false
  ORDER BY datname;
`;

export async function runInteractiveUI() {
  console.clear();
  printBanner();

  let connected = false;
  let connectionString = '';

  while (!connected) {
    try {
      const resolved = await resolveConnection(promptForCredentials);

      if (resolved.targetDatabase) {
        console.log(chalk.gray(`Using .env → connecting directly to "${resolved.targetDatabase}"\n`));
      }
      connectionString = resolved.connectionString;

      /** When false, we already use the .env target DB (or user created it). When true, show DB picker. */
      let useDatabasePicker = !resolved.targetDatabase;

      try {
        await withSpinner(
          'Connecting...',
          async () => {
            await connect({ connectionString });
            connected = true;
          },
          { successMessage: chalk.green('Connected!\n') }
        );
      } catch (connectErr: unknown) {
        const ce = connectErr as Error & { name?: string };
        if (ce?.name === 'ExitPromptError' || ce?.message?.includes('SIGINT')) {
          throw connectErr;
        }

        const missingFromEnv =
          resolved.fromEnv &&
          Boolean(resolved.targetDatabase) &&
          isDatabaseDoesNotExistError(connectErr);

        if (!missingFromEnv) {
          throw connectErr;
        }

        if (!process.stdin.isTTY) {
          console.log(
            chalk.red(
              `\nDatabase "${resolved.targetDatabase}" does not exist. Open a terminal to create it interactively, or run:\n  pgshell create ${resolved.targetDatabase}\n`
            )
          );
          process.exit(1);
        }

        const createIt = await confirm({
          message: `Database "${resolved.targetDatabase}" does not exist on the server. Create it now?`,
          default: true
        });

        if (createIt) {
          const adminUrl = replaceDatabaseInUrl(connectionString, 'postgres');
          const dbName = resolved.targetDatabase!;
          const escaped = escapeSqlIdentifier(dbName);
          await withSpinner(
            `Creating database "${dbName}"...`,
            async () => {
              await connect({ connectionString: adminUrl });
              await dbQuery(`CREATE DATABASE "${escaped}"`);
              await disconnect();
              await connect({ connectionString });
            },
            { successMessage: chalk.green(`Database "${dbName}" created.\n`) }
          );
          connected = true;
        } else {
          const adminUrl = replaceDatabaseInUrl(connectionString, 'postgres');
          await withSpinner(
            'Connecting to postgres...',
            async () => {
              await connect({ connectionString: adminUrl });
            },
            { successMessage: chalk.green('Connected to postgres.\n') }
          );
          connected = true;
          useDatabasePicker = true;
        }
      }

      if (useDatabasePicker) {
        const result = await dbQuery(GET_DATABASES_SQL);
        const databases = result.rows as { Database: string; Size: string }[];
        if (databases.length === 0) {
          console.log(chalk.yellow('No databases found on server.'));
          process.exit(0);
        }
        const selected = await fuzzySelect(
          'Select database to connect to (type to search):',
          databases.map((r) => ({ name: `${r.Database} (${r.Size})`, value: r.Database }))
        );
        const newConnStr = replaceDatabaseInUrl(connectionString, selected);
        await disconnect();
        await connect({ connectionString: newConnStr });
        console.log(chalk.green(`✓ Connected to "${selected}"\n`));
      }

      break;
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (err?.name === 'ExitPromptError' || err?.message?.includes('SIGINT')) {
        console.log(chalk.gray('\nGoodbye! 👋\n'));
        process.exit(0);
      }
      console.log(chalk.red(`\nConnection failed: ${sanitizeErrorMessage(error)}\n`));
    }
  }

  // Main Loop
  let exit = false;
  while (!exit) {
    try {
      const currentDb = await getCurrentDatabase();
      const dbLabel = currentDb ? chalk.dim(` │ 📂 ${currentDb}`) : '';

      const menuChoices = [
        { name: chalk.cyan('Data') + '     🔍 View table data', value: 'view_table' as const, description: 'Browse rows in any table' },
        { name: chalk.cyan('Data') + '     📥 Add new row', value: 'insert_row' as const, description: 'Insert a record' },
        { name: chalk.green('Query') + '    ⚡ Run custom SQL', value: 'run_query' as const, description: 'Execute any SQL' },
        { name: chalk.green('Query') + '    📊 Monitor active queries', value: 'monitor' as const, description: 'See running queries' },
        { name: chalk.magenta('Schema') + '   📋 List all tables', value: 'list_tables' as const, description: 'See what tables exist' },
        { name: chalk.magenta('Schema') + '   📖 Table structure', value: 'describe_table' as const, description: 'See columns, types, details' },
        { name: chalk.magenta('Schema') + '   ➕ Create new table', value: 'create_table' as const, description: 'Create a new table' },
        { name: chalk.magenta('Schema') + '   🗑️  Delete one table', value: 'drop_table' as const, description: 'Remove a single table' },
        { name: chalk.red('Schema') + '   🚨 Delete all tables', value: 'drop_all_tables' as const, description: 'Warning! Removes all data' },
        { name: chalk.yellow('Server') + '   📂 List all databases', value: 'list_databases' as const, description: 'See all databases' },
        { name: chalk.yellow('Server') + '   🔄 Switch database', value: 'switch_database' as const, description: 'Reconnect to different DB' },
        { name: chalk.yellow('Server') + '   ➕ Create database', value: 'create_database' as const, description: 'Create new database' },
        { name: chalk.yellow('Server') + '   🗑️  Delete database', value: 'drop_database' as const, description: 'Remove database' },
        { name: chalk.gray('System') + '   🔐 Re-setup credentials', value: 'reset_credentials' as const, description: 'Update stored password (e.g. after password change)' },
        { name: chalk.gray('System') + '   ❌ Disconnect & Exit', value: 'exit' as const, description: 'Close and quit' }
      ];

      const action = await fuzzySelect(
        chalk.bold('What would you like to do?') + dbLabel + chalk.dim(' (type to filter)'),
        menuChoices,
        { pageSize: 15 }
      );

      switch (action) {
        case 'list_databases':
          await handleListDatabases();
          break;
        case 'create_database':
          await handleCreateDatabase();
          break;
        case 'drop_database':
          await handleDropDatabase();
          break;
        case 'switch_database':
          await handleSwitchDatabase();
          break;
        case 'reset_credentials':
          await handleResetCredentials();
          break;
        case 'list_tables':
          await handleListTables();
          break;
        case 'view_table':
          await handleViewTable();
          break;
        case 'describe_table':
          await handleDescribeTable();
          break;
        case 'create_table':
          await handleCreateTable();
          break;
        case 'insert_row':
          await handleInsertRow();
          break;
        case 'drop_table':
          await handleDropSpecificTable();
          break;
        case 'drop_all_tables':
          await handleDropAllTables();
          break;
        case 'run_query':
          await handleRunQuery();
          break;
        case 'monitor':
          await handleMonitor();
          break;
        case 'exit':
          exit = true;
          break;
      }
    } catch (err: unknown) {
      const e = err as Error & { name?: string };
      if (e?.name === 'ExitPromptError' || e?.message?.includes('SIGINT')) {
        console.log(chalk.gray('\nGoodbye! 👋\n'));
        await disconnect();
        process.exit(0);
      }
      console.log(chalk.red(`\nError: ${sanitizeErrorMessage(err)}`));
    }
    
    if (!exit) {
      console.log('\n');
    }
  }

  await disconnect();
  console.log(chalk.blue('Goodbye! 👋\n'));
}

const GET_TABLES_SQL = `
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name;
`;

async function getPublicTables(): Promise<{ table_name: string }[]> {
  const result = await dbQuery(GET_TABLES_SQL);
  return result.rows;
}

async function getCurrentDatabase(): Promise<string | null> {
  const r = await dbQuery('SELECT current_database() as db');
  return r.rows[0]?.db ?? null;
}

async function handleListDatabases() {
  const result = await dbQuery(GET_DATABASES_SQL);
  console.log(chalk.cyan('\nDatabases on server:'));
  renderTable(result.rows);
}

async function handleCreateDatabase() {
  const dbName = await input({
    message: 'Enter new database name (letters, numbers, underscores, hyphens):',
    validate: (val) => {
      const trimmed = val.trim();
      if (!trimmed) return 'Database name cannot be empty';
      if (!isValidIdentifierName(trimmed)) {
        return 'Must start with a letter/underscore; only letters, numbers, underscores, hyphens';
      }
      return true;
    }
  });

  const trimmed = dbName.trim();
  const escaped = escapeSqlIdentifier(trimmed);
  try {
    await runOnDatabase('postgres', async (adminPool) => {
      await adminPool.query(`CREATE DATABASE "${escaped}"`);
    });
    console.log(chalk.green(`\n✓ Database "${trimmed}" created! You can switch to it from the menu anytime.`));
  } catch (err: unknown) {
    console.log(chalk.red(`\nFailed to create database: ${sanitizeErrorMessage(err)}`));
  }
}

async function handleDropDatabase() {
  const result = await dbQuery(GET_DATABASES_SQL);
  const databases = result.rows as { Database: string; Size: string }[];
  const currentDb = await getCurrentDatabase();

  if (databases.length === 0) {
    console.log(chalk.yellow('No databases found.'));
    return;
  }

  const dbToDrop = await fuzzySelect(
    'Select a database to DROP (type to search):',
    databases.map((r) => ({
      name: `${r.Database} (${r.Size})` + (r.Database === currentDb ? ' [current]' : ''),
      value: r.Database
    }))
  );

  const isSure = await confirm({
    message: `Are you sure you want to DROP database "${dbToDrop}"? All data will be permanently lost!`,
    default: false
  });

  if (!isSure) {
    console.log(chalk.gray('\nOperation cancelled.'));
    return;
  }

  const escapedDrop = escapeSqlIdentifier(dbToDrop);
  try {
    const postgresUrl = dbToDrop === currentDb ? getAdminConnectionString('postgres') : null;
    await runOnDatabase('postgres', async (adminPool) => {
      await adminPool.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [dbToDrop]);
      await adminPool.query(`DROP DATABASE "${escapedDrop}"`);
    });
    console.log(chalk.green(`\n✓ Database "${dbToDrop}" dropped successfully!`));
    if (dbToDrop === currentDb && postgresUrl) {
      console.log(chalk.yellow('\nYou were connected to that database. Reconnecting to postgres...'));
      await disconnect();
      await connect({ connectionString: postgresUrl });
      console.log(chalk.green('✓ Reconnected to postgres.'));
    }
  } catch (err: unknown) {
    console.log(chalk.red(`\nFailed to drop database: ${sanitizeErrorMessage(err)}`));
  }
}

async function handleSwitchDatabase() {
  const result = await dbQuery(GET_DATABASES_SQL);
  const databases = result.rows as { Database: string; Size: string }[];
  const currentDb = await getCurrentDatabase();

  if (databases.length === 0) {
    console.log(chalk.yellow('No databases found.'));
    return;
  }

  const dbToSwitch = await fuzzySelect(
    'Select database to connect to (type to search):',
    databases.map((r) => ({
      name: `${r.Database} (${r.Size})` + (r.Database === currentDb ? ' [current]' : ''),
      value: r.Database
    }))
  );

  if (dbToSwitch === currentDb) {
    console.log(chalk.gray('\nAlready connected to that database.'));
    return;
  }

  const newUrl = getAdminConnectionString(dbToSwitch);
  const fallbackUrl = getAdminConnectionString(currentDb || 'postgres');
  if (!newUrl) {
    console.log(chalk.red('\nCould not build connection string.'));
    return;
  }

  try {
    await disconnect();
    await connect({ connectionString: newUrl });
    console.log(chalk.green(`\n✓ You're now working with "${dbToSwitch}".`));
  } catch (err: unknown) {
    console.log(chalk.red(`\nFailed to switch: ${sanitizeErrorMessage(err)}`));
    if (fallbackUrl) {
      console.log(chalk.yellow('Attempting to reconnect to previous database...'));
      try {
        await connect({ connectionString: fallbackUrl });
        console.log(chalk.green('✓ Reconnected to previous database.'));
      } catch {
        console.log(chalk.red('Reconnection failed. You may need to reconnect manually.'));
      }
    }
  }
}

async function handleResetCredentials() {
  let existingProfile = loadStoredProfile();
  const currentConn = getConnectionString();
  let existingQueryString: string | null = existingProfile?.queryString ?? null;
  if (currentConn) {
    try {
      const url = new URL(currentConn);
      existingProfile = {
        host: url.hostname,
        port: url.port || '5432',
        user: decodeURIComponent(url.username || 'postgres')
      };
      existingQueryString = url.search ? url.search.slice(1) : null;
    } catch {
      /* use loadStoredProfile if parse fails */
    }
  }

  try {
    const prompted = await promptForCredentials(existingProfile ?? undefined);

    const currentDb = await getCurrentDatabase();
    const queryString = prompted.queryString ?? existingQueryString;
    const db = prompted.database || currentDb || 'postgres';

    const profile: StoredConnectionProfile = {
      host: prompted.host,
      port: prompted.port,
      user: prompted.user,
      database: db,
      ...(queryString ? { queryString } : {})
    };

    // Drop old keychain entry when host/port/user change
    if (
      existingProfile &&
      (existingProfile.host !== profile.host ||
        existingProfile.port !== profile.port ||
        existingProfile.user !== profile.user)
    ) {
      await deleteStoredPassword(existingProfile);
    }

    await setStoredPassword(profile, prompted.password);
    saveStoredProfile(profile);

    const newConnStr = getConnectionStringForDb(
      prompted.host,
      prompted.port,
      prompted.user,
      prompted.password,
      db,
      queryString
    );

    await disconnect();
    await connect({ connectionString: newConnStr });
    console.log(chalk.green(`\n✓ Credentials updated and reconnected. New password will be used from next run.`));
  } catch (err: unknown) {
    const e = err as Error & { name?: string };
    if (e?.name === 'ExitPromptError' || e?.message?.includes('SIGINT')) {
      throw err;
    }
    console.log(chalk.red(`\nFailed to reset credentials: ${sanitizeErrorMessage(err)}`));
  }
}

async function handleListTables() {
  // ANALYZE refreshes stats so Est. Rows shows approximate counts (otherwise 0 until first analyze)
  try {
    await dbQuery('ANALYZE');
  } catch {
    /* proceed anyway - ANALYZE can fail on read-only replicas */
  }

  const sql = `
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
  const result = await dbQuery(sql);
  renderTable(result.rows);
}

async function handleDescribeTable() {
  const tables = await getPublicTables();
  if (tables.length === 0) {
    console.log(chalk.yellow('No tables found in public schema.'));
    return;
  }
  const tableName = await fuzzySelect(
    'Select a table to describe (type to search):',
    tables.map((r) => ({ name: r.table_name, value: r.table_name }))
  );

  const sql = `
    SELECT 
        column_name as "Column", 
        data_type as "Type", 
        is_nullable as "Nullable", 
        column_default as "Default"
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position;
  `;
  
  const result = await dbQuery(sql, [tableName]);
  console.log(chalk.cyan(`\nStructure of table "${tableName}":`));
  renderTable(result.rows);
}

async function handleViewTable() {
  const tables = await getPublicTables();
  if (tables.length === 0) {
    console.log(chalk.yellow('No tables found in public schema.'));
    return;
  }
  const tableName = await fuzzySelect(
    'Select a table to view (type to search):',
    tables.map((r) => ({ name: r.table_name, value: r.table_name }))
  );

  const limit = await input({
    message: 'How many rows to fetch?',
    default: '10',
    validate: (val) => !isNaN(Number(val)) ? true : 'Please enter a valid number'
  });

  const escapedTable = escapeSqlIdentifier(tableName);
  const result = await dbQuery(`SELECT * FROM "${escapedTable}" LIMIT $1`, [Number(limit)]);
  console.log(chalk.cyan(`\nShowing up to ${limit} rows from "${tableName}":`));
  renderTable(result.rows);
}

function getInsertHint(columnName: string, dataType: string, isAutoInc: boolean, columnDefault: string | null): string {
  if (isAutoInc) return chalk.dim(' [leave blank for auto]');
  const lower = columnName.toLowerCase();
  const type = dataType.toLowerCase();
  const hasDefault = columnDefault && !columnDefault.includes('nextval');

  if (type.includes('timestamp') || type === 'date') return chalk.dim(' [leave blank for NOW()]');
  if (type.includes('boolean') || type === 'bool') return chalk.dim(' [true/false]');
  if (type.includes('int') || type === 'serial' || type === 'bigserial') return chalk.dim(' [e.g. 42]');
  if (type.includes('uuid')) return chalk.dim(' [e.g. 550e8400-e29b-41d4-a716-446655440000]');
  if ((type.includes('varchar') || type === 'text' || type.includes('character')) && lower.includes('email')) return chalk.dim(' [e.g. user@example.com]');
  if ((type.includes('varchar') || type === 'text') && (lower.includes('name') || lower.includes('title'))) return chalk.dim(' [e.g. John Doe]');
  if (hasDefault) return chalk.dim(' [leave blank for default]');
  return chalk.dim(' [leave blank for NULL]');
}

async function handleInsertRow() {
  const tables = await getPublicTables();
  if (tables.length === 0) {
    console.log(chalk.yellow('No tables found to insert data into.'));
    return;
  }
  const tableName = await fuzzySelect(
    'Select a table to insert into (type to search):',
    tables.map((r) => ({ name: r.table_name, value: r.table_name }))
  );

  // Get column info to prompt user correctly
  const colInfo = await dbQuery(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position;
  `, [tableName]);

  const rowData: Record<string, string> = {};
  console.log(chalk.dim(`\nInserting a new row into "${tableName}". Leave blank to use DEFAULT/NULL.`));

  for (const col of colInfo.rows) {
    const isAutoInc = col.column_default && col.column_default.includes('nextval');
    const hint = getInsertHint(col.column_name, col.data_type, isAutoInc, col.column_default);

    const value = await input({
      message: `${col.column_name} (${col.data_type})${hint}:`,
    });

    if (value.trim() !== '') {
      rowData[col.column_name] = value;
    }
  }

  if (Object.keys(rowData).length === 0) {
    console.log(chalk.yellow('\nNo data provided. Insert cancelled.'));
    return;
  }

  const escapedTable = escapeSqlIdentifier(tableName);
  const cols = Object.keys(rowData).map((c) => `"${escapeSqlIdentifier(c)}"`).join(', ');
  const placeholders = Object.keys(rowData).map((_, i) => `$${i + 1}`).join(', ');
  const values = Object.values(rowData);

  const sql = `INSERT INTO "${escapedTable}" (${cols}) VALUES (${placeholders}) RETURNING *;`;
  
  try {
    const result = await dbQuery(sql, values);
    console.log(chalk.green(`\n✓ Your new record was added!`));
    renderTable(result.rows);
  } catch (err: unknown) {
    console.log(chalk.red(`\nFailed to insert row: ${sanitizeErrorMessage(err)}`));
  }
}

function validateTableName(val: string): true | string {
  const trimmed = val.trim();
  if (trimmed.length === 0) return 'Table name cannot be empty';
  if (!isValidIdentifierName(trimmed)) {
    return 'Use only letters, numbers, underscores, or hyphens (e.g. my_table)';
  }
  return true;
}

function validateColumnsDef(val: string): true | string {
  const trimmed = val.trim();
  if (trimmed.length === 0) return 'Columns definition cannot be empty';
  if (trimmed.includes(';')) return 'Semicolons are not allowed (security)';
  if (trimmed.includes('--')) return 'SQL comments (--) are not allowed (security)';
  if (trimmed.includes('/*') || trimmed.includes('*/')) return 'Block comments are not allowed (security)';
  const dangerous = /\b(DROP|DELETE|TRUNCATE|ALTER|EXEC|EXECUTE)\s+/i;
  if (dangerous.test(trimmed)) return 'Dangerous SQL keywords are not allowed in column definition';
  return true;
}

async function handleCreateTable() {
  const tableName = await input({ 
    message: 'Enter new table name:',
    validate: validateTableName
  });
  
  const columns = await input({
    message: 'Enter columns definition (e.g. id SERIAL PRIMARY KEY, name VARCHAR(50)):',
    validate: validateColumnsDef
  });

  const escapedTable = escapeSqlIdentifier(tableName);
  const sql = `CREATE TABLE "${escapedTable}" (${columns});`;
  
  try {
    await dbQuery(sql);
    console.log(chalk.green(`\n✓ Table "${tableName}" is ready! Use "View table data" or "Add new row" to start using it.`));
  } catch (err: unknown) {
    console.log(chalk.red(`\nFailed to create table: ${sanitizeErrorMessage(err)}`));
  }
}

async function handleDropSpecificTable() {
  const tables = await getPublicTables();
  if (tables.length === 0) {
    console.log(chalk.yellow('No tables found in public schema.'));
    return;
  }
  const tableName = await fuzzySelect(
    'Select a table to DROP (type to search):',
    tables.map((r) => ({ name: r.table_name, value: r.table_name }))
  );

  const isSure = await confirm({ 
    message: `Are you sure you want to drop table "${tableName}"? (This will also drop dependent objects)`, 
    default: false 
  });

  if (isSure) {
    const escapedTable = escapeSqlIdentifier(tableName);
    await dbQuery(`DROP TABLE "${escapedTable}" CASCADE;`);
    console.log(chalk.green(`\n✓ Table "${tableName}" dropped successfully!`));
  } else {
    console.log(chalk.gray('\nOperation cancelled.'));
  }
}

async function handleDropAllTables() {
  const tables = await getPublicTables();
  if (tables.length === 0) {
    console.log(chalk.yellow('No tables found in the database.'));
    return;
  }
  console.log(chalk.red.bold(`\n⚠️  WARNING: You are about to drop ALL ${tables.length} tables in the public schema!`));
  
  const isSure = await confirm({ 
    message: 'Are you absolutely sure you want to proceed? THIS CANNOT BE UNDONE!', 
    default: false 
  });

  if (isSure) {
    const tableNames = tables.map((r) => `"${escapeSqlIdentifier(r.table_name)}"`).join(', ');
    await dbQuery(`DROP TABLE ${tableNames} CASCADE;`);
    console.log(chalk.green(`\n✓ All tables dropped successfully!`));
  } else {
    console.log(chalk.gray('\nOperation cancelled.'));
  }
}

async function handleRunQuery() {
  const sql = await input({
    message: 'Enter your SQL query (we\'ll run it for you):'
  });

  try {
    const result = await withSpinner(
      'Running your query...',
      () => dbQuery(sql),
      {
        successMessage: chalk.green('Query completed!'),
        failMessage: 'Query failed'
      }
    );
    const commandLabel = result.command || 'query';
    const rowCount = result.rowCount !== null ? ` (${result.rowCount} rows)` : '';
    console.log(chalk.dim('\nExecuted: ') + highlightSql(sql));
    console.log(chalk.green(`\n✓ ${chalk.bold(commandLabel)}${rowCount}`));
    if (result.rows && result.rows.length > 0) {
      renderTable(result.rows);
    }
  } catch (err: unknown) {
    console.log(chalk.red(`\nQuery failed: ${sanitizeErrorMessage(err)}`));
  }
}

async function handleMonitor() {
  const sql = `
    SELECT pid, usename, state, query_start, query
    FROM pg_stat_activity
    WHERE state != 'idle' AND pid != pg_backend_pid()
    ORDER BY query_start DESC;
  `;
  const result = await dbQuery(sql);
  
  if (result.rows.length === 0) {
    console.log(chalk.green('No active queries right now.'));
  } else {
    console.log(chalk.cyan('\nActive Queries:'));
    renderTable(result.rows);
  }
}
