import { describe, expect, it } from 'vitest';
import { escapeSqlIdentifier, isValidIdentifierName } from '../src/utils/sqlIdent.js';

describe('escapeSqlIdentifier', () => {
  it('doubles embedded double quotes', () => {
    expect(escapeSqlIdentifier('a"b')).toBe('a""b');
  });

  it('leaves plain names unchanged', () => {
    expect(escapeSqlIdentifier('users')).toBe('users');
  });
});

describe('isValidIdentifierName', () => {
  it('accepts common safe names', () => {
    expect(isValidIdentifierName('users')).toBe(true);
    expect(isValidIdentifierName('my_db')).toBe(true);
    expect(isValidIdentifierName('my-app')).toBe(true);
    expect(isValidIdentifierName('_private')).toBe(true);
  });

  it('rejects invalid names', () => {
    expect(isValidIdentifierName('')).toBe(false);
    expect(isValidIdentifierName('1bad')).toBe(false);
    expect(isValidIdentifierName('has space')).toBe(false);
    expect(isValidIdentifierName('ab"c')).toBe(false);
    expect(isValidIdentifierName('drop;me')).toBe(false);
  });
});
