use crate::{
    database::{
        models::{
            DeleteTableRowRequest, DeleteTableRowsRequest, ExportTableDataRequest,
            InsertTableRowRequest, TableDataPage, TableDataRow, TableExportProgress,
            TableExportResult, TableMutationResult, TablePageRequest, UpdateTableRowRequest,
            UpdateTableRowsRequest,
        },
        table_data, table_export, table_mutation,
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

#[tauri::command]
pub(crate) async fn delete_table_rows(
    input: DeleteTableRowsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableMutationResult, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation()
        .await
        .map_err(|error| error.message)?;
    table_mutation::delete_rows(&client, &input).await
}

#[tauri::command]
pub(crate) async fn update_table_rows(
    input: UpdateTableRowsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableMutationResult, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation()
        .await
        .map_err(|error| error.message)?;
    table_mutation::update_rows(&client, &input).await
}

#[tauri::command]
pub(crate) async fn export_table_data(
    input: ExportTableDataRequest,
    on_progress: tauri::ipc::Channel<TableExportProgress>,
    state: tauri::State<'_, AppState>,
) -> Result<TableExportResult, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation()
        .await
        .map_err(|error| error.message)?;
    table_export::export_table(&client, &input, |progress| {
        let _ = on_progress.send(progress);
    })
    .await
}
