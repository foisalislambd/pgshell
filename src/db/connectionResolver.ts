import {
  loadStoredProfile,
  saveStoredProfile,
  getStoredPassword,
  setStoredPassword,
  type StoredConnectionProfile
} from './credentials.js';

export interface ResolvedConnection {
  connectionString: string;
  /** If set, connect directly to this database. Otherwise user must select. */
  targetDatabase: string | null;
  /** Whether credentials came from .env */
  fromEnv: boolean;
}

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

/** Get connection config from .env (without building full URL - we need password separately) */
function getEnvConfig(): {
  host: string;
  port: string;
  user: string;
  password: string | null;
  dbName: string | null;
  /** Query string from DATABASE_URL (e.g. ?sslmode=require) - preserved for SSL */
  queryString: string | null;
} | null {
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
      /* fall through to individual env vars */
    }
  }

  if (process.env.DB_USER && process.env.DB_NAME) {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '5432',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD : null,
      dbName: process.env.DB_NAME,
      queryString: null
    };
  }

  if (process.env.PGUSER && process.env.PGDATABASE) {
    return {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || '5432',
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD ? process.env.PGPASSWORD : null,
      dbName: process.env.PGDATABASE,
      queryString: null
    };
  }

  return null;
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
 * Resolve connection: .env first, then OS-stored credentials, then prompt.
 * Returns connection string for 'postgres' DB (to list databases) + optional target DB from .env.
 */
export async function resolveConnection(
  promptForCredentials: (profile?: StoredConnectionProfile) => Promise<{
    host: string;
    port: string;
    user: string;
    password: string;
    database?: string;
    queryString?: string;
  }>
): Promise<ResolvedConnection> {
  const envConfig = getEnvConfig();

  if (envConfig) {
    let password = envConfig.password;
    const profile: StoredConnectionProfile = {
      host: envConfig.host,
      port: envConfig.port,
      user: envConfig.user,
      ...(envConfig.dbName ? { database: envConfig.dbName } : {}),
      ...(envConfig.queryString ? { queryString: envConfig.queryString } : {})
    };

    if (!password) {
      password = (await getStoredPassword(profile)) ?? '';
    }
    if (!password) {
      const prompted = await promptForCredentials(profile);
      password = prompted.password;
      await setStoredPassword(profile, password);
      saveStoredProfile(profile);
    }

    const connStr = buildConnectionString(
      envConfig.host,
      envConfig.port,
      envConfig.user,
      password,
      envConfig.dbName || 'postgres',
      envConfig.queryString
    );

    return {
      connectionString: envConfig.dbName
        ? connStr
        : buildConnectionString(
            envConfig.host,
            envConfig.port,
            envConfig.user,
            password,
            'postgres',
            envConfig.queryString
          ),
      targetDatabase: envConfig.dbName,
      fromEnv: true
    };
  }

  const storedProfile = loadStoredProfile();
  let profile = storedProfile;
  let password = storedProfile ? await getStoredPassword(storedProfile) : null;
  let targetDb: string | null = storedProfile?.database ?? null;
  let queryString: string | null = storedProfile?.queryString ?? null;

  if (!profile || !password) {
    const prompted = await promptForCredentials(storedProfile ?? undefined);
    profile = {
      host: prompted.host,
      port: prompted.port,
      user: prompted.user,
      ...(prompted.database ? { database: prompted.database } : {}),
      ...(prompted.queryString ? { queryString: prompted.queryString } : {})
    };
    password = prompted.password;
    targetDb = prompted.database || null;
    queryString = prompted.queryString || null;
    await setStoredPassword(profile, password);
    saveStoredProfile(profile);
  }

  const connStr = getConnectionStringForDb(
    profile.host,
    profile.port,
    profile.user,
    password!,
    targetDb || 'postgres',
    queryString
  );

  return {
    connectionString: connStr,
    targetDatabase: targetDb,
    fromEnv: false
  };
}
