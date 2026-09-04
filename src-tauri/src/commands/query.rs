use crate::{
    database::{models::QueryResult, postgres},
    state::AppState,
};

#[tauri::command]
pub(crate) async fn run_query(
    sql: String,
    max_rows: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, String> {
    let client = state.client().await?;
    postgres::execute_query(&client, &sql, max_rows).await
}
