import pg from 'pg';
import chalk from 'chalk';
import {
  loadStoredProfile,
  saveStoredProfile,
  getStoredPassword,
  setStoredPassword,
  type StoredConnectionProfile
} from './credentials.js';
import { isDatabaseDoesNotExistError } from '../utils/sanitizeError.js';

export type CredentialSource = 'env' | 'stored' | 'prompt';

export interface ResolvedConnection {
  connectionString: string;
  /** If set, connect directly to this database. Otherwise user must select. */
  targetDatabase: string | null;
  /**
   * True when the target database (and/or attempted login) came from project .env.
   * Used for "create missing DB" UX.
   */
  fromEnv: boolean;
  /** Where host/user/password ultimately came from */
  source: CredentialSource;
}

type PromptForCredentials = (profile?: StoredConnectionProfile) => Promise<{
  host: string;
  port: string;
  user: string;
  password: string;
  database?: string;
  queryString?: string;
}>;

type EnvLoginConfig = {
  host: string;
  port: string;
  user: string;
  password: string | null;
  dbName: string | null;
  queryString: string | null;
};

const SSL_HINT =
  /sslmode=(require|verify-ca|verify-full)|\.amazonaws\.com|\.supabase\.com|\.neon\.tech|\.render\.com|\.fly\.io|\.railway\.app/i;

function buildConnectionString(
  host: string,
  port: string,
  user: string,
  password: string,
  database: string,
  queryString?: string | null
): string {
  const encodedUser = encodeURIComponent(user);
  const encodedPass = password ? encodeURIComponent(password) : '';
  const auth = encodedPass ? `${encodedUser}:${encodedPass}` : encodedUser;
  let url = `postgresql://${auth}@${host}:${port}/${database}`;
  if (queryString && queryString.length > 0) {
    url += (queryString.startsWith('?') ? '' : '?') + queryString;
  }
  return url;
}

function sslOption(connectionString: string): { rejectUnauthorized: false } | undefined {
  return SSL_HINT.test(connectionString) ? { rejectUnauthorized: false } : undefined;
}

/** Database name only from project .env (DB_NAME / PGDATABASE / DATABASE_URL path). */
export function getEnvDatabaseName(): string | null {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      const dbPath = url.pathname.slice(1).split('?')[0];
      if (dbPath && dbPath.length > 0) {
        return decodeURIComponent(dbPath);
      }
    } catch {
      /* fall through */
    }
  }
  if (process.env.DB_NAME && process.env.DB_NAME.trim()) {
    return process.env.DB_NAME.trim();
  }
  if (process.env.PGDATABASE && process.env.PGDATABASE.trim()) {
    return process.env.PGDATABASE.trim();
  }
  return null;
}

/** Login fields from .env (host/user/password). DB name is optional here. */
function getEnvLoginConfig(): EnvLoginConfig | null {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      const dbPath = url.pathname.slice(1).split('?')[0];
      const dbName = dbPath && dbPath.length > 0 ? decodeURIComponent(dbPath) : null;
      const queryString = url.search ? url.search.slice(1) : null;
      return {
        host: url.hostname,
        port: url.port || '5432',
        user: decodeURIComponent(url.username || 'postgres'),
        password: url.password ? decodeURIComponent(url.password) : null,
        dbName: dbName || null,
        queryString
      };
    } catch {
      /* fall through */
    }
  }

  if (process.env.DB_USER) {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '5432',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : null,
      dbName: process.env.DB_NAME?.trim() || null,
      queryString: null
    };
  }

  if (process.env.PGUSER) {
    return {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || '5432',
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD !== undefined ? process.env.PGPASSWORD : null,
      dbName: process.env.PGDATABASE?.trim() || null,
      queryString: null
    };
  }

  return null;
}

type ProbeResult = 'ok' | 'nodb' | 'fail';

