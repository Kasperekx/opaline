use crate::{
    database::{
        models::{ConnectionConfig, ConnectionInfo},
        postgres,
    },
    state::AppState,
};

#[tauri::command]
pub(crate) async fn connect_postgres(
    input: ConnectionConfig,
    state: tauri::State<'_, AppState>,
) -> Result<ConnectionInfo, String> {
    let (client, info) = postgres::connect(&input).await?;
    state.set_session(client, info.clone()).await;
    Ok(info)
}

#[tauri::command]
pub(crate) async fn disconnect_postgres(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.clear_session().await;
    Ok(())
}

#[tauri::command]
pub(crate) async fn connection_info(
    state: tauri::State<'_, AppState>,
) -> Result<Option<ConnectionInfo>, String> {
    Ok(state.connection_info().await)
}
