use super::{
    models::{DumpFormat, ToolInfo},
    BackupState, PgTools, PreparedFile, PreparedRestore, RestorePreviewEntry, MAX_RESTORE_PREVIEWS,
};
use std::{path::PathBuf, sync::Arc};
use tokio::sync::oneshot;

fn preview(state: &BackupState, session_id: &str) -> RestorePreviewEntry {
    RestorePreviewEntry {
        restore: PreparedRestore {
            session_id: session_id.into(),
            tools: PgTools {
                info: ToolInfo {
                    id: "test-tools".into(),
                    directory: "unused".into(),
                    version: "17.11".into(),
                    major: 17,
                    source: "custom".into(),
                },
                dump: PathBuf::new(),
                restore: PathBuf::new(),
                psql: PathBuf::new(),
            },
            file: PreparedFile {
                file: tempfile::NamedTempFile::new().unwrap(),
                format: DumpFormat::Custom,
                bytes: 0,
                digest: String::new(),
                text_preview: String::new(),
            },
        },
        slot: state.reserve_restore_preview().unwrap(),
    }
}

#[tokio::test]
async fn in_flight_and_prepared_restores_share_the_four_slot_limit() {
    let state = BackupState::default();
    let first = preview(&state, "first-session");
    let first_path = first.restore.file.file.path().to_owned();
    let second = preview(&state, "second-session");
    {
        let mut prepared = state.prepared.lock().await;
        prepared.insert("first".into(), first);
        prepared.insert("second".into(), second);
    }
    let in_flight = [
        state.reserve_restore_preview().unwrap(),
        state.reserve_restore_preview().unwrap(),
    ];
    assert!(state.reserve_restore_preview().is_err());
    // In-flight preparation owns a permit, not the preview map mutex.
    assert!(state.prepared.try_lock().is_ok());

    state.release_restore_preview("first").await;
    assert!(!first_path.exists());
    let replacement = state.reserve_restore_preview().unwrap();
    assert!(state.reserve_restore_preview().is_err());
    state.release_restore_preview("first").await;
    assert!(state.reserve_restore_preview().is_err());

    drop(replacement);
    drop(in_flight);
    state.release_restore_preview("second").await;
    assert_eq!(
        state.preparation_slots.available_permits(),
        MAX_RESTORE_PREVIEWS
    );
}

#[tokio::test]
async fn consuming_a_preview_keeps_its_file_and_releases_only_its_slot() {
    let state = BackupState::default();
    let entry = preview(&state, "target-session");
    let path = entry.restore.file.file.path().to_owned();
    state.prepared.lock().await.insert("preview".into(), entry);

    assert!(state
        .take_restore_preview("preview", "other-session")
        .await
        .is_err());
    assert!(state
        .take_restore_preview("missing", "target-session")
        .await
        .is_err());
    assert_eq!(
        state.preparation_slots.available_permits(),
        MAX_RESTORE_PREVIEWS - 1
    );
    assert!(path.exists());

    let prepared = state
        .take_restore_preview("preview", "target-session")
        .await
        .unwrap();
    assert_eq!(
        state.preparation_slots.available_permits(),
        MAX_RESTORE_PREVIEWS
    );
    assert!(state.prepared.lock().await.is_empty());
    assert!(path.exists());
    assert!(state
        .take_restore_preview("preview", "target-session")
        .await
        .is_err());
    drop(prepared);
    assert!(!path.exists());
}

#[test]
fn failed_preparation_releases_its_reserved_slot() {
    let state = BackupState::default();
    let failed = || -> Result<(), String> {
        let _slot = state.reserve_restore_preview()?;
        Err("Archive inspection failed.".into())
    };
    assert!(failed().is_err());
    assert_eq!(
        state.preparation_slots.available_permits(),
        MAX_RESTORE_PREVIEWS
    );
}

#[tokio::test]
async fn cancelled_preparation_releases_its_reserved_slot() {
    let state = Arc::new(BackupState::default());
    let pending_state = state.clone();
    let (started, waiting) = oneshot::channel();
    let preparation = tokio::spawn(async move {
        let _slot = pending_state.reserve_restore_preview().unwrap();
        started.send(()).unwrap();
        std::future::pending::<()>().await;
    });
    waiting.await.unwrap();
    assert_eq!(
        state.preparation_slots.available_permits(),
        MAX_RESTORE_PREVIEWS - 1
    );
    assert!(state.prepared.try_lock().is_ok());

    preparation.abort();
    assert!(preparation.await.unwrap_err().is_cancelled());
    assert_eq!(
        state.preparation_slots.available_permits(),
        MAX_RESTORE_PREVIEWS
    );
}
