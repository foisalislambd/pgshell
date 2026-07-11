import { describe, expect, it } from 'vitest';
import { trimHistoryPreview } from '../src/db/queryHistory.js';

describe('trimHistoryPreview', () => {
  it('collapses whitespace', () => {
    expect(trimHistoryPreview('SELECT   1\nFROM x')).toBe('SELECT 1 FROM x');
  });

  it('truncates long SQL', () => {
    const sql = 'SELECT ' + 'a'.repeat(100);
    const preview = trimHistoryPreview(sql, 20);
    expect(preview.length).toBe(20);
    expect(preview.endsWith('…')).toBe(true);
  });
});
