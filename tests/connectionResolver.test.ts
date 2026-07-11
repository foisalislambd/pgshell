import { describe, expect, it } from 'vitest';
import { replaceDatabaseInUrl } from '../src/db/connectionResolver.js';

describe('replaceDatabaseInUrl', () => {
  it('swaps the database path and keeps query params', () => {
    const next = replaceDatabaseInUrl(
      'postgresql://u:p@localhost:5432/olddb?sslmode=require',
      'new-db'
    );
    expect(next).toContain('/new-db');
    expect(next).toContain('sslmode=require');
    expect(next).not.toContain('/olddb');
  });

  it('handles URLs without a query string', () => {
    const next = replaceDatabaseInUrl('postgresql://u:p@localhost:5432/app', 'postgres');
    expect(next).toMatch(/\/postgres$/);
  });
});
