mod files;
mod managed;
pub(crate) mod models;
mod operations;
mod process;
#[cfg(test)]
mod tests;
mod tools;

use crate::{profiles::ProfileStore, state::AppState};
use files::PreparedFile;
use models::*;
use std::{collections::HashMap, path::PathBuf};
use tauri_plugin_fs::FsExt;
use tokio::sync::{watch, Mutex};
use tools::PgTools;

struct PreparedRestore {
    session_id: String,
    tools: PgTools,
    file: PreparedFile,
}
#[derive(Default)]
pub(crate) struct BackupState {
    tools: Mutex<HashMap<String, PgTools>>,
    prepared: Mutex<HashMap<String, PreparedRestore>>,
    jobs: Mutex<HashMap<String, watch::Sender<bool>>>,
}
impl BackupState {
    async fn tools(
        &self,
        session_id: &str,
        id: Option<&str>,
        app: &tauri::AppHandle,
        client: &tokio_postgres::Client,
    ) -> Result<PgTools, String> {
        if let Some(id) = id {
            let tools = self
                .tools
                .lock()
                .await
                .get(session_id)
                .filter(|tools| tools.info.id == id)
                .cloned()
                .ok_or(
                    "The custom tools selection expired. Choose it again or use automatic tools.",
                )?;
            operations::check_server(client, &tools).await?;
            Ok(tools)
        } else {
            managed::resolve(app, operations::server_major(client).await?).await
        }
    }
}

#[tauri::command]
pub(crate) async fn backup_tools(
    session_id: String,
    directory: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, BackupState>,
    database: tauri::State<'_, AppState>,
) -> Result<ToolInfo, String> {
    let client = database.client(&session_id).await?;
    let tools = match directory {
        Some(path) => {
            if !app.fs_scope().is_allowed(&path) {
                return Err(
                    "Choose a trusted PostgreSQL bin directory in the native dialog first.".into(),
                );
            }
            let tools = PgTools::detect(&PathBuf::from(path)).await?;
            operations::check_server(&client, &tools).await?;
            tools
        }
        None => managed::resolve(&app, operations::server_major(&client).await?).await?,
    };
    let info = tools.info.clone();
    let active = database.list().await;
    let mut selected = state.tools.lock().await;
    selected.retain(|session_id, _| active.iter().any(|session| &session.id == session_id));
    selected.insert(session_id, tools);
    Ok(info)
}

#[tauri::command]
pub(crate) async fn prepare_restore(
    session_id: String,
    tools_id: Option<String>,
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, BackupState>,
    database: tauri::State<'_, AppState>,
) -> Result<RestorePreview, String> {
    if !app.fs_scope().is_allowed(&path) {
        return Err("Choose the dump in the native Open dialog first.".into());
    }
    let client = database.client(&session_id).await?;
    if client.session.info.read_only {
        return Err("Restore is disabled for read-only connections.".into());
    }
    let tools = state
        .tools(&session_id, tools_id.as_deref(), &app, &client)
        .await?;
    let major = operations::check_server(&client, &tools).await?;
    let _inspection_lease = client;
    let mut prepared = state.prepared.lock().await;
    if prepared.len() >= 4 {
        return Err("Close an existing restore preview before preparing another file.".into());
    }
    let (sender, mut cancel) = watch::channel(false);
    {
        let mut jobs = state.jobs.lock().await;
        if jobs.contains_key(&session_id) {
            return Err("Another maintenance task is already running for this session.".into());
        }
        jobs.insert(session_id.clone(), sender);
    }
    let copy_cancel = cancel.clone();
    let job_session_id = session_id.clone();
    let outcome = async {
        let file = tokio::task::spawn_blocking(move || {
            files::snapshot_with_cancel(std::path::Path::new(&path), || *copy_cancel.borrow())
        })
        .await
        .map_err(|_| "Could not prepare the dump snapshot.")??;
        let preview = if file.format == DumpFormat::Custom {
            let mut command = tools::command(&tools.restore);
            command.arg("--list").arg(file.file.path());
            let bytes = tokio::select! {
                result = process::bounded_output(command) => result?,
                _ = cancel.changed() => return Err("Dump inspection cancelled.".into()),
            };
            String::from_utf8(bytes).map_err(|_| "Archive listing is not UTF-8.")?
        } else {
            file.text_preview.clone()
        };
        operations::check_dump_version(&preview, major)?;
        let id = uuid::Uuid::new_v4().to_string();
        let output = RestorePreview {
            id: id.clone(),
            format: file.format,
            bytes: file.bytes,
            digest: file.digest.clone(),
            preview,
            server_major: major,
        };
        prepared.insert(
            id,
            PreparedRestore {
                session_id,
                tools,
                file,
            },
        );
        Ok(output)
    }
    .await;
    state.jobs.lock().await.remove(&job_session_id);
    outcome
}

