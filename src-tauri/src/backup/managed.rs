//! Offline, app-owned clients. No PATH discovery, runtime download or system installation.
use super::tools::PgTools;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::{Component, Path, PathBuf},
};
use tauri::Manager;

const EMBEDDED: &str = include_str!(concat!(env!("OUT_DIR"), "/postgres-manifest.json"));
#[derive(Deserialize)]
struct Manifest {
    version: u32,
    target: String,
    releases: Vec<Release>,
}
#[derive(Deserialize)]
struct Release {
    major: u32,
    version: String,
    files: Vec<BundledFile>,
}
#[derive(Deserialize)]
struct BundledFile {
    path: String,
    sha256: String,
}

fn verify(root: &Path, release: &Release) -> Result<(), String> {
    if release.files.is_empty() || release.files.len() > 5000 {
        return Err("Invalid backup component inventory.".into());
    }
    let canonical = root.canonicalize().map_err(|_| {
        "Opaline’s backup component is missing. Reinstall the current Opaline build."
    })?;
    for file in &release.files {
        if !Path::new(&file.path)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
        {
            return Err("Invalid backup component path.".into());
        }
        let path = root.join(&file.path);
        let resolved = path.canonicalize().map_err(|_| {
            "Opaline’s backup component is incomplete. Reinstall the current Opaline build."
        })?;
        if !resolved.starts_with(&canonical)
            || std::fs::symlink_metadata(&path)
                .map_err(|_| "Cannot inspect backup component.")?
                .file_type()
                .is_symlink()
        {
            return Err("Invalid backup component location.".into());
        }
        let mut input = std::fs::File::open(path).map_err(|_| "Cannot open backup component.")?;
        if !input
            .metadata()
            .map_err(|_| "Cannot inspect backup component.")?
            .is_file()
        {
            return Err("Invalid backup component file.".into());
        }
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 65536];
        let mut total = 0u64;
        loop {
            let count = input
                .read(&mut buffer)
                .map_err(|_| "Cannot verify backup component.")?;
            if count == 0 {
                break;
            }
            total += count as u64;
            if total > 256 * 1024 * 1024 {
                return Err("Invalid backup component size.".into());
            }
            hash.update(&buffer[..count]);
        }
        if format!("{:x}", hash.finalize()) != file.sha256 {
            return Err("Opaline’s backup component failed its integrity check. Reinstall the current Opaline build; no database operation was started.".into());
        }
    }
    let suffix = std::env::consts::EXE_SUFFIX;
    for tool in ["pg_dump", "pg_restore", "psql"] {
        if !release
            .files
            .iter()
            .any(|file| file.path == format!("bin/{tool}{suffix}"))
        {
            return Err("Backup component is missing a client executable.".into());
        }
    }
    Ok(())
}

pub(crate) async fn from_root(root: PathBuf, major: u32) -> Result<PgTools, String> {
    let manifest: Manifest =
        serde_json::from_str(EMBEDDED).map_err(|_| "Invalid embedded backup manifest.")?;
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => other,
    };
    if manifest.version != 1 || manifest.target != format!("{platform}-{arch}") {
        return Err(
            "This Opaline build does not include backup components for this platform.".into(),
        );
    }
    let release = manifest.releases.into_iter().find(|release| release.major == major).ok_or_else(|| format!("This Opaline build supports automatic backups for PostgreSQL 14–18, not {major}. No database change was made."))?;
    let directory = root.join(major.to_string());
    let expected = release.version.clone();
    let checked = directory.clone();
    tokio::task::spawn_blocking(move || verify(&checked, &release))
        .await
        .map_err(|_| "Cannot verify backup component.")??;
    let mut tools = PgTools::detect(&directory.join("bin")).await?;
    if tools.info.version != expected {
        return Err("Backup component version does not match this Opaline build.".into());
    }
    tools.info.source = "bundled".into();
    Ok(tools)
}
pub(crate) async fn resolve(app: &tauri::AppHandle, major: u32) -> Result<PgTools, String> {
    #[cfg(debug_assertions)]
    let root = {
        let packaged = app
            .path()
            .resource_dir()
            .map_err(|_| "Cannot find app resources.")?
            .join("postgres");
        if packaged.join(major.to_string()).is_dir() {
            packaged
        } else {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/postgres")
        }
    };
    #[cfg(not(debug_assertions))]
    let root = app
        .path()
        .resource_dir()
        .map_err(|_| "Cannot find app resources.")?
        .join("postgres");
    from_root(root, major).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn integrity_rejects_tampering_and_parent_paths_before_execution() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("bin")).unwrap();
        let name = format!("bin/pg_dump{}", std::env::consts::EXE_SUFFIX);
        std::fs::write(dir.path().join(&name), b"original").unwrap();
        let release = Release {
            major: 17,
            version: "17.11".into(),
            files: vec![BundledFile {
                path: name,
                sha256: format!("{:x}", Sha256::digest(b"other content")),
            }],
        };
        assert!(verify(dir.path(), &release)
            .unwrap_err()
            .contains("integrity"));
        let release = Release {
            major: 17,
            version: "17.11".into(),
            files: vec![BundledFile {
                path: "../escape".into(),
                sha256: String::new(),
            }],
        };
        assert!(verify(dir.path(), &release).unwrap_err().contains("path"));
    }
}
