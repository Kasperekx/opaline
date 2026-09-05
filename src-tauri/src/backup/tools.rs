use super::models::ToolInfo;
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::process::Command;

#[derive(Clone)]
pub(crate) struct PgTools {
    pub info: ToolInfo,
    pub dump: PathBuf,
    pub restore: PathBuf,
    pub psql: PathBuf,
}

// Do not inherit libpq/service/psql settings or loader overrides from the parent process.
pub(crate) fn command(path: &Path) -> Command {
    let mut command = Command::new(path);
    command
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    for key in ["SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    command
        .env("LC_ALL", "C")
        .env("PGCONNECT_TIMEOUT", "10")
        .env("PGCLIENTENCODING", "UTF8");
    command
}
pub(crate) fn parse_version(text: &str, tool: &str) -> Result<(u32, u32, String), String> {
    let prefix = format!("{tool} (PostgreSQL) ");
    let version = text
        .strip_prefix(&prefix)
        .and_then(|s| s.split_whitespace().next())
        .ok_or("Not a PostgreSQL client executable.")?;
    let mut parts = version.split('.');
    let major: u32 = parts
        .next()
        .unwrap_or_default()
        .parse()
        .map_err(|_| "Unsupported client version.")?;
    let minor: u32 = parts
        .next()
        .unwrap_or_default()
        .parse()
        .map_err(|_| "Unsupported client version.")?;
    Ok((major, minor, version.into()))
}
impl PgTools {
    pub async fn detect(directory: &Path) -> Result<Self, String> {
        if !directory.is_absolute() {
            return Err("Choose an absolute PostgreSQL bin directory.".into());
        }
        let executable =
            |name: &str| directory.join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
        let mut versions = Vec::new();
        for name in ["pg_dump", "pg_restore", "psql"] {
            let output = tokio::time::timeout(
                Duration::from_secs(5),
                command(&executable(name))
                    .arg("--version")
                    .stdout(Stdio::piped())
                    .output(),
            )
            .await
            .map_err(|_| "Client version check timed out.")?
            .map_err(|_| "This directory must contain pg_dump, pg_restore and psql.")?;
            if !output.status.success() {
                return Err("PostgreSQL client version check failed.".into());
            }
            versions.push(parse_version(
                &String::from_utf8_lossy(&output.stdout),
                name,
            )?);
        }
        if versions.iter().any(|v| v != &versions[0]) {
            return Err("pg_dump, pg_restore and psql must have the same version.".into());
        }
        let (major, minor, version) = versions.remove(0);
        let minimum = match major {
            14 => 24,
            15 => 19,
            16 => 15,
            17 => 11,
            18 => 6,
            _ => {
                return Err("Backup / restore currently supports PostgreSQL clients 14–18.".into())
            }
        };
        if minor < minimum {
            return Err(format!("Update PostgreSQL clients to {major}.{minimum} or newer in this major series before backup / restore. Older client security fixes are required."));
        }
        Ok(Self {
            info: ToolInfo {
                id: uuid::Uuid::new_v4().to_string(),
                directory: directory.to_string_lossy().into(),
                version,
                major,
                source: "custom".into(),
            },
            dump: executable("pg_dump"),
            restore: executable("pg_restore"),
            psql: executable("psql"),
        })
    }
}
