use super::{
    credentials::{CredentialStore, NativeCredentials},
    models::*,
};
use std::{io::Write, path::PathBuf, sync::Arc};
use tokio::sync::Mutex;
use uuid::Uuid;

pub(crate) struct ProfileStore {
    path: PathBuf,
    gate: Mutex<()>,
    credentials: Arc<dyn CredentialStore>,
}

impl ProfileStore {
    #[cfg(test)]
    pub(crate) fn with_credentials(path: PathBuf, credentials: Arc<dyn CredentialStore>) -> Self {
        Self {
            path,
            gate: Mutex::new(()),
            credentials,
        }
    }
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            gate: Mutex::new(()),
            credentials: Arc::new(NativeCredentials),
        }
    }

    // Disk and OS vault APIs may block (including an OS unlock prompt). Never run on the UI executor.
    async fn access<T: Send + 'static>(
        &self,
        action: impl FnOnce(PathBuf, Arc<dyn CredentialStore>) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let _guard = self.gate.lock().await;
        let path = self.path.clone();
        let credentials = self.credentials.clone();
        tokio::task::spawn_blocking(move || action(path, credentials))
            .await
            .map_err(|_| "Could not complete the local profile operation.".to_string())?
    }

    pub async fn catalog(&self) -> Result<ConnectionCatalog, String> {
        self.access(|path, credentials| {
            let mut catalog = read_catalog(&path)?;
            clean_retired_credentials(&path, &*credentials, &mut catalog);
            Ok(catalog)
        })
        .await
    }

    pub async fn workspace(
        &self,
        id: Option<String>,
        name: String,
    ) -> Result<ConnectionCatalog, String> {
        self.access(move |path, _| {
            let name = name.trim();
            if name.is_empty() || name.len() > 80 {
                return Err("Workspace name must contain 1–80 characters.".into());
            }
            let mut catalog = read_catalog(&path)?;
            if catalog
                .workspaces
                .iter()
                .any(|w| w.name.eq_ignore_ascii_case(name) && Some(&w.id) != id.as_ref())
            {
                return Err("A workspace with this name already exists.".into());
            }
            if let Some(id) = id {
                catalog
                    .workspaces
                    .iter_mut()
                    .find(|w| w.id == id)
                    .ok_or("Workspace no longer exists.")?
                    .name = name.into();
            } else {
                catalog.workspaces.push(ProductWorkspace {
                    id: Uuid::new_v4().to_string(),
                    name: name.into(),
                });
            }
            write_catalog(&path, &catalog)?;
            Ok(catalog)
        })
        .await
    }

    pub async fn config(
        &self,
        input: &ProfileInput,
    ) -> Result<crate::database::models::ConnectionConfig, String> {
        input.settings.validate()?;
        let id = input.id.clone();
        let settings = input.settings.clone();
        let password = input.password.clone();
        let action = input.password_action;
        let workspace_id = input.workspace_id.clone();
        self.access(move |path, credentials| {
            let catalog = read_catalog(&path)?;
            if !catalog.workspaces.iter().any(|w| w.id == workspace_id) {
                return Err("Choose an existing workspace.".into());
            }
            let previous = id.as_ref().map(|id| {
                catalog.profiles.iter().find(|p| &p.id == id).ok_or("Profile no longer exists.")
            }).transpose()?;
            if previous.is_some_and(|p| p.requires_ca) && settings.ca_path.is_none() {
                return Err("This imported profile requires its custom CA. Select the CA file before testing or connecting.".into());
            }
            if (password.is_none() || action == PasswordAction::Keep)
                && previous.is_some_and(|p| p.credential_id.is_some() && !p.settings.same_destination(&settings)) {
                return Err("The destination or TLS settings changed. Enter the password again before testing and saving.".into());
            }
            if action == PasswordAction::Keep && password.is_some() {
                return Err("Choose Store or Forget when supplying a replacement password.".into());
            }
            if action == PasswordAction::Store && password.is_none() {
                return Err("Enter a password to store.".into());
            }
            let password = match password {
                Some(value) => value,
                None => match previous.and_then(|p| p.credential_id.as_ref()) {
                    Some(id) => credentials.get(id)?,
                    _ => String::new(),
                },
            };
            Ok(settings.config(password))
        }).await
    }

    // Only called after a successful connection test in the command layer.
    pub async fn save(&self, input: ProfileInput) -> Result<ConnectionCatalog, String> {
        input.settings.validate()?;
        self.access(move |path, credentials| {
            let mut catalog = read_catalog(&path)?;
            if !catalog
                .workspaces
                .iter()
                .any(|w| w.id == input.workspace_id)
            {
                return Err("Workspace no longer exists.".into());
            }
            let previous = input
                .id
                .as_ref()
                .map(|id| {
                    catalog
                        .profiles
                        .iter()
                        .find(|p| &p.id == id)
                        .cloned()
                        .ok_or("Profile no longer exists.")
                })
                .transpose()?;
            let old_credential = previous.as_ref().and_then(|p| p.credential_id.clone());
            if input.password_action == PasswordAction::Keep
                && previous.as_ref().is_some_and(|p| {
                    p.credential_id.is_some() && !p.settings.same_destination(&input.settings)
                })
            {
                return Err("Destination changed. Enter the password again.".into());
            }
            let credential_id = match input.password_action {
                PasswordAction::Keep => old_credential.clone(),
                PasswordAction::Forget => None,
                PasswordAction::Store => {
                    let id = Uuid::new_v4().to_string();
                    credentials.set(
                        &id,
                        input
                            .password
                            .as_deref()
                            .ok_or("Enter a password to store.")?,
                    )?;
                    Some(id)
                }
            };
            let profile = ConnectionProfile {
                requires_ca: false,
                id: input.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
                workspace_id: input.workspace_id,
                settings: input.settings,
                credential_id: credential_id.clone(),
            };
            catalog.profiles.retain(|p| p.id != profile.id);
            catalog.profiles.push(profile);
            if old_credential != credential_id {
                if let Some(id) = &old_credential {
                    catalog.retired_credential_ids.push(id.clone());
                }
            }
            if let Err(error) = write_catalog(&path, &catalog) {
                if credential_id != old_credential {
                    if let Some(id) = &credential_id {
                        let _ = credentials.delete(id);
                    }
                }
                return Err(error);
            }
            clean_retired_credentials(&path, &*credentials, &mut catalog);
            Ok(catalog)
        })
        .await
    }

    pub async fn delete(&self, id: String) -> Result<ConnectionCatalog, String> {
        self.access(move |path, credentials| {
            let mut catalog = read_catalog(&path)?;
            let profile = catalog
                .profiles
                .iter()
                .find(|p| p.id == id)
                .ok_or("Profile no longer exists.")?;
            // Persist retirement with profile removal; retry after a vault outage.
            if let Some(id) = &profile.credential_id {
                catalog.retired_credential_ids.push(id.clone());
            }
            catalog.profiles.retain(|p| p.id != id);
            write_catalog(&path, &catalog)?;
            clean_retired_credentials(&path, &*credentials, &mut catalog);
            Ok(catalog)
        })
        .await
    }

    pub async fn connect_config(
        &self,
        id: String,
        password: Option<String>,
    ) -> Result<(ConnectionProfile, crate::database::models::ConnectionConfig), String> {
        self.access(move |path, credentials| {
            let profile = read_catalog(&path)?
                .profiles
                .into_iter()
                .find(|p| p.id == id)
                .ok_or("Profile no longer exists.")?;
            profile.settings.validate()?;
            if profile.requires_ca && profile.settings.ca_path.is_none() { return Err("This imported profile requires a custom CA. Edit the profile and select its trusted CA file first.".into()); }
            let password = match password {
                Some(value) => value,
                None => match &profile.credential_id {
                    Some(id) => credentials.get(id)?,
                    None => String::new(),
                },
            };
            let config = profile.settings.config(password);
            Ok((profile, config))
        })
        .await
    }

    pub async fn move_profile(
        &self,
        id: String,
        workspace_id: String,
    ) -> Result<ConnectionCatalog, String> {
        self.access(move |path, _| {
            let mut catalog = read_catalog(&path)?;
            if !catalog.workspaces.iter().any(|w| w.id == workspace_id) {
                return Err("Destination workspace no longer exists.".into());
            }
            catalog
                .profiles
                .iter_mut()
                .find(|p| p.id == id)
                .ok_or("Profile no longer exists.")?
                .workspace_id = workspace_id;
            write_catalog(&path, &catalog)?;
            Ok(catalog)
        })
        .await
    }

    pub async fn remove_workspace(
        &self,
        id: String,
        destination: Option<String>,
    ) -> Result<ConnectionCatalog, String> {
        self.access(move |path, _| {
            let mut catalog = read_catalog(&path)?;
            if !catalog.workspaces.iter().any(|w| w.id == id) {
                return Err("Workspace no longer exists.".into());
            }
            if let Some(target) = &destination {
                if target == &id || !catalog.workspaces.iter().any(|w| &w.id == target) {
                    return Err("Choose another existing workspace.".into());
                }
            } else if catalog.profiles.iter().any(|p| p.workspace_id == id) {
                return Err("Move the profiles to another workspace before removal.".into());
            }
            for profile in &mut catalog.profiles {
                if profile.workspace_id == id {
                    profile.workspace_id = destination
                        .clone()
                        .ok_or("Choose a destination workspace.")?;
                }
            }
            catalog.workspaces.retain(|w| w.id != id);
            write_catalog(&path, &catalog)?;
            Ok(catalog)
        })
        .await
    }

    pub async fn import_profiles(
        &self,
        workspace_id: String,
        transfer: super::transfer::ProfileTransfer,
    ) -> Result<ConnectionCatalog, String> {
        transfer.validate()?;
        self.access(move |path, _| {
            let mut catalog = read_catalog(&path)?;
            if !catalog.workspaces.iter().any(|w| w.id == workspace_id) {
                return Err("Choose an existing workspace.".into());
            }
            if catalog.profiles.len() + transfer.profiles.len() > 500 {
                return Err("Limit: 500 profiles per device.".into());
            }
            for item in transfer.profiles {
                let mut settings = item.settings();
                let base = settings.name.clone();
                let mut suffix = 1;
                while catalog.profiles.iter().any(|p| {
                    p.workspace_id == workspace_id
                        && p.settings.name.eq_ignore_ascii_case(&settings.name)
                }) {
                    suffix += 1;
                    settings.name = format!(
                        "{} (import {})",
                        base.chars().take(100).collect::<String>(),
                        suffix
                    );
                }
                catalog.profiles.push(ConnectionProfile {
                    id: Uuid::new_v4().to_string(),
                    workspace_id: workspace_id.clone(),
                    settings,
                    credential_id: None,
                    requires_ca: item.requires_ca,
                });
            }
            write_catalog(&path, &catalog)?;
            Ok(catalog)
        })
        .await
    }
}

