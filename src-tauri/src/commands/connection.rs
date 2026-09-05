use crate::{
    database::{models::ConnectionInfo, postgres},
    profiles::{models::*, ProfileStore},
    state::AppState,
};
use tauri_plugin_fs::FsExt;

#[tauri::command]
pub(crate) async fn move_profile(
    id: String,
    workspace_id: String,
    store: tauri::State<'_, ProfileStore>,
    state: tauri::State<'_, AppState>,
) -> Result<ConnectionCatalog, String> {
    let _guard = state.profile_operations.lock().await;
    if state.profile_active(&id).await {
        return Err(
            "Disconnect this profile before moving it. Its drafts and history will be kept.".into(),
        );
    }
    store.move_profile(id, workspace_id).await
}
#[tauri::command]
pub(crate) async fn remove_workspace(
    id: String,
    destination: Option<String>,
    store: tauri::State<'_, ProfileStore>,
    state: tauri::State<'_, AppState>,
) -> Result<ConnectionCatalog, String> {
    let _guard = state.profile_operations.lock().await;
    if state.list().await.iter().any(|s| s.workspace_id == id) {
        return Err("Disconnect all sessions in this workspace before removing it.".into());
    }
    store.remove_workspace(id, destination).await
}
#[tauri::command]
pub(crate) async fn preview_profile_import(
    path: String,
    app: tauri::AppHandle,
) -> Result<crate::profiles::transfer::ProfileTransfer, String> {
    if !app.fs_scope().is_allowed(&path) {
        return Err("Choose a profile file in the native dialog first.".into());
    }
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut bytes = Vec::new();
        std::fs::File::open(path).map_err(|_| "Cannot open profile file.")?.take(4 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|_| "Cannot read profile file.")?;
        if bytes.len() > 4 * 1024 * 1024 { return Err("Profile file exceeds 4 MiB.".into()); }
        let transfer: crate::profiles::transfer::ProfileTransfer = serde_json::from_slice(&bytes).map_err(|_| "Invalid profile transfer. Only Opaline version 1 exports without credentials or foreign identities are accepted.")?;
        transfer.validate()?; Ok(transfer)
    }).await.map_err(|_| "Cannot read profile file.")?
}
#[tauri::command]
pub(crate) async fn import_profiles(
    workspace_id: String,
    transfer: crate::profiles::transfer::ProfileTransfer,
    store: tauri::State<'_, ProfileStore>,
) -> Result<ConnectionCatalog, String> {
    store.import_profiles(workspace_id, transfer).await
}
#[tauri::command]
pub(crate) async fn export_profiles(
    workspace_id: String,
    path: String,
    store: tauri::State<'_, ProfileStore>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if !app.fs_scope().is_allowed(&path) {
        return Err("Choose the destination in the native Save dialog first.".into());
    }
    let catalog = store.catalog().await?;
    let transfer = crate::profiles::transfer::ProfileTransfer {
        version: 1,
        profiles: catalog
            .profiles
            .iter()
            .filter(|p| p.workspace_id == workspace_id)
            .map(crate::profiles::transfer::PortableProfile::from_profile)
            .collect(),
    };
    transfer.validate()?;
    let bytes =
        serde_json::to_vec_pretty(&transfer).map_err(|_| "Cannot encode profile export.")?;
    let output =
        crate::database::export_file::AtomicExport::create(std::path::Path::new(&path)).await?;
    tokio::fs::write(output.path(), bytes)
        .await
        .map_err(|_| "Cannot write profile export.")?;
    tokio::fs::OpenOptions::new()
        .write(true)
        .open(output.path())
        .await
        .map_err(|_| "Cannot open profile export.")?
        .sync_all()
        .await
        .map_err(|_| "Cannot flush profile export.")?;
    output.publish().await
}

#[tauri::command]
pub(crate) async fn connection_catalog(
    store: tauri::State<'_, ProfileStore>,
) -> Result<ConnectionCatalog, String> {
    store.catalog().await
}

#[tauri::command]
pub(crate) async fn save_workspace(
    id: Option<String>,
    name: String,
    store: tauri::State<'_, ProfileStore>,
) -> Result<ConnectionCatalog, String> {
    store.workspace(id, name).await
}

#[tauri::command]
pub(crate) async fn test_profile(
    input: ProfileInput,
    store: tauri::State<'_, ProfileStore>,
) -> Result<ConnectionInfo, String> {
    let config = store.config(&input).await?;
    let (_, info) = postgres::connect(&config).await?;
    Ok(info)
}

#[tauri::command]
pub(crate) async fn save_profile(
    input: ProfileInput,
    store: tauri::State<'_, ProfileStore>,
    state: tauri::State<'_, AppState>,
) -> Result<ConnectionCatalog, String> {
    let _profile_operation = state.profile_operations.lock().await;
    if let Some(id) = &input.id {
        if state.profile_active(id).await {
            return Err("Disconnect this profile before editing it.".into());
        }
    }
    let config = store.config(&input).await?;
    let _ = postgres::connect(&config).await?;
    store.save(input).await
}

#[tauri::command]
pub(crate) async fn delete_profile(
    id: String,
    store: tauri::State<'_, ProfileStore>,
    state: tauri::State<'_, AppState>,
) -> Result<ConnectionCatalog, String> {
    let _profile_operation = state.profile_operations.lock().await;
    if state.profile_active(&id).await {
        return Err("Disconnect this profile before deleting it.".into());
    }
    store.delete(id).await
}

#[tauri::command]
pub(crate) async fn connect_profile(
    profile_id: String,
    password: Option<String>,
    confirm_production_write: bool,
    store: tauri::State<'_, ProfileStore>,
    state: tauri::State<'_, AppState>,
) -> Result<SessionInfo, String> {
    let _profile_operation = state.profile_operations.lock().await;
    let (profile, config) = store.connect_config(profile_id, password).await?;
    if profile.settings.environment == Environment::Production
        && !profile.settings.read_only
        && !confirm_production_write
    {
        return Err(
            "Confirm the production warning before opening a connection with write access.".into(),
        );
    }
    let tls = postgres::tls_config(&config).await?;
    let reconnect_id = state.reconnect_id(&profile.id).await?;
    let (client, connection) = postgres::connect_with_tls(&config, tls.clone()).await?;
    let info = SessionInfo {
        id: reconnect_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        profile_id: profile.id,
        workspace_id: profile.workspace_id,
        environment: profile.settings.environment,
        read_only: profile.settings.read_only,
        connection,
    };
    state
        .add_with_password(client, info.clone(), tls, Some(config.password))
        .await?;
    Ok(info)
}

#[tauri::command]
pub(crate) async fn disconnect_postgres(
    session_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.disconnect(&session_id).await
}

#[tauri::command]
pub(crate) async fn active_connections(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SessionInfo>, String> {
    Ok(state.list().await)
}

#[tauri::command]
pub(crate) async fn connection_statuses(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::state::SessionStatus>, String> {
    Ok(state.statuses().await)
}
