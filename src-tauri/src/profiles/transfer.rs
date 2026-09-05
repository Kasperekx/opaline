use super::models::{ConnectionProfile, ConnectionSettings, Environment};
use crate::database::models::SslMode;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ProfileTransfer {
    pub version: u32,
    pub profiles: Vec<PortableProfile>,
}

// An explicit allowlist: no identities, vault references, passwords or machine-local CA paths.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PortableProfile {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub ssl_mode: SslMode,
    pub environment: Environment,
    pub read_only: bool,
    pub requires_ca: bool,
}
impl PortableProfile {
    pub fn from_profile(profile: &ConnectionProfile) -> Self {
        let s = &profile.settings;
        Self {
            name: s.name.clone(),
            host: s.host.clone(),
            port: s.port,
            database: s.database.clone(),
            username: s.username.clone(),
            ssl_mode: s.ssl_mode,
            environment: s.environment.clone(),
            read_only: s.read_only,
            requires_ca: profile.requires_ca || s.ca_path.is_some(),
        }
    }
    pub fn settings(&self) -> ConnectionSettings {
        ConnectionSettings {
            name: self.name.clone(),
            host: self.host.clone(),
            port: self.port,
            database: self.database.clone(),
            username: self.username.clone(),
            ssl_mode: self.ssl_mode,
            environment: self.environment.clone(),
            read_only: self.read_only,
            ca_path: None,
        }
    }
}
impl ProfileTransfer {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 || self.profiles.is_empty() || self.profiles.len() > 200 {
            return Err(
                "Unsupported profile transfer. Expected version 1 and 1–200 profiles.".into(),
            );
        }
        for profile in &self.profiles {
            profile.settings().validate()?;
            if profile.requires_ca && profile.ssl_mode != SslMode::Require {
                return Err("A required CA must use verified TLS.".into());
            }
        }
        Ok(())
    }
}
