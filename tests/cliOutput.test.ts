import { describe, expect, it, vi, afterEach } from 'vitest';
import { resolveCliFlags } from '../src/cli/flags.js';
import { cellToString, rowsToCsv, emitRows } from '../src/cli/output.js';

describe('resolveCliFlags', () => {
  it('defaults to human', () => {
    expect(resolveCliFlags({})).toEqual({
      json: false,
      csv: false,
      quiet: false,
      format: 'human'
    });
  });

  it('prefers json over csv and implies quiet', () => {
    expect(resolveCliFlags({ json: true, csv: true })).toEqual({
      json: true,
      csv: false,
      quiet: true,
      format: 'json'
    });
  });

  it('enables csv and quiet', () => {
    expect(resolveCliFlags({ csv: true })).toMatchObject({
      csv: true,
      quiet: true,
      format: 'csv'
    });
  });
});

describe('rowsToCsv', () => {
  it('returns empty string for no rows', () => {
    expect(rowsToCsv([])).toBe('');
  });

  it('escapes commas and quotes', () => {
    const csv = rowsToCsv([{ name: 'a,b', note: 'say "hi"' }]);
    expect(csv).toBe('name,note\n"a,b","say ""hi"""');
  });

  it('stringifies objects and nulls', () => {
    expect(cellToString(null)).toBe('');
    expect(cellToString({ a: 1 })).toBe('{"a":1}');
  });
});

describe('emitRows json rowCount', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves envelope rowCount (affected rows) over rows.length', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const flags = resolveCliFlags({ json: true });
    emitRows(flags, [], {
      jsonEnvelope: { command: 'INSERT', rowCount: 3, sql: 'INSERT ...' }
    });
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload.rowCount).toBe(3);
    expect(payload.rows).toEqual([]);
    expect(payload.command).toBe('INSERT');
  });

  it('defaults rowCount to rows.length when envelope omits it', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const flags = resolveCliFlags({ json: true });
    emitRows(flags, [{ a: 1 }, { a: 2 }], { jsonEnvelope: { type: 'tables' } });
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload.rowCount).toBe(2);
    expect(payload.type).toBe('tables');
  });
});
