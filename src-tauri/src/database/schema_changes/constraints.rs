use super::{name, qualified_table, quote_identifier, SchemaChange};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(crate) enum ConstraintChange {
    CreateIndex {
        name: String,
        columns: Vec<String>,
        unique: bool,
    },
    DropIndex {
        name: String,
    },
    AddForeignKey {
        name: String,
        columns: Vec<String>,
        target_schema: String,
        target_table: String,
        target_columns: Vec<String>,
        on_delete: String,
        on_update: String,
    },
    DropForeignKey {
        name: String,
    },
}

fn identifiers(values: &[String]) -> Result<String, String> {
    if values.is_empty()
        || values.len() > 32
        || values.iter().collect::<HashSet<_>>().len() != values.len()
    {
        return Err("Select between 1 and 32 distinct columns in order.".into());
    }
    for value in values {
        name(value)?;
    }
    Ok(values
        .iter()
        .map(|v| quote_identifier(v))
        .collect::<Vec<_>>()
        .join(", "))
}

fn action(value: &str) -> Result<&str, String> {
    if [
        "NO ACTION",
        "RESTRICT",
        "CASCADE",
        "SET NULL",
        "SET DEFAULT",
    ]
    .contains(&value)
    {
        Ok(value)
    } else {
        Err("Unsupported foreign key action.".into())
    }
}

pub(super) fn plan(
    input: &SchemaChange,
    target: &str,
) -> Result<(Vec<String>, Vec<String>, bool), String> {
    if input.constraints.len() > 100 {
        return Err("Apply at most 100 index or relationship changes at once.".into());
    }
    if input.drop_table && !input.constraints.is_empty() {
        return Err("Discard index and relationship changes before dropping the table.".into());
    }
    let mut before = Vec::new();
    let mut after = Vec::new();
    let mut risky = false;
    let mut seen = HashSet::new();
    for change in &input.constraints {
        let (kind, key) = match change {
            ConstraintChange::CreateIndex { name, .. } => ("createIndex", name),
            ConstraintChange::DropIndex { name } => ("dropIndex", name),
            ConstraintChange::AddForeignKey { name, .. } => ("addForeignKey", name),
            ConstraintChange::DropForeignKey { name } => ("dropForeignKey", name),
        };
        name(key)?;
        if !seen.insert((kind, key)) {
            return Err("Duplicate index or relationship operation.".into());
        }
        match change {
            ConstraintChange::DropIndex { name } => {
                let index = input
                    .expected
                    .as_ref()
                    .and_then(|s| s["indexes"].as_array())
                    .and_then(|items| items.iter().find(|i| i["name"] == *name))
                    .ok_or("Load the existing index before removing it.")?;
                if index["primary"] != false || !index["constraintName"].is_null() {
                    return Err(
                        "Constraint-owned indexes require SQL; they cannot be dropped here.".into(),
                    );
                }
                before.push(format!(
                    "DROP INDEX {} RESTRICT;",
                    qualified_table(&input.schema, name)
                ));
                risky = true;
            }
            ConstraintChange::DropForeignKey { name } => {
                let found = input
                    .expected
                    .as_ref()
                    .and_then(|s| s["foreignKeys"].as_array())
                    .is_some_and(|items| {
                        items
                            .iter()
                            .any(|i| i["name"] == *name && i["direction"] == "outgoing")
                    });
                if !found {
                    return Err(
                        "Only this table's existing outgoing relationships can be removed.".into(),
                    );
                }
                before.push(format!(
                    "ALTER TABLE ONLY {target} DROP CONSTRAINT {} RESTRICT;",
                    quote_identifier(name)
                ));
                risky = true;
            }
            ConstraintChange::CreateIndex {
                name,
                columns,
                unique,
            } => {
                for column in columns {
                    if !input
                        .columns
                        .iter()
                        .any(|c| !c.removed && c.name == *column)
                    {
                        return Err("Index column is not in the table draft.".into());
                    }
                }
                after.push(format!(
                    "CREATE {}INDEX {} ON {target} USING btree ({});",
                    if *unique { "UNIQUE " } else { "" },
                    quote_identifier(name),
                    identifiers(columns)?
                ));
            }
            ConstraintChange::AddForeignKey {
                name,
                columns,
                target_schema,
                target_table,
                target_columns,
                on_delete,
                on_update,
            } => {
                name_check_target(target_schema, target_table)?;
                if columns.len() != target_columns.len() {
                    return Err("Each source column must have a referenced column.".into());
                }
                for column in columns {
                    if !input
                        .columns
                        .iter()
                        .any(|c| !c.removed && c.name == *column)
                    {
                        return Err("Foreign key column is not in the table draft.".into());
                    }
                }
                let delete = action(on_delete)?;
                let update = action(on_update)?;
                risky |= [delete, update]
                    .iter()
                    .any(|a| matches!(*a, "CASCADE" | "SET NULL" | "SET DEFAULT"));
                after.push(format!("ALTER TABLE ONLY {target} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({}) ON DELETE {delete} ON UPDATE {update};", quote_identifier(name), identifiers(columns)?, qualified_table(target_schema, target_table), identifiers(target_columns)?));
            }
        }
    }
    Ok((before, after, risky))
}

fn name_check_target(schema: &str, table: &str) -> Result<(), String> {
    name(schema)?;
    name(table)?;
    if schema == "information_schema" || schema.starts_with("pg_") {
        return Err("System tables cannot be relationship targets here.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_columns_actions_and_snapshot_owned_drops() {
        let mut draft: SchemaChange = serde_json::from_value(serde_json::json!({"schema":"public","table":"items","original":null,"expected":null,"dropTable":false,"columns":[{"original":null,"name":"a\"b","dataType":"text","nullable":true,"primaryKey":false,"identity":false,"removed":false,"defaultValue":null}],"constraints":[{"kind":"createIndex","name":"i\"x","columns":["a\"b"],"unique":true}]})).unwrap();
        let (_, sql, _) = plan(&draft, "\"public\".\"items\"").unwrap();
        assert_eq!(
            sql[0],
            "CREATE UNIQUE INDEX \"i\"\"x\" ON \"public\".\"items\" USING btree (\"a\"\"b\");"
        );
        draft.constraints = vec![ConstraintChange::DropIndex {
            name: "unrelated".into(),
        }];
        assert!(plan(&draft, "t").is_err());
        draft.expected = Some(
            serde_json::json!({"indexes":[{"name":"pk","primary":true,"constraintName":"pk"}]}),
        );
        draft.constraints = vec![ConstraintChange::DropIndex { name: "pk".into() }];
        assert!(plan(&draft, "t").is_err());
        assert!(action("CASCADE; DROP TABLE t").is_err());
        assert!(identifiers(&["id".into(), "id".into()]).is_err());
        assert!(identifiers(&[]).is_err());
    }
}
