WITH relations AS MATERIALIZED (
  SELECT c.oid, n.nspname::text AS schema, c.relname::text AS name,
    c.relkind, c.relispartition,
    pg_catalog.has_schema_privilege(n.oid, 'USAGE') AND
      (pg_catalog.has_table_privilege(c.oid, 'SELECT, INSERT, UPDATE, DELETE, REFERENCES')
       OR pg_catalog.has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')) AS accessible
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'f')
    AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
), visible AS MATERIALIZED (
  SELECT * FROM relations WHERE accessible ORDER BY schema, name LIMIT 2001
), columns AS MATERIALIZED (
  SELECT a.attrelid, a.attnum, a.attname::text AS name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    NOT a.attnotnull AS nullable,
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k
      WHERE k.conrelid = a.attrelid AND k.contype = 'p' AND a.attnum = ANY(k.conkey)) AS primary_key
  FROM pg_catalog.pg_attribute a JOIN visible v ON v.oid = a.attrelid
  WHERE a.attnum > 0 AND NOT a.attisdropped
  ORDER BY a.attrelid, a.attnum LIMIT 30001
), foreign_keys AS MATERIALIZED (
  SELECT k.* FROM pg_catalog.pg_constraint k
  JOIN visible v ON v.oid = k.conrelid
  WHERE k.contype = 'f'
  ORDER BY k.oid LIMIT 10001
)
SELECT json_build_object(
  'tables', COALESCE((SELECT json_agg(json_build_object(
    'schema', v.schema, 'name', v.name,
    'objectType', CASE v.relkind WHEN 'p' THEN 'partitioned table' WHEN 'f' THEN 'foreign table' ELSE 'table' END,
    'parent', CASE WHEN v.relispartition THEN (SELECT json_build_object('schema', pn.nspname, 'name', p.relname)
      FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class p ON p.oid = i.inhparent
      JOIN pg_catalog.pg_namespace pn ON pn.oid = p.relnamespace
      WHERE i.inhrelid = v.oid LIMIT 1) END,
    'columns', COALESCE((SELECT json_agg(json_build_object(
      'name', a.name, 'dataType', a.data_type, 'nullable', a.nullable, 'primaryKey', a.primary_key
    ) ORDER BY a.attnum) FROM columns a WHERE a.attrelid = v.oid), '[]'::json)
  ) ORDER BY v.schema, v.name) FROM visible v), '[]'::json),
  'foreignKeys', COALESCE((SELECT json_agg(json_build_object(
    'name', k.conname, 'direction', 'outgoing',
    'sourceSchema', sn.nspname, 'sourceTable', s.relname,
    'sourceColumns', ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(num, pos)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = x.num ORDER BY x.pos),
    'targetSchema', tn.nspname, 'targetTable', t.relname,
    'targetColumns', ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY x(num, pos)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = x.num ORDER BY x.pos),
    'onUpdate', CASE k.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
    'onDelete', CASE k.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
    'definition', pg_catalog.pg_get_constraintdef(k.oid), 'validated', k.convalidated
  ) ORDER BY k.oid) FROM foreign_keys k
    JOIN pg_catalog.pg_class s ON s.oid = k.conrelid JOIN pg_catalog.pg_namespace sn ON sn.oid = s.relnamespace
    JOIN pg_catalog.pg_class t ON t.oid = k.confrelid JOIN pg_catalog.pg_namespace tn ON tn.oid = t.relnamespace), '[]'::json),
  'omittedTables', (SELECT count(*) FROM relations WHERE NOT accessible),
  'tooLarge', (SELECT count(*) > 2000 FROM visible) OR (SELECT count(*) > 30000 FROM columns) OR (SELECT count(*) > 10000 FROM foreign_keys)
)::text
