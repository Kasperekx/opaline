use super::{credentials::CredentialStore, models::*, store::ProfileStore};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[derive(Default)]
struct MemoryCredentials(Mutex<HashMap<String, String>>);
impl CredentialStore for MemoryCredentials {
    fn get(&self, id: &str) -> Result<String, String> {
        self.0
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or("Missing test credential".into())
    }
    fn set(&self, id: &str, password: &str) -> Result<(), String> {
        self.0.lock().unwrap().insert(id.into(), password.into());
        Ok(())
    }
    fn delete(&self, id: &str) -> Result<(), String> {
        self.0.lock().unwrap().remove(id);
        Ok(())
    }
}

#[derive(Default)]
struct UnavailableCredentials;
impl CredentialStore for UnavailableCredentials {
    fn get(&self, _: &str) -> Result<String, String> {
        Err("Test vault locked".into())
    }
    fn set(&self, _: &str, _: &str) -> Result<(), String> {
        Err("Test vault locked".into())
    }
    fn delete(&self, _: &str) -> Result<(), String> {
        Err("Test vault locked".into())
    }
}

#[tokio::test]
async fn locked_vault_does_not_overwrite_profiles_and_retirements_are_retried() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("connections.json");
    let credentials = Arc::new(MemoryCredentials::default());
    let store = ProfileStore::with_credentials(path.clone(), credentials.clone());
    let catalog = store.workspace(None, "MMO".into()).await.unwrap();
    let workspace = catalog.workspaces[0].id.clone();
    let catalog = store.save(input(workspace.clone())).await.unwrap();
    let original = std::fs::read(&path).unwrap();
    let locked = ProfileStore::with_credentials(path.clone(), Arc::new(UnavailableCredentials));
    let mut update = input(workspace);
    update.id = Some(catalog.profiles[0].id.clone());
    assert!(locked.save(update).await.is_err());
    assert_eq!(std::fs::read(&path).unwrap(), original);
    let deleted = locked.delete(catalog.profiles[0].id.clone()).await.unwrap();
    assert!(deleted.profiles.is_empty());
    assert!(deleted.credential_warning.is_some());
    assert_eq!(deleted.retired_credential_ids.len(), 1);
    let cleaned = store.catalog().await.unwrap();
    assert!(cleaned.credential_warning.is_none());
    assert!(cleaned.retired_credential_ids.is_empty());
    assert!(credentials.0.lock().unwrap().is_empty());
}

#[test]
#[ignore = "Creates and removes one disposable OS credential; opt in separately"]
fn native_credential_roundtrip() {
    use super::credentials::NativeCredentials;
    assert_eq!(
        std::env::var("OPALINE_TEST_NATIVE_VAULT").as_deref(),
        Ok("1")
    );
    let id = format!("opaline-disposable-test-{}", uuid::Uuid::new_v4());
    let credentials = NativeCredentials;
    credentials.set(&id, "synthetic-disposable-secret").unwrap();
    let result = credentials.get(&id);
    let deleted = credentials.delete(&id);
    assert_eq!(result.unwrap(), "synthetic-disposable-secret");
    deleted.unwrap();
    assert!(credentials.get(&id).is_err());
}
fn input(workspace_id: String) -> ProfileInput {
    ProfileInput {
        id: None,
        workspace_id,
        settings: ConnectionSettings {
            name: "Local".into(),
            host: "localhost".into(),
            port: 5432,
            database: "postgres".into(),
            username: "postgres".into(),
            ssl_mode: crate::database::models::SslMode::Prefer,
            ca_path: None,
            environment: Environment::Local,
            read_only: false,
        },
        password: Some("test-only-super-secret".into()),
        password_action: PasswordAction::Store,
    }
}

#[tokio::test]
async fn profile_transfer_is_credential_free_and_moves_preserve_identity() {
    use super::transfer::{PortableProfile, ProfileTransfer};
    let directory = tempfile::tempdir().unwrap();
    let credentials = Arc::new(MemoryCredentials::default());
    let store = ProfileStore::with_credentials(
        directory.path().join("connections.json"),
        credentials.clone(),
    );
    let first = store
        .workspace(None, "Source".into())
        .await
        .unwrap()
        .workspaces[0]
        .id
        .clone();
    let catalog = store.workspace(None, "Target".into()).await.unwrap();
    let second = catalog.workspaces[1].id.clone();
    let catalog = store.save(input(first.clone())).await.unwrap();
    let original = &catalog.profiles[0];
    let transfer = ProfileTransfer {
        version: 1,
        profiles: vec![PortableProfile::from_profile(original)],
    };
    let json = serde_json::to_string(&transfer).unwrap();
    assert!(
        !json.contains("credential") && !json.contains("password") && !json.contains(&original.id)
    );
    let imported = store
        .import_profiles(first.clone(), serde_json::from_str(&json).unwrap())
        .await
        .unwrap();
    assert_ne!(imported.profiles[1].id, original.id);
    assert!(imported.profiles[1].credential_id.is_none());
    assert!(imported.profiles[1].settings.name.contains("import"));
    let moved = store
        .move_profile(original.id.clone(), second.clone())
        .await
        .unwrap();
    assert_eq!(moved.profiles[0].id, original.id);
    assert_eq!(moved.profiles[0].credential_id, original.credential_id);
    assert!(moved.profiles[0]
        .settings
        .same_destination(&original.settings));
    assert!(store.remove_workspace(first.clone(), None).await.is_err());
    let removed = store
        .remove_workspace(first, Some(second.clone()))
        .await
        .unwrap();
    assert!(removed.profiles.iter().all(|p| p.workspace_id == second));
    assert_eq!(credentials.0.lock().unwrap().len(), 1);
    let mut malicious: serde_json::Value = serde_json::from_str(&json).unwrap();
    malicious["profiles"][0]["credentialId"] = "foreign-secret".into();
    assert!(serde_json::from_value::<ProfileTransfer>(malicious).is_err());
}

