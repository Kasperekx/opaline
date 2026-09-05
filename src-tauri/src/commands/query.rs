use crate::{
    database::{
        models::{QueryErrorKind, QueryExecutionError, QueryResult},
        postgres, read_only, transaction_policy,
    },
    state::AppState,
};
use std::time::Duration;

#[tauri::command]
pub(crate) async fn run_query(
    session_id: String,
    sql: String,
    max_rows: Option<usize>,
    timeout_ms: Option<u64>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, QueryExecutionError> {
    execute(&state, &session_id, &sql, max_rows, timeout_ms).await
}

pub(crate) async fn execute(
    state: &AppState,
    session_id: &str,
    sql: &str,
    max_rows: Option<usize>,
    timeout_ms: Option<u64>,
) -> Result<QueryResult, QueryExecutionError> {
    transaction_policy::validate(sql)?;
    let (client, tls, lease) = state.begin_operation(session_id, false).await?;
    let read_only = lease.session.info.read_only;
    let database_error = |e: tokio_postgres::Error| {
        QueryExecutionError::simple(QueryErrorKind::Database, e.to_string())
    };
    if read_only {
        read_only::validate(sql)?;
    }
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30_000).clamp(1_000, 300_000));
    let result = match tokio::time::timeout(timeout, async {
        client
            .batch_execute(if read_only {
                "BEGIN READ ONLY"
            } else {
                "SET standard_conforming_strings = on; BEGIN"
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
    result
}

#[tauri::command]
pub(crate) async fn cancel_query(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    state.cancel(&session_id).await
}
