import { input, select, password } from '@inquirer/prompts';
import type { StoredConnectionProfile } from './credentials.js';

export async function promptForCredentials(
  existing?: StoredConnectionProfile
): Promise<{ host: string; port: string; user: string; password: string }> {
  if (!process.stdin.isTTY) {
    throw new Error('Cannot prompt for credentials: not running in an interactive terminal (no TTY). Create a .env file or run from a terminal.');
  }

  const connType = await select({
    message: 'How would you like to connect to PostgreSQL?',
    choices: [
      { name: '🏠 Localhost (Interactive Setup)', value: 'local', description: 'Enter host, username, password manually' },
      { name: '🌐 External / URI (Paste Connection String)', value: 'external', description: 'Paste a full postgres:// connection URL' }
    ]
  });

  if (connType === 'external') {
    const uri = await input({
      message: 'Enter your PostgreSQL connection string (DATABASE_URL):',
      validate: (val) =>
        val.startsWith('postgres') ? true : 'Must be a valid Postgres connection string (postgres://... or postgresql://...)'
    });
    try {
      const url = new URL(uri);
      const pass = url.password ? decodeURIComponent(url.password) : '';
      return {
        host: url.hostname,
        port: url.port || '5432',
        user: url.username || 'postgres',
        password: pass
      };
    } catch {
      throw new Error('Invalid connection string');
    }
  }

  const host = await input({ message: 'Host:', default: existing?.host ?? 'localhost' });
  const port = await input({ message: 'Port:', default: existing?.port ?? '5432' });
  const user = await input({ message: 'Username:', default: existing?.user ?? 'postgres' });
  const pass = await password({ message: 'Password:', mask: '*' });
  return { host, port, user, password: pass };
}
