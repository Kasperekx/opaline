use super::{name, qualified_table, ChangeError, DatabaseClient};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct EnumType {
    pub schema: String,
    pub name: String,
    pub oid: u32,
    pub values: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct EnumDraft {
    pub schema: String,
    pub name: String,
    pub original: Option<EnumType>,
    pub values: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EnumRef {
    pub schema: String,
    pub name: String,
}

pub(crate) async fn catalog(client: &tokio_postgres::Client) -> Result<Vec<EnumType>, String> {
    let rows = client.query("SELECT n.nspname::text, t.typname::text, t.oid, ARRAY(SELECT e.enumlabel::text FROM pg_catalog.pg_enum e WHERE e.enumtypid = t.oid ORDER BY e.enumsortorder) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' ORDER BY n.nspname, t.typname LIMIT 1001", &[]).await.map_err(|_| "Could not load enum types.")?;
    if rows.len() > 1000 {
        return Err("More than 1,000 enum types. Use SQL to manage this catalog.".into());
    }
    Ok(rows
        .into_iter()
        .map(|r| EnumType {
            schema: r.get(0),
            name: r.get(1),
            oid: r.get(2),
            values: r.get(3),
        })
        .collect())
}

pub(crate) fn reference(reference: &EnumRef) -> Result<String, String> {
    name(&reference.schema)?;
    name(&reference.name)?;
    Ok(qualified_table(&reference.schema, &reference.name))
}

fn literal(value: &str) -> Result<String, String> {
    // Empty labels are legal PostgreSQL enum values; whitespace is significant.
    if value.len() > 63 || value.contains('\0') {
        return Err("Enum values must fit in 63 UTF-8 bytes and contain no null character.".into());
    }
    Ok(format!(
        "E'{}'",
        value.replace('\\', "\\\\").replace('\'', "''")
    ))
}

pub(crate) fn plan(changes: &[EnumDraft]) -> Result<Vec<String>, String> {
    if changes.len() > 100 {
        return Err("Apply at most 100 enum changes at once.".into());
    }
    let mut seen = HashSet::new();
    let mut sql = Vec::new();
    for change in changes {
        name(&change.schema)?;
        name(&change.name)?;
        if change.schema.starts_with("pg_") || change.schema == "information_schema" {
            return Err("System enum types cannot be edited here.".into());
        }
        if !seen.insert((&change.schema, &change.name)) || change.values.len() > 500 {
            return Err("Choose distinct enum types, with at most 500 values each.".into());
        }
        let target = qualified_table(&change.schema, &change.name);
        let values = change
            .values
            .iter()
            .map(|v| literal(v))
            .collect::<Result<Vec<_>, _>>()?;
        if change.values.iter().collect::<HashSet<_>>().len() != values.len() {
            return Err("Enum values must be unique (case-sensitive).".into());
        }
        if let Some(old) = &change.original {
            if old.schema != change.schema
                || old.name != change.name
                || change.values.len() < old.values.len()
            {
                return Err("Removing enum values or renaming types requires SQL.".into());
            }
            for (index, value) in change.values.iter().enumerate() {
                if let Some(prior) = old.values.get(index) {
                    if prior != value {
                        if old.values.contains(value) {
                            return Err("Rename to an unused enum value; swapping or reordering values is not supported.".into());
                        }
                        sql.push(format!(
                            "ALTER TYPE {target} RENAME VALUE {} TO {};",
                            literal(prior)?,
                            values[index]
                        ));
                    }
                } else {
                    sql.push(format!("ALTER TYPE {target} ADD VALUE {};", values[index]));
                }
            }
        } else {
            if values.is_empty() {
                return Err("Add at least one enum value.".into());
            }
            sql.push(format!(
                "CREATE TYPE {target} AS ENUM ({});",
                values.join(", ")
            ));
        }
    }
    Ok(sql)
}

pub(crate) async fn verify(
    client: &DatabaseClient,
    changes: &[EnumDraft],
    after: bool,
) -> Result<(), String> {
    if changes.is_empty() {
        return Ok(());
    }
    let types = catalog(client).await?;
    for change in changes {
        let current = types
            .iter()
            .find(|t| t.schema == change.schema && t.name == change.name);
        let matches = if after {
            current.is_some_and(|t| {
                t.values == change.values
                    && change.original.as_ref().is_none_or(|old| old.oid == t.oid)
            })
        } else {
            match (&change.original, current) {
                (None, None) => true,
                (Some(old), Some(t)) => old.oid == t.oid && old.values == t.values,
                _ => false,
            }
        };
        if !matches {
            return Err("An enum type changed since this draft was opened. Discard and reopen the editor; nothing was applied.".into());
        }
    }
    Ok(())
}

pub(crate) async fn verify_references(
    client: &DatabaseClient,
    columns: &[super::ColumnDraft],
) -> Result<(), ChangeError> {
    for column in columns.iter().filter(|c| !c.removed) {
        if let Some(reference) = &column.enum_type {
            let exists: bool = client.query_one("SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND n.nspname = $1 AND t.typname = $2)", &[&reference.schema, &reference.name]).await.map_err(|_| ChangeError::rejected("Could not verify enum type."))?.get(0);
            if !exists {
                return Err(ChangeError::rejected(
                    "The selected enum type no longer exists.",
                ));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn enum_plans_quote_labels_and_preserve_order() {
        let mut draft = EnumDraft {
            schema: "public".into(),
            name: "s\"t".into(),
            original: None,
            values: vec!["a'b\\c".into(), "".into()],
        };
        assert_eq!(
            plan(&[draft]).unwrap()[0],
            "CREATE TYPE \"public\".\"s\"\"t\" AS ENUM (E'a''b\\\\c', E'');"
        );
        draft = EnumDraft {
            schema: "public".into(),
            name: "status".into(),
            original: Some(EnumType {
                schema: "public".into(),
                name: "status".into(),
                oid: 1,
                values: vec!["draft".into(), "ready".into()],
            }),
            values: vec!["new".into(), "ready".into(), "done".into()],
        };
        assert_eq!(plan(std::slice::from_ref(&draft)).unwrap().len(), 2);
        draft.values = vec!["ready".into(), "draft".into()];
        assert!(plan(std::slice::from_ref(&draft)).is_err());
        draft.values = vec!["draft".into()];
        assert!(plan(std::slice::from_ref(&draft)).is_err());
        draft.values = vec!["x".repeat(64), "ready".into()];
        assert!(plan(std::slice::from_ref(&draft)).is_err());
    }
}
