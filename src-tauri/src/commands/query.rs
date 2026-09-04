use std::time::Duration;

use crate::{
    database::{
        models::{QueryErrorKind, QueryExecutionError, QueryResult},
        postgres,
    },
    state::AppState,
};

const DEFAULT_QUERY_TIMEOUT_MS: u64 = 30_000;
const MIN_QUERY_TIMEOUT_MS: u64 = 1_000;
const MAX_QUERY_TIMEOUT_MS: u64 = 300_000;

#[tauri::command]
pub(crate) async fn run_query(
    sql: String,
    max_rows: Option<usize>,
    timeout_ms: Option<u64>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, QueryExecutionError> {
    let (client, ssl_mode, _lease) = state.begin_operation().await?;
    let timeout = Duration::from_millis(
        timeout_ms
            .unwrap_or(DEFAULT_QUERY_TIMEOUT_MS)
            .clamp(MIN_QUERY_TIMEOUT_MS, MAX_QUERY_TIMEOUT_MS),
    );

    match tokio::time::timeout(timeout, postgres::execute_query(&client, &sql, max_rows)).await {
        Ok(result) => result,
        Err(_) => {
            let cancel_result = postgres::cancel_query(&client.cancel_token(), ssl_mode).await;
            let mut error = QueryExecutionError::simple(
                QueryErrorKind::Timeout,
                format!("Query exceeded the {} second timeout.", timeout.as_secs()),
            );
            if let Err(cancel_error) = cancel_result {
                error.detail = Some(cancel_error);
            }
            Err(error)
        }
    }
}

#[tauri::command]
pub(crate) async fn cancel_query(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let Some(active_operation) = state.active_operation() else {
        return Ok(false);
    };

    postgres::cancel_query(&active_operation.cancel_token, active_operation.ssl_mode).await?;
    Ok(true)
}
