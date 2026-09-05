use crate::database::client::DatabaseClient;
use crate::{
    database::models::{QueryErrorKind, QueryExecutionError},
    profiles::models::SessionInfo,
};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tokio::sync::{Mutex, OwnedMutexGuard, OwnedRwLockReadGuard, OwnedRwLockWriteGuard, RwLock};
use tokio_postgres::Client;

pub(crate) struct DatabaseSession {
    pub client: Arc<DatabaseClient>,
    pub info: SessionInfo,
    pub tls: Option<rustls::ClientConfig>,
    gate: Arc<Mutex<()>>,
    cancellation: RwLock<()>,
    running: AtomicBool,
    closed: AtomicBool,
    password: Option<zeroize::Zeroizing<String>>,
}
impl DatabaseSession {
    pub fn invalidate(&self) {
        self.closed.store(true, Ordering::Release);
        self.client.abort();
    }
    pub fn password(&self) -> Option<&str> {
        self.password.as_ref().map(|password| password.as_str())
    }
}

#[derive(Default)]
pub(crate) struct AppState {
    maintenance: Arc<RwLock<()>>,
    sessions: RwLock<HashMap<String, Arc<DatabaseSession>>>,
    pub profile_operations: Mutex<()>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SessionStatus {
    id: String,
    status: &'static str,
}

pub(crate) struct OperationLease {
    _activity: OwnedRwLockReadGuard<()>,
    pub session: Arc<DatabaseSession>,
    _guard: OwnedMutexGuard<()>,
}

impl std::ops::Deref for OperationLease {
    type Target = Client;
    fn deref(&self) -> &Client {
        &self.session.client
    }
}
impl Drop for OperationLease {
    fn drop(&mut self) {
        self.session.running.store(false, Ordering::Release);
    }
}
impl OperationLease {
    pub fn invalidate(&self) {
        self.session.invalidate();
    }
    pub async fn bounded<T>(
        &self,
        operation: impl std::future::Future<Output = Result<T, String>>,
    ) -> Result<T, String> {
        self.bounded_for(operation, std::time::Duration::from_secs(30))
            .await
    }
    pub async fn bounded_for<T>(
        &self,
        operation: impl std::future::Future<Output = Result<T, String>>,
        timeout: std::time::Duration,
    ) -> Result<T, String> {
        match tokio::time::timeout(timeout, operation).await {
            Ok(result) => result,
            Err(_) => {
                self.invalidate();
                let _ = tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    crate::database::postgres::cancel_with_tls(
                        &self.session.client.cancel_token(),
                        self.session.tls.clone(),
                    ),
                )
                .await;
                Err("Operation timed out. Reconnect before continuing. A write may have completed; inspect its outcome before retrying.".into())
            }
        }
    }
}

