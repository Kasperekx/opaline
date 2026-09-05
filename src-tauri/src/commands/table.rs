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
use tauri_plugin_fs::FsExt;
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub(crate) async fn apply_table_changes(
    session_id: String,
    input: crate::database::table_changes::TableChangesRequest,
    state: tauri::State<'_, AppState>,
) -> Result<
    crate::database::table_changes::TableChangesResult,
    crate::database::table_changes::TableChangesError,
> {
    use crate::database::table_changes::{apply_changes, TableChangesError};
    use std::sync::atomic::{AtomicBool, Ordering};
    let (client, _, lease) = state
        .begin_operation(&session_id, true)
        .await
        .map_err(|error| TableChangesError::rejected(error.message))?;
    let committing = AtomicBool::new(false);
    match tokio::time::timeout(
        std::time::Duration::from_secs(30),
        apply_changes(&client, &input, &committing, lease.session.tls.clone()),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            lease.invalidate();
            if committing.load(Ordering::SeqCst) {
                Err(TableChangesError::unknown())
            } else {
                Err(TableChangesError::rejected("Save timed out before commit. Nothing was committed. Reconnect before trying again."))
            }
        }
    }
}

#[tauri::command]
pub(crate) async fn save_text_export(
    app: tauri::AppHandle,
    path: String,
    contents: String,
) -> Result<(), String> {
    if contents.len() > 16 * 1024 * 1024 {
        return Err("Selected export exceeds 16 MiB. Use Export all rows instead.".into());
    }
    if !app.fs_scope().is_allowed(&path) {
        return Err("Choose the export destination in the Save dialog first.".into());
    }
    let output =
        crate::database::export_file::AtomicExport::create(std::path::Path::new(&path)).await?;
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(output.path())
        .await
        .map_err(|_| "Cannot open temporary export file.")?;
    file.write_all(contents.as_bytes())
        .await
        .map_err(|_| "Export write failed. Check free disk space.")?;
    file.sync_all()
        .await
        .map_err(|_| "Could not sync the export file.")?;
    drop(file);
    output.publish().await
}

#[tauri::command]
pub(crate) async fn load_table_page(
    session_id: String,
    input: TablePageRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableDataPage, String> {
    let client = state.client(&session_id).await?;
    let mut page = client
        .bounded(table_data::fetch_page(&client, &input))
        .await?;
    if client.session.info.read_only {
        page.editable = false;
        page.insertable = false;
        page.editability_reason = Some("This connection is read-only.".into());
        page.insertability_reason = page.editability_reason.clone();
    }
    Ok(page)
}

#[tauri::command]
pub(crate) async fn load_table_row(
    session_id: String,
    input: table_data::TableRowRequest,
    state: tauri::State<'_, AppState>,
) -> Result<table_data::TableRowSnapshot, String> {
    let client = state.client(&session_id).await?;
    client.bounded(table_data::fetch_row(&client, &input)).await
}

#[tauri::command]
pub(crate) async fn insert_table_row(
    session_id: String,
    input: InsertTableRowRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableDataRow, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation(&session_id, true)
        .await
        .map_err(|error| error.message)?;
    _lease
        .bounded(table_data::insert_row(&client, &input))
        .await
}

#[tauri::command]
pub(crate) async fn update_table_row(
    session_id: String,
    input: UpdateTableRowRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableDataRow, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation(&session_id, true)
        .await
        .map_err(|error| error.message)?;
    _lease
        .bounded(table_data::update_row(&client, &input))
        .await
}

#[tauri::command]
pub(crate) async fn delete_table_row(
    session_id: String,
    input: DeleteTableRowRequest,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation(&session_id, true)
        .await
        .map_err(|error| error.message)?;
    _lease
        .bounded(table_data::delete_row(&client, &input))
        .await
}

#[tauri::command]
pub(crate) async fn delete_table_rows(
    session_id: String,
    input: DeleteTableRowsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableMutationResult, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation(&session_id, true)
        .await
        .map_err(|error| error.message)?;
    _lease
        .bounded(table_mutation::delete_rows(&client, &input))
        .await
}

#[tauri::command]
pub(crate) async fn update_table_rows(
    session_id: String,
    input: UpdateTableRowsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<TableMutationResult, String> {
    let (client, _ssl_mode, _lease) = state
        .begin_operation(&session_id, true)
        .await
        .map_err(|error| error.message)?;
    _lease
        .bounded(table_mutation::update_rows(&client, &input))
        .await
}

#[tauri::command]
pub(crate) async fn export_table_data(
    app: tauri::AppHandle,
    session_id: String,
    input: ExportTableDataRequest,
    on_progress: tauri::ipc::Channel<TableExportProgress>,
    state: tauri::State<'_, AppState>,
) -> Result<TableExportResult, String> {
    if !app.fs_scope().is_allowed(&input.path) {
        return Err("Choose the export destination in the Save dialog first.".into());
    }
    let (client, _ssl_mode, _lease) = state
        .begin_operation(&session_id, false)
        .await
        .map_err(|error| error.message)?;
    _lease
        .bounded_for(
            table_export::export_table(&client, &input, |progress| {
                let _ = on_progress.send(progress);
            }),
            std::time::Duration::from_secs(300),
        )
        .await
}
