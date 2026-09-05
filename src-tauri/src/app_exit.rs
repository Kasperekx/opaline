use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Default)]
pub(crate) struct ExitState {
    pub allowed: AtomicBool,
    pub ready: AtomicBool,
}

#[tauri::command]
pub(crate) fn enable_exit_guard(state: tauri::State<'_, ExitState>) {
    state.ready.store(true, Ordering::Release);
}

#[tauri::command]
pub(crate) fn exit_application(app: tauri::AppHandle, state: tauri::State<'_, ExitState>) {
    state.allowed.store(true, Ordering::Release);
    app.exit(0);
}
