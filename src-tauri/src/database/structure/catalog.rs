use tokio_postgres::Client;

use super::models::{
    RelationMetadata, StructureColumn, StructureConstraint, StructureForeignKey, StructureIndex,
};
use crate::database::postgres;

pub(super) async fn relation(
    client: &Client,
    schema: &str,
    table: &str,
) -> Result<RelationMetadata, String> {
    let row = client
        .query_opt(
            "SELECT c.oid, c.relkind::text, pg_catalog.pg_get_userbyid(c.relowner), \
         pg_catalog.obj_description(c.oid, 'pg_class'), c.relpersistence::text, \
         CASE WHEN c.relkind = 'p' THEN pg_catalog.pg_get_partkeydef(c.oid) END, \
         pg_catalog.pg_get_expr(c.relpartbound, c.oid), \
         ARRAY(SELECT format('%I.%I', pn.nspname, p.relname) \
               FROM pg_catalog.pg_inherits i \
               JOIN pg_catalog.pg_class p ON p.oid = i.inhparent \
               JOIN pg_catalog.pg_namespace pn ON pn.oid = p.relnamespace \
               WHERE i.inhrelid = c.oid ORDER BY i.inhseqno), \
         COALESCE(c.reloptions, ARRAY[]::text[]), \
         CASE WHEN c.relkind IN ('v', 'm') THEN pg_catalog.pg_get_viewdef(c.oid, false) END, \
         c.relrowsecurity \
         FROM pg_catalog.pg_class c \
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
         WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'p', 'v', 'm', 'f')",
            &[&schema, &table],
        )
        .await
        .map_err(|error| format!("Could not inspect this relation: {error}"))?
        .ok_or_else(|| {
            "This relation no longer exists or is not supported. Refresh the explorer.".to_string()
        })?;
    Ok(RelationMetadata {
        oid: row.get(0),
        kind: row.get(1),
        owner: row.get(2),
        comment: row.get(3),
        persistence: row.get(4),
        partition_key: row.get(5),
        partition_bound: row.get(6),
        parents: row.get(7),
        options: row.get(8),
        view_definition: row.get(9),
        row_security: row.get(10),
    })
}

pub(super) async fn columns(
    client: &Client,
    schema: &str,
    table: &str,
    oid: u32,
) -> Result<Vec<StructureColumn>, String> {
    let columns = postgres::list_columns(client, schema, table).await?;
    let details = client
        .query(
            "SELECT a.attname::text, a.attnum, pg_catalog.col_description(a.attrelid, a.attnum), \
         a.attidentity::text, a.attgenerated::text, a.attislocal, \
         CASE WHEN a.attcollation <> t.typcollation THEN \
           format('%I.%I', cn.nspname, coll.collname) END, \
         CASE WHEN a.attidentity <> '' THEN \
           (SELECT format('START WITH %s INCREMENT BY %s MINVALUE %s MAXVALUE %s CACHE %s %s', \
              s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcache, \
              CASE WHEN s.seqcycle THEN 'CYCLE' ELSE 'NO CYCLE' END) \
            FROM pg_catalog.pg_sequence s \
            JOIN pg_catalog.pg_depend d ON d.objid = s.seqrelid \
              AND d.classid = 'pg_catalog.pg_class'::regclass \
              AND d.refclassid = 'pg_catalog.pg_class'::regclass \
            WHERE d.refobjid = a.attrelid AND d.refobjsubid = a.attnum AND d.deptype = 'i') END \
         FROM pg_catalog.pg_attribute a \
         JOIN pg_catalog.pg_type t ON t.oid = a.atttypid \
         LEFT JOIN pg_catalog.pg_collation coll ON coll.oid = a.attcollation \
         LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid = coll.collnamespace \
         WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum",
            &[&oid],
        )
        .await
        .map_err(|error| format!("Could not inspect columns: {error}"))?;
    if columns.len() != details.len() {
        return Err("The table structure changed while loading. Refresh and try again.".into());
    }
    columns
        .into_iter()
        .zip(details)
        .map(|(column, row)| {
            if row.get::<_, String>(0) != column.name {
                return Err(
                    "The table structure changed while loading. Refresh and try again.".into(),
                );
            }
            Ok(StructureColumn {
                column,
                position: row.get(1),
                comment: row.get(2),
                identity_generation: row.get(3),
                generation_kind: row.get(4),
                is_local: row.get(5),
                collation: row.get(6),
                identity_options: row.get(7),
            })
        })
        .collect()
}

