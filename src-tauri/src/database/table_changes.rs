use super::{
    client::DatabaseClient,
    models::{
        DeleteTableRowRequest, InsertTableRowRequest, TableCellValue, TableDataRow,
        UpdateTableRowRequest,
    },
    table_data,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

const MAX_CHANGES: usize = 500;
const MAX_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TableChangesRequest {
    pub schema: String,
    pub table: String,
    pub changes: Vec<TableChange>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum TableChange {
    Insert {
        id: String,
        values: Vec<TableCellValue>,
    },
    #[serde(rename_all = "camelCase")]
    Update {
        id: String,
        key: Vec<TableCellValue>,
        row_version: String,
        changes: Vec<TableCellValue>,
    },
    #[serde(rename_all = "camelCase")]
    Delete {
        id: String,
        key: Vec<TableCellValue>,
        row_version: String,
    },
}
impl TableChange {
    fn id(&self) -> &str {
        match self {
            Self::Insert { id, .. } | Self::Update { id, .. } | Self::Delete { id, .. } => id,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChangedRow {
    pub id: String,
    pub row: Option<TableDataRow>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableChangesResult {
    pub rows: Vec<ChangedRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableChangesError {
    pub kind: &'static str,
    pub message: String,
    pub row_id: Option<String>,
}
impl TableChangesError {
    pub fn rejected(message: impl Into<String>) -> Self {
        Self {
            kind: "rejected",
            message: message.into(),
            row_id: None,
        }
    }
    pub fn unknown() -> Self {
        Self { kind: "unknown", message: "Connection lost while committing. The database may have saved these changes. Verify the affected rows before discarding this draft; do not retry this batch blindly.".into(), row_id: None }
    }
}

// Abort the transport if this future is cancelled, times out, or cannot roll back.
// A pooled/session connection must never escape with an open transaction.
struct TransactionGuard<'a> {
    client: &'a DatabaseClient,
    tls: Option<rustls::ClientConfig>,
    finished: bool,
}
impl Drop for TransactionGuard<'_> {
    fn drop(&mut self) {
        if !self.finished {
            self.client.abort();
            // Closing a socket alone may leave a long-running server statement holding locks.
            // Cancel on a separate connection, preserving the session's TLS/CA policy.
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                let token = self.client.cancel_token();
                let tls = self.tls.clone();
                runtime.spawn(async move {
                    let _ = tokio::time::timeout(
                        Duration::from_secs(5),
                        super::postgres::cancel_with_tls(&token, tls),
                    )
                    .await;
                });
            }
        }
    }
}

fn validate_request(input: &TableChangesRequest) -> Result<(), TableChangesError> {
    table_data::validate_relation_name(&input.schema, &input.table)
        .map_err(TableChangesError::rejected)?;
    if input.changes.is_empty() || input.changes.len() > MAX_CHANGES {
        return Err(TableChangesError::rejected(
            "Save between 1 and 500 row changes at a time.",
        ));
    }
    let mut ids = HashSet::new();
    let mut keys = HashSet::new();
    let mut bytes = 0;
    for change in &input.changes {
        if change.id().is_empty() || change.id().len() > 200 || !ids.insert(change.id()) {
            return Err(TableChangesError::rejected(
                "Every row change needs a unique local identifier.",
            ));
        }
        let (key, values, version) = match change {
            TableChange::Insert { values, .. } => (None, values.as_slice(), ""),
            TableChange::Update {
                key,
                changes,
                row_version,
                ..
            } => (Some(key), changes.as_slice(), row_version.as_str()),
            TableChange::Delete {
                key, row_version, ..
            } => (Some(key), &[][..], row_version.as_str()),
        };
        if let Some(key) = key {
            if key.is_empty() || version.parse::<u32>().is_err() {
                return Err(TableChangesError::rejected(
                    "A row is missing its original primary key or version.",
                ));
            }
            let mut identity = key
                .iter()
                .map(|v| (&v.column, &v.value))
                .collect::<Vec<_>>();
            identity.sort();
            if !keys.insert(identity) {
                return Err(TableChangesError::rejected(
                    "A row may occur only once in a change set.",
                ));
            }
        }
        for value in values.iter().chain(key.into_iter().flatten()) {
            bytes += value.column.len() + value.value.as_ref().map_or(0, String::len);
        }
        if bytes > MAX_BYTES {
            return Err(TableChangesError::rejected(
                "Pending values exceed the 8 MiB save budget.",
            ));
        }
    }
    Ok(())
}

pub(crate) async fn apply_changes(
    client: &DatabaseClient,
    input: &TableChangesRequest,
    committing: &AtomicBool,
    tls: Option<rustls::ClientConfig>,
) -> Result<TableChangesResult, TableChangesError> {
    validate_request(input)?;
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
            TableChangesError::rejected(
                "Could not begin the save. Reconnect if the connection was lost.",
            )
        })?;
    let mut rows = Vec::with_capacity(input.changes.len());
    let mut response_bytes = 0usize;
    for change in &input.changes {
        let result = match change {
            TableChange::Insert { values, .. } => table_data::insert_row(
                client,
                &InsertTableRowRequest {
                    schema: input.schema.clone(),
                    table: input.table.clone(),
                    values: values.clone(),
                },
            )
            .await
            .map(Some),
            TableChange::Update {
                key,
                row_version,
                changes,
                ..
            } => table_data::update_row(
                client,
                &UpdateTableRowRequest {
                    schema: input.schema.clone(),
                    table: input.table.clone(),
                    key: key.clone(),
                    row_version: row_version.clone(),
                    changes: changes.clone(),
                },
            )
            .await
            .map(Some),
            TableChange::Delete {
                key, row_version, ..
            } => table_data::delete_row(
                client,
                &DeleteTableRowRequest {
                    schema: input.schema.clone(),
                    table: input.table.clone(),
                    key: key.clone(),
                    row_version: row_version.clone(),
                },
            )
            .await
            .map(|()| None),
        };
        let result = result.and_then(|row| {
            response_bytes = response_bytes.saturating_add(row.as_ref().map_or(0, |row| row.values.iter().flatten().map(String::len).sum::<usize>()) + change.id().len());
            if response_bytes > MAX_BYTES {
                Err("Returned row values exceed the 8 MiB save budget. Save fewer rows or use SQL to update selected columns.".into())
            } else { Ok(row) }
        });
        match result {
            Ok(row) => rows.push(ChangedRow {
                id: change.id().into(),
                row,
            }),
            Err(message) => {
                guard.finished = matches!(
                    tokio::time::timeout(Duration::from_secs(3), client.batch_execute("ROLLBACK"))
                        .await,
                    Ok(Ok(()))
                );
                return Err(TableChangesError {
                    kind: "rejected",
                    message: format!("Nothing was saved. {message}"),
                    row_id: Some(change.id().into()),
                });
            }
        }
    }
    committing.store(true, Ordering::SeqCst);
    match client.batch_execute("COMMIT").await {
        Ok(()) => {
            guard.finished = true;
            Ok(TableChangesResult { rows })
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
            Err(TableChangesError::rejected(format!(
                "The database rejected the commit; nothing was saved. {error}"
            )))
        }
        Err(_) => Err(TableChangesError::unknown()),
    }
}

#[cfg(test)]
mod tests;