impl AppState {
    pub async fn maintenance(
        &self,
        id: &str,
        write: bool,
    ) -> Result<(Arc<DatabaseSession>, OwnedRwLockWriteGuard<()>), String> {
        let guard = self.maintenance.clone().try_write_owned().map_err(|_| {
            "Wait for all current database operations to finish before backup / restore."
        })?;
        let session = self.session(id).await?;
        if session.closed.load(Ordering::Acquire) || session.client.is_closed() {
            return Err("Reconnect before backup / restore.".into());
        }
        if write && session.info.read_only {
            return Err("Restore is not allowed on a read-only connection.".into());
        }
        Ok((session, guard))
    }
    pub async fn invalidate_database(&self, info: &SessionInfo) {
        for session in self.sessions.read().await.values() {
            if session.info.connection.host == info.connection.host
                && session.info.connection.port == info.connection.port
                && session.info.connection.database == info.connection.database
            {
                session.closed.store(true, Ordering::Release);
                session.client.abort();
            }
        }
    }
    #[cfg(test)]
    pub async fn add(
        &self,
        client: DatabaseClient,
        info: SessionInfo,
        tls: Option<rustls::ClientConfig>,
    ) -> Result<(), String> {
        self.add_with_password(client, info, tls, None).await
    }
    pub async fn add_with_password(
        &self,
        client: DatabaseClient,
        info: SessionInfo,
        tls: Option<rustls::ClientConfig>,
        password: Option<String>,
    ) -> Result<(), String> {
        let mut sessions = self.sessions.write().await;
        if let Some(existing) = sessions
            .values()
            .find(|s| s.info.profile_id == info.profile_id)
        {
            if existing.info.id != info.id
                || !(existing.closed.load(Ordering::Acquire) || existing.client.is_closed())
                || existing.running.load(Ordering::Acquire)
            {
                return Err(
                    "This profile is already connected or an operation is still finishing.".into(),
                );
            }
        } else if sessions.len() >= 8 {
            return Err(
                "Maximum 8 open connections. Close a session before opening another.".into(),
            );
        }
        sessions.insert(
            info.id.clone(),
            Arc::new(DatabaseSession {
                client: Arc::new(client),
                info,
                tls,
                gate: Arc::new(Mutex::new(())),
                cancellation: RwLock::new(()),
                running: AtomicBool::new(false),
                closed: AtomicBool::new(false),
                password: password.map(zeroize::Zeroizing::new),
            }),
        );
        Ok(())
    }
    async fn session(&self, id: &str) -> Result<Arc<DatabaseSession>, String> {
        self.sessions
            .read()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| "Connection is closed. Reconnect to continue.".into())
    }
    pub async fn reconnect_id(&self, profile_id: &str) -> Result<Option<String>, String> {
        let sessions = self.sessions.read().await;
        let Some(existing) = sessions.values().find(|s| s.info.profile_id == profile_id) else {
            return Ok(None);
        };
        if existing.closed.load(Ordering::Acquire) || existing.client.is_closed() {
            Ok(Some(existing.info.id.clone()))
        } else {
            Err("This profile is already connected.".into())
        }
    }
    pub async fn statuses(&self) -> Vec<SessionStatus> {
        self.sessions
            .read()
            .await
            .values()
            .map(|session| SessionStatus {
                id: session.info.id.clone(),
                status: if session.closed.load(Ordering::Acquire) || session.client.is_closed() {
                    "lost"
                } else if session.running.load(Ordering::Acquire) {
                    "busy"
                } else {
                    "active"
                },
            })
            .collect()
    }
    pub async fn list(&self) -> Vec<SessionInfo> {
        self.sessions
            .read()
            .await
            .values()
            .map(|s| s.info.clone())
            .collect()
    }
    pub async fn profile_active(&self, id: &str) -> bool {
        self.sessions
            .read()
            .await
            .values()
            .any(|s| s.info.profile_id == id)
    }
    pub async fn disconnect(&self, id: &str) -> Result<(), String> {
        let _activity = self
            .maintenance
            .clone()
            .try_read_owned()
            .map_err(|_| "Wait for backup / restore before disconnecting.")?;
        let session = self.session(id).await?;
        let _guard = session
            .gate
            .clone()
            .try_lock_owned()
            .map_err(|_| "An operation is running. Cancel it or wait before disconnecting.")?;
        session.closed.store(true, Ordering::Release);
        self.sessions.write().await.remove(id);
        Ok(())
    }
    // Metadata queues behind SQL; it must not share a read-only transaction or be cancelled in its place.
    pub async fn client(&self, id: &str) -> Result<OperationLease, String> {
        let activity = self.maintenance.clone().try_read_owned().map_err(|_| {
            "Backup / restore is running. Database operations are temporarily paused."
        })?;
        let session = self.session(id).await?;
        let guard = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            session.gate.clone().lock_owned(),
        )
        .await
        .map_err(|_| "Connection is busy. Try again when the current operation has finished.")?;
        let cancellation = session.cancellation.read().await;
        if session.closed.load(Ordering::Acquire) || session.client.is_closed() {
            return Err("Connection is closed. Reconnect to continue.".into());
        }
        drop(cancellation);
        session.running.store(true, Ordering::Release);
        Ok(OperationLease {
            _activity: activity,
            session,
            _guard: guard,
        })
    }
    pub async fn begin_operation(
        &self,
        id: &str,
        write: bool,
    ) -> Result<
        (
            Arc<DatabaseClient>,
            Option<rustls::ClientConfig>,
            OperationLease,
        ),
        QueryExecutionError,
    > {
        let activity = self.maintenance.clone().try_read_owned().map_err(|_| {
            QueryExecutionError::simple(
                QueryErrorKind::Busy,
                "Backup / restore is running. Database operations are temporarily paused.",
            )
        })?;
        let session = self
            .session(id)
            .await
            .map_err(|e| QueryExecutionError::simple(QueryErrorKind::Database, e))?;
        let guard = session.gate.clone().try_lock_owned().map_err(|_| {
            QueryExecutionError::simple(
                QueryErrorKind::Busy,
                "Another operation is running on this connection.",
            )
        })?;
        let cancellation = session.cancellation.read().await;
        if session.closed.load(Ordering::Acquire) || session.client.is_closed() {
            return Err(QueryExecutionError::simple(
                QueryErrorKind::Database,
                "Connection is closed. Reconnect to continue.",
            ));
        }
        if write && session.info.read_only {
            return Err(QueryExecutionError::simple(
                QueryErrorKind::Validation,
                "This connection is read-only. Reconnect with write access to edit data.",
            ));
        }
        session.running.store(true, Ordering::Release);
        drop(cancellation);
        Ok((
            session.client.clone(),
            session.tls.clone(),
            OperationLease {
                _activity: activity,
                session,
                _guard: guard,
            },
        ))
    }
    pub async fn cancel(&self, id: &str) -> Result<bool, String> {
        let session = self.session(id).await?;
        // A late cancellation packet must finish before any next operation can start.
        let _cancellation = session.cancellation.write().await;
        if !session.running.load(Ordering::Acquire) {
            return Ok(false);
        }
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            crate::database::postgres::cancel_with_tls(
                &session.client.cancel_token(),
                session.tls.clone(),
            ),
        )
        .await;
        if !matches!(result, Ok(Ok(()))) {
            session.closed.store(true, Ordering::Release);
            session.client.abort();
            return Err("Cancellation request could not be delivered. Reconnect and inspect the operation outcome before retrying.".into());
        }
        Ok(true)
    }
}