fn read_catalog(path: &PathBuf) -> Result<ConnectionCatalog, String> {
    match std::fs::metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ConnectionCatalog::default())
        }
        Ok(meta) if meta.len() > 4 * 1024 * 1024 => {
            return Err("Profile configuration is too large. It has not been changed.".into())
        }
        Err(_) => return Err("Cannot read the local profile configuration.".into()),
        _ => {}
    }
    let bytes = std::fs::read(path).map_err(|_| "Cannot read the local profile configuration.")?;
    let catalog: ConnectionCatalog = serde_json::from_slice(&bytes).map_err(|_| {
        "Profile configuration is damaged. Restore it from a backup; it has not been overwritten."
    })?;
    if catalog.version != 1 {
        return Err("Unsupported profile configuration version. It has not been changed.".into());
    }
    let workspace_ids: std::collections::HashSet<_> =
        catalog.workspaces.iter().map(|w| &w.id).collect();
    let profile_ids: std::collections::HashSet<_> =
        catalog.profiles.iter().map(|p| &p.id).collect();
    if workspace_ids.len() != catalog.workspaces.len()
        || profile_ids.len() != catalog.profiles.len()
        || catalog
            .profiles
            .iter()
            .any(|p| !workspace_ids.contains(&p.workspace_id))
        || catalog.retired_credential_ids.iter().any(|id| {
            catalog
                .profiles
                .iter()
                .any(|p| p.credential_id.as_ref() == Some(id))
        })
    {
        return Err(
            "Profile configuration has inconsistent references. It has not been changed.".into(),
        );
    }
    Ok(catalog)
}

