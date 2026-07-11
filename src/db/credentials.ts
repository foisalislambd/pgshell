import { getPassword, setPassword, deletePassword } from 'cross-keychain';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';

const PGSHELL_SERVICE = 'pgshell';

/** Config file path: ~/.pgshell/config.json (stores host, port, user - NOT password) */
export function getConfigPath(): string {
  return path.join(homedir(), '.pgshell', 'config.json');
}

export function getPgshellDir(): string {
  return path.join(homedir(), '.pgshell');
}

export interface StoredConnectionProfile {
  host: string;
  port: string;
  user: string;
  /** Default database from connection string or interactive setup */
  database?: string;
  /** Query string from DATABASE_URL (e.g. sslmode=require) */
  queryString?: string;
}

/** Unique key for keychain: one password per host+port+user. Uses only allowed chars: alphanumeric, ., _, @, - */
function getKeychainAccount(profile: StoredConnectionProfile): string {
  return `${profile.host}__${profile.port}__${profile.user}`.replace(/[^a-zA-Z0-9._@-]/g, '_');
}

/** Load stored connection profile from config file (host, port, user only) */
export function loadStoredProfile(): StoredConnectionProfile | null {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as StoredConnectionProfile;
    if (parsed?.host && parsed?.port && parsed?.user) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Save connection profile to config file */
export function saveStoredProfile(profile: StoredConnectionProfile): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(profile, null, 2), 'utf-8');
}

/** Get password from OS keychain for the given profile */
export async function getStoredPassword(profile: StoredConnectionProfile): Promise<string | null> {
  try {
    const account = getKeychainAccount(profile);
    const password = await getPassword(PGSHELL_SERVICE, account);
    return password ?? null;
  } catch {
    return null;
  }
}

/** Save password to OS keychain */
export async function setStoredPassword(
  profile: StoredConnectionProfile,
  password: string
): Promise<void> {
  const account = getKeychainAccount(profile);
  await setPassword(PGSHELL_SERVICE, account, password);
}

/** Delete stored password from OS keychain */
export async function deleteStoredPassword(profile: StoredConnectionProfile): Promise<void> {
  try {
    const account = getKeychainAccount(profile);
    await deletePassword(PGSHELL_SERVICE, account);
  } catch {
    /* ignore */
  }
}

/** Remove saved profile file and its keychain password */
export async function clearStoredProfile(): Promise<boolean> {
  const profile = loadStoredProfile();
  if (profile) {
    await deleteStoredPassword(profile);
  }
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
    return true;
  }
  return Boolean(profile);
}
