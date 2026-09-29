export type CleanupKind = 'table' | 'view' | 'sequence' | 'function' | 'type';

export type CleanupItem = {
  kind: CleanupKind;
  name: string;
};

/** User objects in public that a schema reset removes. Extension members stay. */
export const PUBLIC_CLEANUP_DETAIL_SQL = `
SELECT kind, name
FROM (
  SELECT
    CASE c.relkind
      WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'view'
      WHEN 'S' THEN 'sequence'
      ELSE 'table'
    END AS kind,
    c.relname AS name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'f', 'v', 'm', 'S')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e'
    )
  UNION ALL
  SELECT
    'function' AS kind,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p', 'a', 'w')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
    )
  UNION ALL
  SELECT 'type' AS kind, t.typname AS name
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typtype IN ('e', 'c', 'd', 'r', 'm')
    AND (
      t.typrelid = 0
      OR EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind = 'c')
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e'
    )
) objects
ORDER BY kind, name;
`;

/**
 * Drop every user object in public: tables, views, sequences, routines, and types.
 * Objects installed by an extension (for example pgcrypto) are left in place.
 */
export const CLEAN_PUBLIC_SCHEMA_SQL = `
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'm'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I.%I CASCADE', r.nspname, r.relname);
  END LOOP;

  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.nspname, r.relname);
  END LOOP;

  FOR r IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format(
      'DROP %s IF EXISTS %I.%I CASCADE',
      CASE WHEN r.relkind = 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
      r.nspname,
      r.relname
    );
  END LOOP;

  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I.%I CASCADE', r.nspname, r.relname);
  END LOOP;

  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p', 'a', 'w')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format(
      'DROP %s IF EXISTS %I.%I(%s) CASCADE',
      CASE r.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
      r.nspname,
      r.proname,
      r.args
    );
  END LOOP;

  FOR r IN
    SELECT n.nspname, t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype IN ('e', 'c', 'd', 'r', 'm')
      AND (
        t.typrelid = 0
        OR EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind = 'c')
      )
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS %I.%I CASCADE', r.nspname, r.typname);
  END LOOP;
END $$;
`;

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Drop one table, then only the types and trigger functions that table used and nothing else still uses. */
export function dropTableAndLeftoversSql(tableName: string): string {
  const literal = sqlStringLiteral(tableName);
  return `
DO $$
DECLARE
  target regclass := to_regclass(format('%I.%I', 'public', ${literal}));
  r RECORD;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'Table % does not exist', ${literal};
  END IF;

  DROP TABLE IF EXISTS _pgshell_refs;
  CREATE TEMP TABLE _pgshell_refs (
    objkind text,
    nspname name,
    objname name,
    args text,
    prokind "char"
  ) ON COMMIT DROP;

  INSERT INTO _pgshell_refs (objkind, nspname, objname)
  SELECT DISTINCT 'type', n.nspname, t.typname
  FROM pg_depend d
  JOIN pg_type t ON t.oid = d.refobjid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE d.classid = 'pg_class'::regclass
    AND d.objid = target
    AND d.deptype = 'n'
    AND n.nspname = 'public'
    AND t.typtype IN ('e', 'c', 'd', 'r', 'm')
    AND NOT EXISTS (SELECT 1 FROM pg_depend e WHERE e.objid = t.oid AND e.deptype = 'e');

  INSERT INTO _pgshell_refs (objkind, nspname, objname, args, prokind)
  SELECT DISTINCT 'function', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), p.prokind
  FROM pg_trigger tg
  JOIN pg_depend d ON d.classid = 'pg_trigger'::regclass AND d.objid = tg.oid AND d.deptype = 'n'
  JOIN pg_proc p ON p.oid = d.refobjid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE tg.tgrelid = target
    AND n.nspname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_depend e WHERE e.objid = p.oid AND e.deptype = 'e');

  EXECUTE format('DROP TABLE IF EXISTS %s CASCADE', target);

  FOR r IN SELECT * FROM _pgshell_refs WHERE objkind = 'function' LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_depend d
      JOIN pg_proc p ON p.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = r.nspname
        AND p.proname = r.objname
        AND pg_get_function_identity_arguments(p.oid) = r.args
        AND d.deptype = 'n'
    ) THEN
      EXECUTE format(
        'DROP %s IF EXISTS %I.%I(%s) CASCADE',
        CASE r.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
        r.nspname,
        r.objname,
        r.args
      );
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM _pgshell_refs WHERE objkind = 'type' LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_depend d
      JOIN pg_type t ON t.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = r.nspname
        AND t.typname = r.objname
        AND d.classid = 'pg_class'::regclass
        AND d.deptype = 'n'
    ) THEN
      EXECUTE format('DROP TYPE IF EXISTS %I.%I CASCADE', r.nspname, r.objname);
    END IF;
  END LOOP;
END $$;
`;
}

const KIND_ORDER: CleanupKind[] = ['table', 'view', 'sequence', 'function', 'type'];

export function parseCleanupItems(rows: { kind: string; name: string }[]): CleanupItem[] {
  return rows.flatMap((row) => {
    if (!KIND_ORDER.includes(row.kind as CleanupKind)) return [];
    return [{ kind: row.kind as CleanupKind, name: row.name }];
  });
}

export function formatCleanupItems(items: CleanupItem[]): string {
  return KIND_ORDER.filter((kind) => items.some((item) => item.kind === kind))
    .map((kind) => {
      const names = items.filter((item) => item.kind === kind).map((item) => item.name);
      const label = names.length === 1 ? kind : `${kind}s`;
      return `${names.length} ${label}: ${names.join(', ')}`;
    })
    .join('\n');
}
