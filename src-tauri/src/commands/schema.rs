use crate::{
    database::{
        models::{ColumnInfo, DatabaseObject},
        postgres, structure,
    },
    state::AppState,
};

#[derive(serde::Serialize)]
pub(crate) struct CompletionColumn {
    schema: String,
    table: String,
    column: String,
}

#[tauri::command]
pub(crate) async fn sql_completion_catalog(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<CompletionColumn>, String> {
    let client = state.client(&session_id).await?;
    client.bounded(async {
        let rows = client.query("SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name, ordinal_position LIMIT 10001", &[]).await.map_err(|_| "Cannot load SQL suggestions. Refresh metadata to retry.")?;
        if rows.len() > 10000 { return Err("Column autocomplete is limited to 10,000 columns. Table and keyword suggestions remain available.".into()); }
        Ok(rows.into_iter().map(|row| CompletionColumn { schema: row.get(0), table: row.get(1), column: row.get(2) }).collect())
    }).await
}

#[tauri::command]
pub(crate) async fn list_database_objects(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DatabaseObject>, String> {
    let client = state.client(&session_id).await?;
    client.bounded(postgres::list_objects(&client)).await
}

#[tauri::command]
pub(crate) async fn inspect_relation(
    session_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<structure::models::RelationStructure, String> {
    let client = state.client(&session_id).await?;
    client
        .bounded(structure::inspect(&client, &schema, &table))
        .await
}

#[tauri::command]
pub(crate) async fn list_columns(
    session_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ColumnInfo>, String> {
    let client = state.client(&session_id).await?;
    client
        .bounded(postgres::list_columns(&client, &schema, &table))
        .await
}
