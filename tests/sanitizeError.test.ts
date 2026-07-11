import { describe, expect, it } from 'vitest';
import { isDatabaseDoesNotExistError, sanitizeErrorMessage } from '../src/utils/sanitizeError.js';

describe('isDatabaseDoesNotExistError', () => {
  it('detects PostgreSQL 3D000', () => {
    expect(isDatabaseDoesNotExistError({ code: '3D000', message: 'x' })).toBe(true);
  });

  it('detects message pattern', () => {
    expect(
      isDatabaseDoesNotExistError(new Error('database "missing_db" does not exist'))
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isDatabaseDoesNotExistError(new Error('connection refused'))).toBe(false);
  });
});

describe('sanitizeErrorMessage', () => {
  it('redacts connection strings', () => {
    const msg = sanitizeErrorMessage(
      new Error('failed postgresql://user:secret@localhost:5432/db')
    );
    expect(msg).toContain('[connection string hidden]');
    expect(msg).not.toContain('secret');
  });

  it('maps common SQL errors to friendly text', () => {
    expect(
      sanitizeErrorMessage(new Error('relation "foo" does not exist'))
    ).toMatch(/doesn't exist/i);
  });
});
