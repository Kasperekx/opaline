use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "macos")]
pub(crate) mod macos;

#[derive(Default)]
pub(crate) struct ExitState {
    pub allowed: AtomicBool,
    pub ready: AtomicBool,
}

impl ExitState {
    pub(crate) fn needs_confirmation(&self) -> bool {
        self.ready.load(Ordering::Acquire) && !self.allowed.load(Ordering::Acquire)
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guarded_exit_requires_frontend_approval_after_initialization() {
        let state = ExitState::default();
        assert!(!state.needs_confirmation());
        state.ready.store(true, Ordering::Release);
        assert!(state.needs_confirmation());
        // Repeated quit requests do not grant permission.
        assert!(state.needs_confirmation());
        state.allowed.store(true, Ordering::Release);
        assert!(!state.needs_confirmation());
    }
}
