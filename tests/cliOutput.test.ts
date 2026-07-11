import { describe, expect, it } from 'vitest';
import { resolveCliFlags } from '../src/cli/flags.js';
import { cellToString, rowsToCsv } from '../src/cli/output.js';

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
