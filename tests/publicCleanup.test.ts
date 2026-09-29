import { describe, expect, it } from 'vitest';
import { formatCleanupItems, parseCleanupItems } from '../src/db/publicCleanup.js';

describe('public schema cleanup list', () => {
  it('keeps known kinds and prints them in a stable order', () => {
    const items = parseCleanupItems([
      { kind: 'type', name: 'category' },
      { kind: 'function', name: 'set_updated_at()' },
      { kind: 'table', name: 'products' },
      { kind: 'other', name: 'ignored' },
    ]);

    expect(items.map((item) => item.kind)).toEqual(['type', 'function', 'table']);
    expect(formatCleanupItems(items)).toBe(
      '1 table: products\n1 function: set_updated_at()\n1 type: category',
    );
  });
});