async function probeConnection(connectionString: string): Promise<ProbeResult> {
  const client = new pg.Client({
    connectionString,
    ssl: sslOption(connectionString),
    connectionTimeoutMillis: 12_000
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return 'ok';
  } catch (err) {
    if (isDatabaseDoesNotExistError(err)) return 'nodb';
    return 'fail';
  } finally {
    await client.end().catch(() => undefined);
  }
}

function buildResolved(
  host: string,
  port: string,
  user: string,
  password: string,
  targetDatabase: string | null,
  queryString: string | null | undefined,
  source: CredentialSource,
  fromEnv: boolean
): ResolvedConnection {
  return {
    connectionString: buildConnectionString(
      host,
      port,
      user,
      password,
      targetDatabase || 'postgres',
      queryString
    ),
    targetDatabase,
    fromEnv,
    source
  };
}

/** Build connection string for a specific database */
export function getConnectionStringForDb(
  host: string,
  port: string,
  user: string,
  password: string,
  db: string,
  queryString?: string | null
): string {
  return buildConnectionString(host, port, user, password, db, queryString);
}

/** Replace database in a connection URL */
export function replaceDatabaseInUrl(connectionString: string, db: string): string {
  try {
    const url = new URL(connectionString);
    url.pathname = `/${db}`;
    return url.toString();
  } catch {
    return connectionString.replace(/\/([^/?#]+)([?#].*)?$/, (_, _db, rest = '') => `/${db}${rest || ''}`);
  }
}

/**
 * Resolve connection:
 * 1. Try project .env login credentials (if present)
 * 2. On failure → saved system credentials (keychain) + **only DB name** from .env
 * 3. Otherwise prompt and save to keychain
 */
export async function resolveConnection(
  promptForCredentials: PromptForCredentials
): Promise<ResolvedConnection> {
  const envDbName = getEnvDatabaseName();
  const envLogin = getEnvLoginConfig();
  const storedProfile = loadStoredProfile();
  const storedPassword = storedProfile ? await getStoredPassword(storedProfile) : null;
  let envLoginAttempted = false;

  // --- 1) Try full .env credentials first ---
  if (envLogin) {
    let password = envLogin.password;
    if (password === null) {
      // Missing password in .env: try keychain for this env host/user first
      const envProfile: StoredConnectionProfile = {
        host: envLogin.host,
        port: envLogin.port,
        user: envLogin.user,
        ...(envDbName || envLogin.dbName
          ? { database: (envDbName || envLogin.dbName)! }
          : {}),
        ...(envLogin.queryString ? { queryString: envLogin.queryString } : {})
      };
      password = (await getStoredPassword(envProfile)) ?? null;
    }

    if (password !== null) {
      envLoginAttempted = true;
      const targetDatabase = envDbName || envLogin.dbName;
      const envResolved = buildResolved(
        envLogin.host,
        envLogin.port,
        envLogin.user,
        password,
        targetDatabase,
        envLogin.queryString,
        'env',
        true
      );

      const probe = await probeConnection(envResolved.connectionString);
      if (probe === 'ok' || probe === 'nodb') {
        return envResolved;
      }

      // .env login failed → fall through to system credentials + env DB name only
    }
  }

  // --- 2) Saved system credentials; DB name from .env when present ---
  if (storedProfile && storedPassword !== null) {
    const targetDatabase = envDbName || storedProfile.database || null;
    const storedResolved = buildResolved(
      storedProfile.host,
      storedProfile.port,
      storedProfile.user,
      storedPassword,
      targetDatabase,
      storedProfile.queryString,
      'stored',
      Boolean(envDbName)
    );

    if (envLoginAttempted) {
      const probe = await probeConnection(storedResolved.connectionString);
      if (probe === 'ok' || probe === 'nodb') {
        // stderr so --json/--csv stdout stays machine-parseable
        if (envDbName) {
          console.error(
            chalk.gray(
              `.env login failed — using saved system credentials (database from .env: "${envDbName}")`
            )
          );
        } else {
          console.error(chalk.gray('.env login failed — using saved system credentials'));
        }
        return storedResolved;
      }
    } else {
      // No usable .env login: system profile (+ optional DB_NAME from .env)
      return storedResolved;
    }
  }

  // --- 3) Interactive prompt (first-time or everything failed) ---
  const prompted = await promptForCredentials(storedProfile ?? undefined);
  const profile: StoredConnectionProfile = {
    host: prompted.host,
    port: prompted.port,
    user: prompted.user,
    ...(prompted.database || envDbName
      ? { database: prompted.database || envDbName! }
      : {}),
    ...(prompted.queryString ? { queryString: prompted.queryString } : {})
  };
  await setStoredPassword(profile, prompted.password);
  saveStoredProfile(profile);

  const targetDatabase = envDbName || prompted.database || null;
  return buildResolved(
    profile.host,
    profile.port,
    profile.user,
    prompted.password,
    targetDatabase,
    profile.queryString,
    'prompt',
    Boolean(envDbName)
  );
}
