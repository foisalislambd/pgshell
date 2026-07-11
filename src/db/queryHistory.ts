import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getPgshellDir } from './credentials.js';

const MAX_HISTORY = 50;

export interface HistoryEntry {
  sql: string;
  at: string;
}

function historyPath(): string {
  return join(getPgshellDir(), 'history.json');
}

export function loadQueryHistory(): HistoryEntry[] {
  try {
    const path = historyPath();
    if (!existsSync(path)) return [];
    const raw = JSON.parse(readFileSync(path, 'utf8')) as HistoryEntry[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((e) => e && typeof e.sql === 'string');
  } catch {
    return [];
  }
}

export function saveQueryHistory(entries: HistoryEntry[]): void {
  const dir = getPgshellDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(historyPath(), JSON.stringify(entries.slice(0, MAX_HISTORY), null, 2), 'utf8');
}

/** Prepend a query; de-dupe identical consecutive entries; cap length. */
export function pushQueryHistory(sql: string): HistoryEntry[] {
  const trimmed = sql.trim();
  if (!trimmed) return loadQueryHistory();
  const prev = loadQueryHistory();
  if (prev[0]?.sql === trimmed) return prev;
  const next: HistoryEntry[] = [{ sql: trimmed, at: new Date().toISOString() }, ...prev].slice(
    0,
    MAX_HISTORY
  );
  saveQueryHistory(next);
  return next;
}

export function trimHistoryPreview(sql: string, max = 80): string {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}
