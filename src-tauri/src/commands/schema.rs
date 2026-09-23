use crate::{
    database::{
        models::{ColumnInfo, DatabaseObject},
        postgres, structure,
    },
    state::AppState,
};

#[tauri::command]
pub(crate) async fn list_enum_types(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::database::schema_changes::enums::EnumType>, String> {
    let client = state.client(&session_id).await?;
    client
        .bounded(crate::database::schema_changes::enums::catalog(&client))
        .await
}

#[tauri::command]
pub(crate) fn preview_schema_change(
    input: crate::database::schema_changes::SchemaChange,
) -> Result<crate::database::schema_changes::Plan, String> {
    crate::database::schema_changes::plan(&input)
}

#[tauri::command]
pub(crate) async fn apply_schema_change(
    session_id: String,
    input: crate::database::schema_changes::SchemaChange,
    confirmation: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), crate::database::schema_changes::ChangeError> {
    use crate::database::schema_changes::{apply, ChangeError};
    use std::sync::atomic::{AtomicBool, Ordering};
    let (client, _, lease) = state
        .begin_operation(&session_id, true)
        .await
        .map_err(|e| ChangeError::rejected(e.message))?;
    let committing = AtomicBool::new(false);
    match tokio::time::timeout(
        std::time::Duration::from_secs(30),
        apply(
            &client,
            &input,
            &confirmation,
            &committing,
            lease.session.tls.clone(),
        ),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            lease.invalidate();
            if committing.load(Ordering::SeqCst) {
                Err(ChangeError::unknown())
            } else {
                Err(ChangeError::rejected("Schema change timed out before commit. Nothing was committed. Reconnect before trying again."))
            }
        }
    }
}

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
pub(crate) async fn database_diagram(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client(&session_id).await?;
    client
        .bounded(crate::database::diagram::inspect(&client))
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
