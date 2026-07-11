import chalk from 'chalk';
import { clearStoredProfile, loadStoredProfile } from '../db/credentials.js';
import type { CliFlags } from '../cli/flags.js';
import { resolveCliFlags } from '../cli/flags.js';
import { printJson, logInfo } from '../cli/output.js';
import { promptConfirmation } from '../utils/promptConfirm.js';

export async function executeConfigShowCommand(flagsInput: Partial<CliFlags> = {}) {
  const flags = resolveCliFlags(flagsInput);
  const profile = loadStoredProfile();

  if (!profile) {
    if (flags.format === 'json') {
      printJson({ profile: null });
    } else {
      console.log(chalk.yellow('\nNo saved profile found (~/.pgshell/config.json).\n'));
    }
    return;
  }

  const safe = {
    host: profile.host,
    port: profile.port,
    user: profile.user,
    database: profile.database ?? null,
    queryString: profile.queryString ?? null,
    password: '[stored in OS keychain]'
  };

  if (flags.format === 'json') {
    printJson({ profile: safe });
    return;
  }

  console.log(chalk.cyan('\nSaved PgShell profile\n'));
  console.log(`  Host:        ${safe.host}`);
  console.log(`  Port:        ${safe.port}`);
  console.log(`  User:        ${safe.user}`);
  console.log(`  Database:    ${safe.database ?? '(none)'}`);
  console.log(`  Query:       ${safe.queryString ?? '(none)'}`);
  console.log(`  Password:    ${safe.password}`);
  console.log();
}

export async function executeConfigClearCommand(flagsInput: Partial<CliFlags> = {}) {
  const flags = resolveCliFlags(flagsInput);
  const profile = loadStoredProfile();

  if (!profile) {
    if (flags.format === 'json') {
      printJson({ cleared: false, reason: 'no_profile' });
    } else {
      console.log(chalk.yellow('\nNo saved profile to clear.\n'));
    }
    return;
  }

  if (!flags.quiet && flags.format === 'human') {
    const ok = await promptConfirmation(
      chalk.yellow(
        `\nClear saved profile for ${profile.user}@${profile.host}:${profile.port} and remove keychain password? (y/N): `
      )
    );
    if (!ok) {
      logInfo(flags, chalk.gray('Cancelled.'));
      return;
    }
  }

  const cleared = await clearStoredProfile();
  if (flags.format === 'json') {
    printJson({ cleared });
  } else {
    console.log(chalk.green('\n✓ Saved profile and keychain password cleared.\n'));
  }
}
