import chalk from 'chalk';
import { renderTable } from '../ui/tableRenderer.js';
import type { CliFlags, OutputFormat } from './flags.js';

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keySet = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) keySet.add(k);
  }
  const keys = Array.from(keySet);
  const escape = (v: string): string => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [keys.map(escape).join(',')];
  for (const row of rows) {
    lines.push(keys.map((k) => escape(cellToString(row[k]))).join(','));
  }
  return lines.join('\n');
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printCsv(rows: Record<string, unknown>[]): void {
  const csv = rowsToCsv(rows);
  if (csv) console.log(csv);
}

export function logInfo(flags: CliFlags, message: string): void {
  if (flags.quiet) return;
  console.log(message);
}

export function logDim(flags: CliFlags, message: string): void {
  if (flags.quiet) return;
  console.log(chalk.dim(message));
}

/** Render rows according to output format. */
export function emitRows(
  flags: CliFlags,
  rows: Record<string, unknown>[],
  options?: {
    jsonEnvelope?: Record<string, unknown>;
    humanTitle?: string;
    emptyHumanMessage?: string;
  }
): void {
  const format: OutputFormat = flags.format;

  if (format === 'json') {
    printJson({
      ...(options?.jsonEnvelope ?? {}),
      rowCount: rows.length,
      rows
    });
    return;
  }

  if (format === 'csv') {
    printCsv(rows);
    return;
  }

  if (options?.humanTitle) {
    console.log(chalk.cyan(options.humanTitle));
  }
  if (!rows.length) {
    console.log(chalk.yellow(options?.emptyHumanMessage ?? 'No results found.'));
    return;
  }
  renderTable(rows);
}
