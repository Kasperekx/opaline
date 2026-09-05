use crate::database::models::{ConnectionConfig, ConnectionInfo, SslMode};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Environment {
    Local,
    Staging,
    Production,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProductWorkspace {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectionSettings {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub ssl_mode: SslMode,
    pub ca_path: Option<String>,
    pub environment: Environment,
    pub read_only: bool,
}

impl ConnectionSettings {
    pub fn validate(&self) -> Result<(), String> {
        for value in [&self.name, &self.host, &self.database, &self.username] {
            if value.trim().is_empty() || value.len() > 255 || value.contains('\0') {
                return Err(
                    "Name, host, database and username must contain 1–255 characters.".into(),
                );
            }
        }
        if self.port == 0 {
            return Err("Port must be between 1 and 65535.".into());
        }
        if self.ca_path.is_some() && self.ssl_mode != SslMode::Require {
            return Err(
                "A custom CA requires TLS: Require. Unencrypted fallback is not allowed.".into(),
            );
        }
        Ok(())
    }

    // A saved secret must never be silently forwarded to a different endpoint or trust policy.
    pub fn same_destination(&self, other: &Self) -> bool {
        self.host == other.host
            && self.port == other.port
            && self.database == other.database
            && self.username == other.username
            && self.ssl_mode == other.ssl_mode
            && self.ca_path == other.ca_path
    }

    pub fn config(&self, password: String) -> ConnectionConfig {
        ConnectionConfig {
            name: self.name.clone(),
            host: self.host.clone(),
            port: self.port,
            database: self.database.clone(),
            username: self.username.clone(),
            password,
            ssl_mode: self.ssl_mode,
            ca_path: self.ca_path.clone(),
            read_only: self.read_only,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectionProfile {
    #[serde(default)]
    pub requires_ca: bool,
    pub id: String,
    pub workspace_id: String,
    #[serde(flatten)]
    pub settings: ConnectionSettings,
    pub credential_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectionCatalog {
    pub version: u32,
    pub workspaces: Vec<ProductWorkspace>,
    pub profiles: Vec<ConnectionProfile>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub retired_credential_ids: Vec<String>,
    #[serde(skip_deserializing, skip_serializing_if = "Option::is_none")]
    pub credential_warning: Option<String>,
}

impl Default for ConnectionCatalog {
    fn default() -> Self {
        Self {
            version: 1,
            workspaces: vec![],
            profiles: vec![],
            retired_credential_ids: vec![],
            credential_warning: None,
        }
    }
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PasswordAction {
    Keep,
    Store,
    Forget,
}

// Deliberately not Debug or Serialize: passwords are IPC input only.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfileInput {
    pub id: Option<String>,
    pub workspace_id: String,
    #[serde(flatten)]
    pub settings: ConnectionSettings,
    pub password: Option<String>,
    pub password_action: PasswordAction,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SessionInfo {
    pub id: String,
    pub profile_id: String,
    pub workspace_id: String,
    pub environment: Environment,
    pub read_only: bool,
    #[serde(flatten)]
    pub connection: ConnectionInfo,
}
