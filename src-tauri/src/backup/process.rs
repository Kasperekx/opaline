use super::{models::JobProgress, tools::command};
use crate::database::models::{ConnectionConfig, SslMode};
use base64::Engine;
use std::{
    io::Write,
    path::Path,
    process::Stdio,
    time::{Duration, Instant},
};
use tokio::{io::AsyncReadExt, process::Command, sync::watch};

pub(crate) struct ProcessCredentials {
    pub application_name: String,
    read_only: bool,
    file: tempfile::NamedTempFile,
    pub conninfo: String,
    _trust: Option<tempfile::NamedTempFile>,
    directory: tempfile::TempDir,
}
fn escaped_pass(value: &str) -> String {
    value.replace('\\', "\\\\").replace(':', "\\:")
}
fn connvalue(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
}
impl ProcessCredentials {
    pub fn create(config: &ConnectionConfig, encrypted_session: bool) -> Result<Self, String> {
        if [
            &config.host,
            &config.database,
            &config.username,
            &config.password,
        ]
        .iter()
        .any(|s| s.contains(['\n', '\r', '\0']))
        {
            return Err(
                "PostgreSQL command-line credentials cannot contain NUL or line breaks.".into(),
            );
        }
        if config.host.contains([',', '/', '\\']) || config.host.chars().any(char::is_whitespace) {
            return Err("Backup / restore requires a single TCP host without whitespace.".into());
        }
        let directory =
            tempfile::tempdir().map_err(|_| "Cannot create a private job directory.")?;
        let mut file = tempfile::NamedTempFile::new_in(directory.path())
            .map_err(|_| "Cannot create a private temporary password file.")?;
        writeln!(
            file,
            "{}:{}:{}:{}:{}",
            escaped_pass(config.host.trim()),
            config.port,
            escaped_pass(config.database.trim()),
            escaped_pass(config.username.trim()),
            escaped_pass(&config.password)
        )
        .map_err(|_| "Cannot prepare temporary credentials.")?;
        file.as_file()
            .sync_all()
            .map_err(|_| "Cannot flush temporary credentials.")?;
        let encrypted = config.ssl_mode == SslMode::Require || encrypted_session;
        let ssl = if encrypted { "verify-full" } else { "disable" };
        let mut trust = None;
        let root = if encrypted && config.ca_path.is_none() {
            let loaded = rustls_native_certs::load_native_certs();
            if loaded.certs.is_empty() {
                return Err("Cannot read system certificate trust. Select a CA in the connection profile before using encrypted backup.".into());
            }
            let mut pem = tempfile::NamedTempFile::new_in(directory.path())
                .map_err(|_| "Cannot prepare system certificate trust.")?;
            for certificate in loaded.certs {
                writeln!(pem, "-----BEGIN CERTIFICATE-----")
                    .map_err(|_| "Cannot prepare system certificate trust.")?;
                let encoded =
                    base64::engine::general_purpose::STANDARD.encode(certificate.as_ref());
                for line in encoded.as_bytes().chunks(64) {
                    pem.write_all(line)
                        .and_then(|_| pem.write_all(b"\n"))
                        .map_err(|_| "Cannot prepare system certificate trust.")?;
                }
                writeln!(pem, "-----END CERTIFICATE-----")
                    .map_err(|_| "Cannot prepare system certificate trust.")?;
            }
            pem.as_file()
                .sync_all()
                .map_err(|_| "Cannot flush system trust.")?;
            let path = pem.path().to_string_lossy().into_owned();
            trust = Some(pem);
            path
        } else {
            config.ca_path.clone().unwrap_or_default()
        };
        // Explicit absent client cert/key/CRL paths work with libpq 14–18 and
        // prevent implicit reads from the user's ~/.postgresql directory.
        let client_files = ["sslcert", "sslkey", "sslcrl"]
            .map(|key| {
                format!(
                    "{key}={}",
                    connvalue(&directory.path().join(key).to_string_lossy())
                )
            })
            .join(" ");
        let application_name = format!("Opaline job {}", uuid::Uuid::new_v4().simple());
        let conninfo = format!("host={} port={} dbname={} user={} sslmode={} {} application_name={} connect_timeout=10 gssencmode=disable {client_files}", connvalue(config.host.trim()), config.port, connvalue(config.database.trim()), connvalue(config.username.trim()), ssl, if encrypted {format!("sslrootcert={}", connvalue(&root))} else {String::new()}, connvalue(&application_name));
        std::fs::write(directory.path().join("openssl.cnf"), b"")
            .map_err(|_| "Cannot isolate TLS client configuration.")?;
        Ok(Self {
            application_name,
            file,
            conninfo,
            read_only: config.read_only,
            _trust: trust,
            directory,
        })
    }
    pub fn command(&self, executable: &Path) -> Command {
        let mut command = command(executable);
        command.env("OPENSSL_CONF", self.directory.path().join("openssl.cnf"));
        command.env("PGPASSFILE", self.file.path()).env(
            "PGOPTIONS",
            if self.read_only {
                "-c statement_timeout=0 -c lock_timeout=10000 -c default_transaction_read_only=on"
            } else {
                "-c statement_timeout=0 -c lock_timeout=10000"
            },
        );
        // HOME is deliberately not inherited: no ~/.pg_service.conf, ~/.psqlrc or user client keys.
        command
            .arg("--no-password")
            .arg("--dbname")
            .arg(&self.conninfo);
        command
    }
}

