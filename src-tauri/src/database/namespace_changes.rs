use super::{
    client::DatabaseClient,
    table_changes::TransactionGuard,
    table_data::quote_identifier,
};
use serde::{Deserialize, Serialize};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tokio_postgres::Client;

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum NamespaceKind {
    Create,
    Rename,
    Drop,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DropMode {
    #[default]
    Restrict,
    Cascade,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NamespaceChange {
    pub kind: NamespaceKind,
    pub name: String,
    #[serde(default)]
    pub new_name: Option<String>,
    #[serde(default)]
    pub drop_mode: DropMode,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Plan {
    pub sql: String,
    pub destructive: bool,
}

#[derive(Serialize)]
pub(crate) struct ChangeError {
    pub kind: &'static str,
    pub message: String,
}

impl ChangeError {
    pub fn rejected(message: impl Into<String>) -> Self {
        Self {
            kind: "rejected",
            message: message.into(),
        }
    }
    pub fn unknown() -> Self {
        Self {
            kind: "unknown",
            message: "Commit outcome is unknown. Reconnect and inspect schemas before making another change. This request will not be retried.".into(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SchemaInfo {
    pub name: String,
}

fn validate_name(value: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > 63 || value.contains('\0') {
        return Err("Names must contain 1–63 UTF-8 bytes and no null character.".into());
    }
    if value == "information_schema" || value.starts_with("pg_") {
        return Err("System schemas cannot be managed here. Use SQL if you must.".into());
    }
    Ok(())
}

pub(crate) fn plan(input: &NamespaceChange) -> Result<Plan, String> {
    validate_name(&input.name)?;
    match input.kind {
        NamespaceKind::Create => Ok(Plan {
            sql: format!("CREATE SCHEMA {};", quote_identifier(&input.name)),
            destructive: false,
        }),
        NamespaceKind::Rename => {
            let new_name = input
                .new_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Enter a new schema name.".to_string())?;
            validate_name(new_name)?;
            if new_name == input.name {
                return Err("Choose a different name to rename the schema.".into());
            }
            Ok(Plan {
                sql: format!(
                    "ALTER SCHEMA {} RENAME TO {};",
                    quote_identifier(&input.name),
                    quote_identifier(new_name)
                ),
                destructive: false,
            })
        }
        NamespaceKind::Drop => {
            let cascade = matches!(input.drop_mode, DropMode::Cascade);
            Ok(Plan {
                sql: format!(
                    "DROP SCHEMA {} {};",
                    quote_identifier(&input.name),
                    if cascade { "CASCADE" } else { "RESTRICT" }
                ),
                destructive: true,
            })
        }
    }
}

pub(crate) async fn list_schemas(client: &Client) -> Result<Vec<SchemaInfo>, String> {
    let rows = client
        .query(
            "SELECT nspname FROM pg_catalog.pg_namespace \
             WHERE nspname <> 'information_schema' \
               AND nspname NOT LIKE 'pg\\_%' ESCAPE '\\' \
             ORDER BY nspname",
            &[],
        )
        .await
        .map_err(|_| "Cannot load schemas. Refresh to retry.".to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| SchemaInfo {
            name: row.get(0),
        })
        .collect())
}

pub(crate) async fn apply(
    client: &DatabaseClient,
    input: &NamespaceChange,
    confirmation: &str,
    committing: &AtomicBool,
    tls: Option<rustls::ClientConfig>,
) -> Result<(), ChangeError> {
    let plan = plan(input).map_err(ChangeError::rejected)?;
    if plan.destructive && confirmation != input.name {
        return Err(ChangeError::rejected(
            "Confirm the schema name before applying potentially destructive changes.",
        ));
    }
    let mut guard = TransactionGuard {
        client,
        tls,
        finished: false,
    };
    client
        .batch_execute(
            "BEGIN; SET LOCAL statement_timeout = '25000ms'; SET LOCAL lock_timeout = '5000ms';",
        )
        .await
        .map_err(|_| {
            ChangeError::rejected("Could not begin schema change. Reconnect and try again.")
        })?;
    let result: Result<(), String> = async {
        client
            .batch_execute("SET LOCAL search_path = pg_catalog")
            .await
            .map_err(|e| e.to_string())?;
        client
            .batch_execute(&plan.sql)
            .await
            .map_err(|e| {
                e.as_db_error()
                    .map(|db| db.message().to_string())
                    .unwrap_or_else(|| "Database connection failed.".into())
            })?;
        Ok(())
    }
    .await;
    if let Err(message) = result {
        guard.finished = matches!(
            tokio::time::timeout(Duration::from_secs(3), client.batch_execute("ROLLBACK")).await,
            Ok(Ok(()))
        );
        return Err(ChangeError::rejected(format!(
            "Nothing was applied. {message}"
        )));
    }
    committing.store(true, Ordering::SeqCst);
    match client.batch_execute("COMMIT").await {
        Ok(()) => {
            guard.finished = true;
            Ok(())
        }
        Err(error)
            if error.as_db_error().is_some_and(|db| {
                !matches!(db.severity(), "FATAL" | "PANIC") && !db.code().code().starts_with("08")
            }) =>
        {
            guard.finished = matches!(
                tokio::time::timeout(Duration::from_secs(3), client.batch_execute("ROLLBACK"))
                    .await,
                Ok(Ok(()))
            );
            Err(ChangeError::rejected(
                "The database rejected the commit. Nothing was applied.",
            ))
        }
        Err(_) => Err(ChangeError::unknown()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn change(
        kind: NamespaceKind,
        name: &str,
        new_name: Option<&str>,
        drop_mode: DropMode,
    ) -> NamespaceChange {
        NamespaceChange {
            kind,
            name: name.into(),
            new_name: new_name.map(str::to_string),
            drop_mode,
        }
    }

    #[test]
    fn plans_create_rename_and_drop() {
        assert_eq!(
            plan(&change(NamespaceKind::Create, "analytics", None, DropMode::Restrict))
                .unwrap()
                .sql,
            "CREATE SCHEMA \"analytics\";"
        );
        let renamed = plan(&change(
            NamespaceKind::Rename,
            "analytics",
            Some("reporting"),
            DropMode::Restrict,
        ))
        .unwrap();
        assert_eq!(
            renamed.sql,
            "ALTER SCHEMA \"analytics\" RENAME TO \"reporting\";"
        );
        assert!(!renamed.destructive);
        let drop_restrict = plan(&change(
            NamespaceKind::Drop,
            "analytics",
            None,
            DropMode::Restrict,
        ))
        .unwrap();
        assert_eq!(drop_restrict.sql, "DROP SCHEMA \"analytics\" RESTRICT;");
        assert!(drop_restrict.destructive);
        let drop_cascade = plan(&change(
            NamespaceKind::Drop,
            "analytics",
            None,
            DropMode::Cascade,
        ))
        .unwrap();
        assert_eq!(drop_cascade.sql, "DROP SCHEMA \"analytics\" CASCADE;");
    }

    #[test]
    fn quotes_and_rejects_bad_names() {
        assert_eq!(
            plan(&change(
                NamespaceKind::Create,
                "a\"b",
                None,
                DropMode::Restrict
            ))
            .unwrap()
            .sql,
            "CREATE SCHEMA \"a\"\"b\";"
        );
        assert!(plan(&change(
            NamespaceKind::Create,
            "pg_toast",
            None,
            DropMode::Restrict
        ))
        .is_err());
        assert!(plan(&change(
            NamespaceKind::Drop,
            "information_schema",
            None,
            DropMode::Restrict
        ))
        .is_err());
        assert!(plan(&change(
            NamespaceKind::Rename,
            "ok",
            Some("ok"),
            DropMode::Restrict
        ))
        .is_err());
        assert!(plan(&change(
            NamespaceKind::Rename,
            "ok",
            None,
            DropMode::Restrict
        ))
        .is_err());
    }
}