pub(super) async fn indexes(client: &Client, oid: u32) -> Result<Vec<StructureIndex>, String> {
    client
        .query(
            "SELECT ic.relname::text, am.amname::text, \
         ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid, k, false) \
               FROM generate_series(1, i.indnkeyatts) k ORDER BY k), \
         ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid, k, false) \
               FROM generate_series(i.indnkeyatts + 1, i.indnatts) k ORDER BY k), \
         i.indisunique, i.indisprimary, i.indisvalid, \
         pg_catalog.pg_get_expr(i.indpred, i.indrelid), \
         pg_catalog.pg_get_indexdef(i.indexrelid), \
         (SELECT con.conname::text FROM pg_catalog.pg_constraint con \
          WHERE con.conindid = i.indexrelid AND con.conrelid = i.indrelid \
            AND con.contype IN ('p', 'u', 'x') LIMIT 1) \
         FROM pg_catalog.pg_index i \
         JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid \
         JOIN pg_catalog.pg_am am ON am.oid = ic.relam \
         WHERE i.indrelid = $1 ORDER BY i.indisprimary DESC, ic.relname",
            &[&oid],
        )
        .await
        .map_err(|error| format!("Could not inspect indexes: {error}"))?
        .into_iter()
        .map(|row| {
            Ok(StructureIndex {
                name: row.get(0),
                method: row.get(1),
                columns: row.get(2),
                included_columns: row.get(3),
                unique: row.get(4),
                primary: row.get(5),
                valid: row.get(6),
                predicate: row.get(7),
                definition: row.get(8),
                constraint_name: row.get(9),
            })
        })
        .collect()
}

pub(super) async fn constraints(
    client: &Client,
    oid: u32,
) -> Result<Vec<StructureConstraint>, String> {
    client
        .query(
            "SELECT con.conname::text, con.contype::text, \
         ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(num, pos) \
               JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num \
               ORDER BY k.pos), \
         pg_catalog.pg_get_constraintdef(con.oid, false), con.convalidated, \
         con.condeferrable, con.condeferred, con.conislocal \
         FROM pg_catalog.pg_constraint con \
         WHERE con.conrelid = $1 ORDER BY con.contype, con.conname",
            &[&oid],
        )
        .await
        .map_err(|error| format!("Could not inspect constraints: {error}"))?
        .into_iter()
        .map(|row| {
            Ok(StructureConstraint {
                name: row.get(0),
                kind: row.get(1),
                columns: row.get(2),
                definition: row.get(3),
                validated: row.get(4),
                deferrable: row.get(5),
                initially_deferred: row.get(6),
                is_local: row.get(7),
            })
        })
        .collect()
}

pub(super) async fn foreign_keys(
    client: &Client,
    oid: u32,
) -> Result<Vec<StructureForeignKey>, String> {
    client.query(
        "SELECT con.conname::text, CASE WHEN con.conrelid = $1 THEN 'outgoing' ELSE 'incoming' END, \
         sn.nspname::text, source.relname::text, \
         ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(num, pos) \
               JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num \
               ORDER BY k.pos), \
         tn.nspname::text, target.relname::text, \
         ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(num, pos) \
               JOIN pg_catalog.pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.num \
               ORDER BY k.pos), \
         con.confupdtype::text, con.confdeltype::text, \
         pg_catalog.pg_get_constraintdef(con.oid, false), con.convalidated \
         FROM pg_catalog.pg_constraint con \
         JOIN pg_catalog.pg_class source ON source.oid = con.conrelid \
         JOIN pg_catalog.pg_namespace sn ON sn.oid = source.relnamespace \
         JOIN pg_catalog.pg_class target ON target.oid = con.confrelid \
         JOIN pg_catalog.pg_namespace tn ON tn.oid = target.relnamespace \
         WHERE con.contype = 'f' AND (con.conrelid = $1 OR con.confrelid = $1) \
           AND (con.conrelid = $1 OR con.conparentid = 0) \
         ORDER BY con.conrelid <> $1, sn.nspname, source.relname, con.conname",
        &[&oid],
    ).await.map_err(|error| format!("Could not inspect foreign keys: {error}"))?
        .into_iter().map(|row| Ok(StructureForeignKey {
            name: row.get(0), direction: row.get(1), source_schema: row.get(2),
            source_table: row.get(3), source_columns: row.get(4), target_schema: row.get(5),
            target_table: row.get(6), target_columns: row.get(7),
            on_update: referential_action(row.get(8)), on_delete: referential_action(row.get(9)),
            definition: row.get(10), validated: row.get(11),
        })).collect()
}

fn referential_action(code: &str) -> String {
    match code {
        "a" => "NO ACTION",
        "r" => "RESTRICT",
        "c" => "CASCADE",
        "n" => "SET NULL",
        "d" => "SET DEFAULT",
        _ => "UNKNOWN",
    }
    .into()
}
