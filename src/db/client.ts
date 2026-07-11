import pg from 'pg';

let pool: pg.Pool | null = null;
let storedConnectionString: string | null = null;

const SSL_HINT =
  /sslmode=(require|verify-ca|verify-full)|\.amazonaws\.com|\.supabase\.com|\.neon\.tech|\.render\.com|\.fly\.io|\.railway\.app/i;

export interface DBConnectionConfig {
  connectionString: string;
}

function poolSslOption(connectionString: string): { rejectUnauthorized: false } | undefined {
  return SSL_HINT.test(connectionString) ? { rejectUnauthorized: false } : undefined;
}

/** Returns connection string for admin operations (e.g. connect to postgres DB) */
export function getAdminConnectionString(targetDb = 'postgres'): string | null {
  if (!storedConnectionString) return null;
  try {
    const url = new URL(storedConnectionString);
    url.pathname = `/${targetDb}`;
    return url.toString();
  } catch {
    return storedConnectionString.replace(/\/([^/]+)(\?.*)?$/, (_, _db, q = '') => `/${targetDb}${q}`);
  }
}

/** Returns the current connection string, or null if not connected */
export function getConnectionString(): string | null {
  return storedConnectionString;
}

export async function connect(config: DBConnectionConfig): Promise<void> {
  if (pool) {
    const previous = pool;
    pool = null;
    storedConnectionString = null;
    await previous.end();
  }

  storedConnectionString = config.connectionString;
  pool = new pg.Pool({
    connectionString: config.connectionString,
    ssl: poolSslOption(config.connectionString)
  });

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    const failedPool = pool;
    pool = null;
    storedConnectionString = null;
    await failedPool.end().catch(() => undefined);
    throw err;
  }
}

export function disconnect(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    storedConnectionString = null;
    return p.end();
  }
  storedConnectionString = null;
  return Promise.resolve();
}

export async function query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
  if (!pool) {
    throw new Error('Database not connected. Please connect first.');
  }
  return pool.query(text, params);
}

/** Run work on a different database (e.g. postgres) using a short-lived pool. */
export async function runOnDatabase<T>(
  targetDb: string,
  fn: (client: pg.Pool) => Promise<T>
): Promise<T> {
  const adminUrl = getAdminConnectionString(targetDb);
  if (!adminUrl) throw new Error('Not connected. Cannot run admin operation.');
  const adminPool = new pg.Pool({
    connectionString: adminUrl,
    ssl: poolSslOption(adminUrl)
  });
  try {
    return await fn(adminPool);
  } finally {
    await adminPool.end();
  }
}
