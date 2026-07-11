import chalk from 'chalk';
import { connect, disconnect, query, getConnectionString } from '../db/client.js';
import { resolveConnection } from '../db/connectionResolver.js';
import { promptForCredentials } from '../db/cliCredentials.js';
import { printEnvHint } from '../db/env.js';
import { sanitizeErrorMessage } from '../utils/sanitizeError.js';
import type { CliFlags } from '../cli/flags.js';
import { resolveCliFlags } from '../cli/flags.js';
import { printJson, logInfo } from '../cli/output.js';

function usesSsl(connectionString: string): boolean {
  return /sslmode=(require|verify-ca|verify-full)|\.amazonaws\.com|\.supabase\.com|\.neon\.tech|\.render\.com|\.fly\.io|\.railway\.app/i.test(
    connectionString
  );
}

export async function executeDoctorCommand(flagsInput: Partial<CliFlags> = {}) {
  const flags = resolveCliFlags(flagsInput);

  let resolved;
  try {
    resolved = await resolveConnection(promptForCredentials);
  } catch (err) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('\nError: Missing database credentials.\n'));
      printEnvHint();
    } else {
      console.error(chalk.red(`\nError: ${sanitizeErrorMessage(err)}\n`));
    }
    process.exit(1);
  }

  const started = Date.now();
  try {
    await connect({ connectionString: resolved.connectionString });
    const latencyMs = Date.now() - started;

    const meta = await query(`
      SELECT
        current_database() AS database,
        current_user AS "user",
        version() AS version,
        inet_server_addr()::text AS server_addr,
        inet_server_port() AS server_port
    `);
    const row = meta.rows[0] as {
      database: string;
      user: string;
      version: string;
      server_addr: string | null;
      server_port: number | null;
    };

    const conn = getConnectionString() ?? resolved.connectionString;
    const report = {
      ok: true,
      latencyMs,
      credentialSource: resolved.source,
      targetDatabase: resolved.targetDatabase,
      fromEnv: resolved.fromEnv,
      ssl: usesSsl(conn),
      database: row.database,
      user: row.user,
      serverAddr: row.server_addr,
      serverPort: row.server_port,
      version: row.version
    };

    if (flags.format === 'json') {
      printJson(report);
      return;
    }

    console.log(chalk.cyan('\nPgShell doctor\n'));
    console.log(`  Status:            ${chalk.green('ok')}`);
    console.log(`  Latency:           ${latencyMs} ms`);
    console.log(`  Credential source: ${resolved.source}`);
    console.log(`  Database:          ${row.database}`);
    console.log(`  User:              ${row.user}`);
    console.log(`  SSL enabled:       ${usesSsl(conn) ? 'yes' : 'no'}`);
    if (row.server_addr) {
      console.log(`  Server:            ${row.server_addr}:${row.server_port ?? ''}`);
    }
    console.log(`  Version:           ${row.version.split('\n')[0]}`);
    console.log();
    logInfo(flags, chalk.dim('Tip: use --json for machine-readable output.'));
  } catch (error: unknown) {
    if (flags.format === 'json') {
      printJson({ ok: false, error: sanitizeErrorMessage(error) });
    } else {
      console.error(chalk.red(`\nDoctor failed: ${sanitizeErrorMessage(error)}\n`));
    }
    process.exit(1);
  } finally {
    await disconnect();
  }
}
