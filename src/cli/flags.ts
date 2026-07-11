export type OutputFormat = 'human' | 'json' | 'csv';

export interface CliFlags {
  json: boolean;
  csv: boolean;
  quiet: boolean;
  /** Prefer json over csv when both are set */
  format: OutputFormat;
}

export function resolveCliFlags(opts: {
  json?: boolean;
  csv?: boolean;
  quiet?: boolean;
}): CliFlags {
  const json = Boolean(opts.json);
  const csv = Boolean(opts.csv) && !json;
  const quiet = Boolean(opts.quiet) || json || csv;
  const format: OutputFormat = json ? 'json' : csv ? 'csv' : 'human';
  return { json, csv, quiet, format };
}

/** Extract global flags from a Commander command's opts (including parent). */
export function flagsFromCommandOpts(opts: Record<string, unknown>): CliFlags {
  return resolveCliFlags({
    json: Boolean(opts['json']),
    csv: Boolean(opts['csv']),
    quiet: Boolean(opts['quiet'])
  });
}
