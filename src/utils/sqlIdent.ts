/** Escape double-quotes in SQL identifiers to prevent injection when quoting. */
export function escapeSqlIdentifier(name: string): string {
  return name.replace(/"/g, '""');
}

/**
 * Safe database/table name for quoted identifiers:
 * letters, numbers, underscores, hyphens; must start with letter or underscore.
 */
export function isValidIdentifierName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
}