#[tauri::command]
pub(crate) async fn release_restore(
    id: String,
    state: tauri::State<'_, BackupState>,
) -> Result<(), String> {
    state.prepared.lock().await.remove(&id);
    Ok(())
}

#[tauri::command]
pub(crate) async fn cancel_backup(
    session_id: String,
    state: tauri::State<'_, BackupState>,
) -> Result<bool, String> {
    Ok(state
        .jobs
        .lock()
        .await
        .get(&session_id)
        .is_some_and(|sender| sender.send(true).is_ok()))
}

#[tauri::command]
pub(crate) async fn dump_database(
    session_id: String,
    input: DumpInput,
    on_progress: tauri::ipc::Channel<JobProgress>,
    app: tauri::AppHandle,
    state: tauri::State<'_, BackupState>,
    database: tauri::State<'_, AppState>,
    store: tauri::State<'_, ProfileStore>,
) -> Result<JobResult, String> {
    if !app.fs_scope().is_allowed(&input.path) {
        return Err("Choose a dump destination in the native Save dialog first.".into());
    }
    let (session, _maintenance) = database.maintenance(&session_id, false).await?;
    let tools = state
        .tools(
            &session_id,
            input.tools_id.as_deref(),
            &app,
            &session.client,
        )
        .await?;
    let (_, config) = store
        .connect_config(
            session.info.profile_id.clone(),
            input
                .password
                .clone()
                .or_else(|| session.password().map(str::to_owned)),
        )
        .await?;
    let (sender, cancel) = watch::channel(false);
    state.jobs.lock().await.insert(session_id.clone(), sender);
    let result = operations::dump(&session, &tools, config, input, cancel, |event| {
        let _ = on_progress.send(event);
    })
    .await;
    state.jobs.lock().await.remove(&session_id);
    result
}

#[tauri::command]
pub(crate) async fn restore_database(
    session_id: String,
    input: RestoreInput,
    on_progress: tauri::ipc::Channel<JobProgress>,
    state: tauri::State<'_, BackupState>,
    database: tauri::State<'_, AppState>,
    store: tauri::State<'_, ProfileStore>,
) -> Result<JobResult, String> {
    let (session, _maintenance) = database.maintenance(&session_id, true).await?;
    operations::validate_restore(&session.info, &input)?;
    let (_, config) = store
        .connect_config(
            session.info.profile_id.clone(),
            input
                .password
                .clone()
                .or_else(|| session.password().map(str::to_owned)),
        )
        .await?;
    let mut prepared_map = state.prepared.lock().await;
    if prepared_map
        .get(&input.prepared_id)
        .is_none_or(|p| p.session_id != session_id)
    {
        return Err("Prepare this dump again in the target connection.".into());
    }
    let prepared = prepared_map
        .remove(&input.prepared_id)
        .ok_or("Restore preview expired.")?;
    drop(prepared_map);
    let (sender, cancel) = watch::channel(false);
    state.jobs.lock().await.insert(session_id.clone(), sender);
    let result = operations::restore(&session, prepared, config, input, cancel, |event| {
        let _ = on_progress.send(event);
    })
    .await;
    state.jobs.lock().await.remove(&session_id);
    // Even a failed restore may have changed data. Never present earlier results as current.
    database.invalidate_database(&session.info).await;
    result
}
