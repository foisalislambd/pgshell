import { input, select, password } from '@inquirer/prompts';
import chalk from 'chalk';
import type { StoredConnectionProfile } from './credentials.js';

export async function promptForCredentials(
  existing?: StoredConnectionProfile
): Promise<{ host: string; port: string; user: string; password: string; database?: string }> {
  if (!process.stdin.isTTY) {
    throw new Error('Cannot prompt for credentials: not running in an interactive terminal (no TTY). Create a .env file or run from a terminal.');
  }

  console.log(chalk.cyan('\n╭─ Connect to PostgreSQL ───────────────────────────╮'));
  console.log(chalk.cyan('│') + chalk.dim(' Please choose how you want to provide credentials ') + chalk.cyan('│'));
  console.log(chalk.cyan('╰───────────────────────────────────────────────────╯\n'));

  const connType = await select({
    message: chalk.bold('Connection Method:'),
    choices: [
      { name: '🏠 ' + chalk.bold('Interactive Setup'), value: 'local', description: chalk.gray('Manually enter host, port, username, and password.') },
      { name: '🌐 ' + chalk.bold('Connection String'), value: 'external', description: chalk.gray('Paste a full URI (e.g. postgres://user:pass@host:5432/db).') }
    ]
  });

  if (connType === 'external') {
    const uri = await input({
      message: chalk.bold('Enter your Connection String:'),
      validate: (val) =>
        val.startsWith('postgres') ? true : chalk.red('Must be a valid Postgres URI (postgres://... or postgresql://...)')
    });
    try {
      const url = new URL(uri);
      const pass = url.password ? decodeURIComponent(url.password) : '';
      const dbPath = url.pathname.slice(1).split('?')[0];
      const result: { host: string; port: string; user: string; password: string; database?: string } = {
        host: url.hostname,
        port: url.port || '5432',
        user: url.username || 'postgres',
        password: pass
      };
      if (dbPath) {
        result.database = dbPath;
      }
      return result;
    } catch {
      throw new Error('Invalid connection string format');
    }
  }

  const host = await input({ message: chalk.bold('Host:'), default: existing?.host ?? 'localhost' });
  const port = await input({ message: chalk.bold('Port:'), default: existing?.port ?? '5432' });
  const user = await input({ message: chalk.bold('Username:'), default: existing?.user ?? 'postgres' });
  const pass = await password({ message: chalk.bold('Password:'), mask: chalk.dim('*') });
  
  return { host, port, user, password: pass };
}
