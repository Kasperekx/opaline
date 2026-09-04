use crate::{
    database::{
        models::{
            DeleteTableRowRequest, InsertTableRowRequest, TableDataPage, TableDataRow,
            TablePageRequest, UpdateTableRowRequest,
        },
        table_data,
    },
    state::AppState,
};

#[tauri::command]
pub(crate) async fn load_table_page(
    input: TablePageRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableDataPage, String> {
    let client = state.client().await?;
    table_data::fetch_page(&client, &input).await
}

#[tauri::command]
pub(crate) async fn insert_table_row(
    input: InsertTableRowRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableDataRow, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation()
        .await
        .map_err(|error| error.message)?;
    table_data::insert_row(&client, &input).await
}

#[tauri::command]
pub(crate) async fn update_table_row(
    input: UpdateTableRowRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableDataRow, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation()
        .await
        .map_err(|error| error.message)?;
    table_data::update_row(&client, &input).await
}

#[tauri::command]
pub(crate) async fn delete_table_row(
    input: DeleteTableRowRequest,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation()
        .await
        .map_err(|error| error.message)?;
    table_data::delete_row(&client, &input).await
}