fn diagnostic(bytes: &[u8]) -> &'static str {
    let text = String::from_utf8_lossy(bytes).to_lowercase();
    if text.contains("password authentication") || text.contains("no password supplied") {
        "Authentication failed. Check the password or system credential store."
    } else if text.contains("certificate") || text.contains("ssl error") {
        "TLS verification failed. Check the host, trusted CA and the PostgreSQL client trust store."
    } else if text.contains("no space left") {
        "Not enough disk space."
    } else if text.contains("permission denied") {
        "Permission denied. Check database privileges and file permissions."
    } else if text.contains("does not exist") {
        "A required database object, role or extension is missing. Review the dump requirements."
    } else {
        "The PostgreSQL tool reported an error. Check version compatibility, dependencies, privileges and the trusted dump content. Raw server output is not logged because it may contain data or secrets."
    }
}

pub(crate) async fn run(
    mut command: Command,
    mut cancel: watch::Receiver<bool>,
    progress: impl Fn(JobProgress),
    stage: &str,
    cancel_server: impl std::future::Future<Output = ()>,
) -> Result<(), String> {
    if *cancel.borrow() {
        return Err("Operation cancelled before starting.".into());
    }
    let started = Instant::now();
    let mut child = command
        .spawn()
        .map_err(|_| "Cannot start PostgreSQL client. Check its installation and permissions.")?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or("Cannot capture client diagnostics.")?;
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    let mut interrupted = false;
    let result = {
        let monitor = async {
            let drain = async {
                let mut diagnostic = Vec::new();
                let mut buffer = [0u8; 8192];
                loop {
                    let size = stderr.read(&mut buffer).await?;
                    if size == 0 {
                        break;
                    }
                    let keep = size.min(65536usize.saturating_sub(diagnostic.len()));
                    diagnostic.extend_from_slice(&buffer[..keep]);
                }
                Ok::<_, std::io::Error>(diagnostic)
            };
            let (status, output) = tokio::join!(child.wait(), drain);
            let status = status.map_err(|_| "Cannot confirm the PostgreSQL client outcome.")?;
            let output = output.map_err(|_| "Cannot read PostgreSQL client diagnostics.")?;
            if !status.success() {
                return Err(format!(
                    "{} Exit code: {}.",
                    diagnostic(&output),
                    status
                        .code()
                        .map(|c| c.to_string())
                        .unwrap_or_else(|| "terminated".into())
                ));
            }
            Ok(())
        };
        tokio::pin!(monitor);
        loop {
            tokio::select! {
                result = &mut monitor => break result,
                _ = cancel.changed() => {interrupted = true; break Err("Operation cancelled. The client is terminated; a server rollback or final commit is not confirmed. Inspect the target before retrying.".into());},
                _ = interval.tick() => {
                    progress(JobProgress {stage: stage.into(), elapsed_ms: started.elapsed().as_millis() as u64, message: "PostgreSQL client is running. Progress percentage is not available.".into()});
                    if started.elapsed() > Duration::from_secs(3600) {interrupted = true; break Err("Operation exceeded the 1 hour safety timeout. The client is terminated; inspect the target before retrying.".into());}
                }
            }
        }
    };
    if interrupted {
        let _ = tokio::time::timeout(Duration::from_secs(5), cancel_server).await;
    }
    if result.is_err() {
        let _ = child.kill().await;
    }
    result
}

pub(crate) async fn bounded_output(mut command: Command) -> Result<Vec<u8>, String> {
    command.stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| "Cannot start PostgreSQL client.")?;
    let mut output = child
        .stdout
        .take()
        .ok_or("Cannot read PostgreSQL client output.")?
        .take(512 * 1024 + 1);
    let mut bytes = Vec::new();
    tokio::time::timeout(Duration::from_secs(30), output.read_to_end(&mut bytes))
        .await
        .map_err(|_| "Dump inspection timed out.")?
        .map_err(|_| "Cannot read dump inspection.")?;
    if bytes.len() > 512 * 1024 {
        return Err(
            "Dump inspection exceeds 512 KiB. Use PostgreSQL tools directly for this archive."
                .into(),
        );
    }
    if !tokio::time::timeout(Duration::from_secs(5), child.wait())
        .await
        .map_err(|_| "Dump inspection timed out.")?
        .map_err(|_| "Cannot inspect archive.")?
        .success()
    {
        return Err(
            "Cannot inspect this archive. Check its format, integrity and client version.".into(),
        );
    }
    Ok(bytes)
}
