import pg from 'pg';

let pool: pg.Pool | null = null;
let storedConnectionString: string | null = null;

export interface DBConnectionConfig {
  connectionString: string;
}

/** Returns connection string for admin operations (e.g. connect to postgres DB) */
export function getAdminConnectionString(targetDb = 'postgres'): string | null {
  if (!storedConnectionString) return null;
  try {
    const url = new URL(storedConnectionString);
    url.pathname = `/${targetDb}`;
    return url.toString();
  } catch {
    // Fallback if not a valid URL (e.g. key-value pairs)
    return storedConnectionString.replace(/\/([^/]+)(\?.*)?$/, (_, _db, q = '') => `/${targetDb}${q}`);
  }
}

/** Returns the current connection string, or null if not connected */
export function getConnectionString(): string | null {
  return storedConnectionString;
}

export function connect(config: DBConnectionConfig): Promise<void> {
  return (async () => {
    if (pool) {
      const previous = pool;
      pool = null;
      storedConnectionString = null;
      await previous.end();
    }

    return new Promise<void>((resolve, reject) => {
      try {
        storedConnectionString = config.connectionString;
        const needsSSL = /sslmode=(require|verify-ca|verify-full)|\.amazonaws\.com|\.supabase\.com|\.neon\.tech|\.render\.com|\.fly\.io|\.railway\.app/i.test(config.connectionString);
        pool = new pg.Pool({
          connectionString: config.connectionString,
          ssl: needsSSL ? { rejectUnauthorized: false } : undefined
        });

        pool
          .query('SELECT 1')
          .then(() => resolve())
          .catch(async (err) => {
            const failedPool = pool;
            pool = null;
            storedConnectionString = null;
            if (failedPool) {
              await failedPool.end().catch(() => undefined);
            }
            reject(err);
          });
      } catch (err) {
        reject(err);
      }
    });
  })();
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

/** Run a query on a different database (e.g. postgres). Used for DROP DATABASE etc. */
export async function runOnDatabase<T>(
  targetDb: string,
  fn: (client: pg.Pool) => Promise<T>
): Promise<T> {
  const adminUrl = getAdminConnectionString(targetDb);
  if (!adminUrl) throw new Error('Not connected. Cannot run admin operation.');
  const needsSSL = /sslmode=(require|verify-ca|verify-full)|\.amazonaws\.com|\.supabase\.com|\.neon\.tech|\.render\.com|\.fly\.io|\.railway\.app/i.test(adminUrl);
  const adminPool = new pg.Pool({
    connectionString: adminUrl,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined
  });
  try {
    return await fn(adminPool);
  } finally {
    await adminPool.end();
  }
}
