use crate::{
    database::{
        models::{ColumnInfo, DatabaseObject},
        postgres, structure,
    },
    state::AppState,
};

#[tauri::command]
pub(crate) async fn list_database_objects(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DatabaseObject>, String> {
    let client = state.client().await?;
    postgres::list_objects(&client).await
}

#[tauri::command]
pub(crate) async fn inspect_relation(
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<structure::models::RelationStructure, String> {
    let client = state.client().await?;
    structure::inspect(&client, &schema, &table).await
}

#[tauri::command]
pub(crate) async fn list_columns(
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ColumnInfo>, String> {
    let client = state.client().await?;
    postgres::list_columns(&client, &schema, &table).await
}