fn clean_retired_credentials(
    path: &PathBuf,
    credentials: &dyn CredentialStore,
    catalog: &mut ConnectionCatalog,
) {
    if catalog.retired_credential_ids.is_empty() {
        return;
    }
    catalog
        .retired_credential_ids
        .retain(|id| credentials.delete(id).is_err());
    catalog.credential_warning = None;
    // Removal is idempotent; a failed cleanup write is safe to retry on next load.
    let persisted = write_catalog(path, catalog).is_ok();
    if !persisted || !catalog.retired_credential_ids.is_empty() {
        catalog.credential_warning = Some("Some retired passwords still need cleanup. Unlock the system credential store and click Retry. Profiles have been saved; no passwords were written to configuration.".into());
    }
}

fn write_catalog(path: &PathBuf, catalog: &ConnectionCatalog) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid profile configuration path.")?;
    std::fs::create_dir_all(parent).map_err(|_| "Cannot create the configuration directory.")?;
    let mut file = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "Cannot create the configuration file.")?;
    serde_json::to_writer_pretty(&mut file, catalog).map_err(|_| "Cannot serialize profiles.")?;
    file.flush()
        .and_then(|_| file.as_file().sync_all())
        .map_err(|_| "Cannot flush profiles to disk.")?;
    file.persist(path)
        .map_err(|_| "Cannot atomically save profiles. The previous configuration is unchanged.")?;
    Ok(())
}
