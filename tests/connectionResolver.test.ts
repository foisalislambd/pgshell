import { describe, expect, it, afterEach } from 'vitest';
import { replaceDatabaseInUrl, getEnvDatabaseName } from '../src/db/connectionResolver.js';

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

describe('getEnvDatabaseName', () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_NAME;
    delete process.env.PGDATABASE;
  });

  it('reads DB_NAME', () => {
    process.env.DB_NAME = 'app_db';
    expect(getEnvDatabaseName()).toBe('app_db');
  });

  it('prefers DATABASE_URL path', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/from_url';
    process.env.DB_NAME = 'ignored';
    expect(getEnvDatabaseName()).toBe('from_url');
  });

  it('reads PGDATABASE when DB_NAME is absent', () => {
    process.env.PGDATABASE = 'pg_db';
    expect(getEnvDatabaseName()).toBe('pg_db');
  });
});
