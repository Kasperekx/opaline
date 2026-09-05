use crate::{
    database::{
        models::{QueryErrorKind, QueryExecutionError, QueryResult},
        postgres, read_only, transaction_policy,
    },
    state::{AppState, OperationLease},
};
use std::time::Duration;
use transaction_policy::ExecutionMode;

// If the command future is dropped, never return an open transaction or a still
// running statement to another operation on the same session.
struct ExecutionGuard<'a> {
    lease: &'a OperationLease,
    finished: bool,
}
impl Drop for ExecutionGuard<'_> {
    fn drop(&mut self) {
        if !self.finished {
            self.lease.invalidate();
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                let token = self.lease.session.client.cancel_token();
                let tls = self.lease.session.tls.clone();
                runtime.spawn(async move {
                    let _ = tokio::time::timeout(
                        Duration::from_secs(5),
                        postgres::cancel_with_tls(&token, tls),
                    )
                    .await;
                });
            }
        }
    }
}

#[tauri::command]
pub(crate) async fn run_query(
    session_id: String,
    sql: String,
    max_rows: Option<usize>,
    timeout_ms: Option<u64>,
    execution_mode: Option<ExecutionMode>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, QueryExecutionError> {
    execute_with_mode(
        &state,
        &session_id,
        &sql,
        max_rows,
        timeout_ms,
        execution_mode.unwrap_or_default(),
    )
    .await
}

#[cfg(test)]
pub(crate) async fn execute(
    state: &AppState,
    session_id: &str,
    sql: &str,
    max_rows: Option<usize>,
    timeout_ms: Option<u64>,
) -> Result<QueryResult, QueryExecutionError> {
    execute_with_mode(
        state,
        session_id,
        sql,
        max_rows,
        timeout_ms,
        ExecutionMode::Atomic,
    )
    .await
}

pub(crate) async fn execute_with_mode(
    state: &AppState,
    session_id: &str,
    sql: &str,
    max_rows: Option<usize>,
    timeout_ms: Option<u64>,
    mode: ExecutionMode,
) -> Result<QueryResult, QueryExecutionError> {
    transaction_policy::validate_mode(sql, mode)?;
    let (client, tls, lease) = state.begin_operation(session_id, false).await?;
    let read_only = lease.session.info.read_only;
    let database_error = |e: tokio_postgres::Error| {
        QueryExecutionError::simple(QueryErrorKind::Database, e.to_string())
    };
    if read_only {
        if mode == ExecutionMode::Autocommit {
            return Err(QueryExecutionError::simple(QueryErrorKind::Validation, "Autocommit requires a read/write session. Read-only queries always use a protected atomic transaction."));
        }
        read_only::validate(sql)?;
    }
    let mut guard = ExecutionGuard {
        lease: &lease,
        finished: false,
    };
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30_000).clamp(1_000, 300_000));
    let result = match tokio::time::timeout(timeout, async {
        client
            .batch_execute(if read_only {
                "BEGIN READ ONLY"
            } else if mode == ExecutionMode::Atomic {
                "SET standard_conforming_strings = on; BEGIN"
            } else {
                "SET standard_conforming_strings = on"
            })
            .await
            .map_err(database_error)?;
        postgres::execute_query(&client, sql, max_rows).await
    })
    .await
    {
        Ok(result) => result,
        Err(_) => {
            let cancelled = tokio::time::timeout(
                Duration::from_secs(5),
                postgres::cancel_with_tls(&client.cancel_token(), tls),
            )
            .await;
            if !matches!(cancelled, Ok(Ok(()))) {
                lease.invalidate();
            }
            Err(QueryExecutionError::simple(
                QueryErrorKind::Timeout,
                format!("Query exceeded the {} second timeout.", timeout.as_secs()),
            ))
        }
    };
    if mode == ExecutionMode::Autocommit {
        // No BEGIN/COMMIT/ROLLBACK is sent for this mode. A lost response, a
        // cancelled stream or failed result decoding may follow a committed write.
        if result.is_ok() {
            guard.finished = true;
            return result;
        }
        return result.map_err(|mut error| {
            error.message.push_str(" Autocommit was used: no application rollback is available. Verify the database before retrying; reconnect to continue.");
            error
        });
    }
    // Never release the session gate with an open/aborted transaction. A successful
    // database mutation is not reported to the UI until COMMIT has been acknowledged.
    let commit = !read_only && result.is_ok();
    let cleanup = tokio::time::timeout(
        Duration::from_secs(5),
        client.batch_execute(if commit { "COMMIT" } else { "ROLLBACK" }),
    )
    .await;
    if !matches!(cleanup, Ok(Ok(()))) {
        lease.invalidate();
        return Err(QueryExecutionError::simple(
            QueryErrorKind::Database,
            if commit {
                "Commit was not confirmed. The write outcome is unknown. Reconnect and inspect the database before deciding whether to retry."
            } else {
                "Transaction cleanup was not confirmed. Reconnect before continuing; no SQL will be replayed automatically."
            },
        ));
    }
    guard.finished = true;
    result
}

#[tauri::command]
pub(crate) async fn cancel_query(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    state.cancel(&session_id).await
}