#[tokio::test]
async fn imported_ca_policy_cannot_silently_become_system_trust() {
    use super::transfer::{PortableProfile, ProfileTransfer};
    let directory = tempfile::tempdir().unwrap();
    let store = ProfileStore::with_credentials(
        directory.path().join("connections.json"),
        Arc::new(MemoryCredentials::default()),
    );
    let workspace = store.workspace(None, "CA".into()).await.unwrap().workspaces[0]
        .id
        .clone();
    let catalog = store.save(input(workspace.clone())).await.unwrap();
    let mut profile = PortableProfile::from_profile(&catalog.profiles[0]);
    profile.ssl_mode = crate::database::models::SslMode::Require;
    profile.requires_ca = true;
    let imported = store
        .import_profiles(
            workspace.clone(),
            ProfileTransfer {
                version: 1,
                profiles: vec![profile],
            },
        )
        .await
        .unwrap();
    let profile = &imported.profiles[1];
    assert!(profile.requires_ca && profile.settings.ca_path.is_none());
    assert!(store
        .connect_config(profile.id.clone(), None)
        .await
        .is_err());
    let mut edit = input(workspace);
    edit.id = Some(profile.id.clone());
    edit.settings.ssl_mode = crate::database::models::SslMode::Require;
    assert!(store.config(&edit).await.is_err());
}

#[tokio::test]
async fn profiles_persist_without_passwords_and_credentials_are_separate() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("connections.json");
    let credentials = Arc::new(MemoryCredentials::default());
    let store = ProfileStore::with_credentials(path.clone(), credentials.clone());
    let catalog = store.workspace(None, "MMO".into()).await.unwrap();
    let catalog = store
        .save(input(catalog.workspaces[0].id.clone()))
        .await
        .unwrap();
    let json = std::fs::read_to_string(&path).unwrap();
    assert!(!json.contains("password") && !json.contains("test-only-super-secret"));
    let reloaded = ProfileStore::with_credentials(path, credentials.clone());
    let (profile, config) = reloaded
        .connect_config(catalog.profiles[0].id.clone(), None)
        .await
        .unwrap();
    assert_eq!(config.password, "test-only-super-secret");
    assert_eq!(profile.workspace_id, catalog.workspaces[0].id);
    assert_eq!(reloaded.catalog().await.unwrap().profiles.len(), 1);
    store.delete(profile.id).await.unwrap();
    assert!(credentials.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn saved_password_is_not_forwarded_to_changed_destination() {
    let directory = tempfile::tempdir().unwrap();
    let store = ProfileStore::with_credentials(
        directory.path().join("connections.json"),
        Arc::new(MemoryCredentials::default()),
    );
    let catalog = store.workspace(None, "MMO".into()).await.unwrap();
    let workspace_id = catalog.workspaces[0].id.clone();
    let catalog = store.save(input(workspace_id.clone())).await.unwrap();
    let mut edit = input(workspace_id);
    edit.id = Some(catalog.profiles[0].id.clone());
    edit.password = None;
    edit.password_action = PasswordAction::Keep;
    edit.settings.host = "another-server.example".into();
    assert!(store
        .config(&edit)
        .await
        .err()
        .unwrap()
        .contains("destination"));
    assert!(store.save(edit).await.is_err());
    assert_eq!(
        store.catalog().await.unwrap().profiles[0].settings.host,
        "localhost"
    );
}

#[tokio::test]
async fn corrupt_or_future_configuration_is_never_overwritten() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("connections.json");
    let store = ProfileStore::new(path.clone());
    for value in ["{broken", r#"{"version":99,"workspaces":[],"profiles":[]}"#] {
        std::fs::write(&path, value).unwrap();
        assert!(store.workspace(None, "MMO".into()).await.is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), value);
    }
}

#[tokio::test]
async fn empty_password_and_workspace_rename_are_supported() {
    let directory = tempfile::tempdir().unwrap();
    let store = ProfileStore::with_credentials(
        directory.path().join("connections.json"),
        Arc::new(MemoryCredentials::default()),
    );
    let catalog = store.workspace(None, "MMO".into()).await.unwrap();
    let id = catalog.workspaces[0].id.clone();
    let mut input = input(id.clone());
    input.password = Some(String::new());
    input.password_action = PasswordAction::Forget;
    let saved = store.save(input).await.unwrap();
    let renamed = store
        .workspace(Some(id), "MMO Studio".into())
        .await
        .unwrap();
    assert_eq!(
        renamed.profiles[0].workspace_id,
        saved.profiles[0].workspace_id
    );
    assert!(store
        .connect_config(saved.profiles[0].id.clone(), None)
        .await
        .unwrap()
        .1
        .password
        .is_empty());
}
