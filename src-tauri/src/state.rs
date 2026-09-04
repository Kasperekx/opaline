use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use tokio::sync::RwLock;
use tokio_postgres::{CancelToken, Client};

use crate::database::models::{ConnectionInfo, QueryErrorKind, QueryExecutionError, SslMode};

pub(crate) struct DatabaseSession {
    client: Arc<Client>,
    info: ConnectionInfo,
    ssl_mode: SslMode,
}

#[derive(Clone)]
pub(crate) struct ActiveOperation {
    pub(crate) cancel_token: CancelToken,
    pub(crate) ssl_mode: SslMode,
}

#[derive(Default)]
pub(crate) struct AppState {
    session: RwLock<Option<DatabaseSession>>,
    operation_running: AtomicBool,
    active_operation: Mutex<Option<ActiveOperation>>,
}

pub(crate) struct OperationLease<'a> {
    state: &'a AppState,
}

impl Drop for OperationLease<'_> {
    fn drop(&mut self) {
        *self
            .state
            .active_operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
        self.state.operation_running.store(false, Ordering::Release);
    }
}

impl AppState {
    pub(crate) async fn set_session(
        &self,
        client: Client,
        info: ConnectionInfo,
        ssl_mode: SslMode,
    ) {
        *self.session.write().await = Some(DatabaseSession {
            client: Arc::new(client),
            info,
            ssl_mode,
        });
    }

    pub(crate) async fn clear_session(&self) {
        *self.session.write().await = None;
    }

    pub(crate) async fn client(&self) -> Result<Arc<Client>, String> {
        self.session
            .read()
            .await
            .as_ref()
            .map(|session| Arc::clone(&session.client))
            .ok_or_else(|| "No active PostgreSQL connection.".to_string())
    }

    pub(crate) async fn begin_operation(
        &self,
    ) -> Result<(Arc<Client>, SslMode, OperationLease<'_>), QueryExecutionError> {
        if self
            .operation_running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(QueryExecutionError::simple(
                QueryErrorKind::Busy,
                "Another database operation is already running.",
            ));
        }

        let lease = OperationLease { state: self };
        let session = self.session.read().await;
        let session = session.as_ref().ok_or_else(|| {
            QueryExecutionError::simple(
                QueryErrorKind::Database,
                "No active PostgreSQL connection.",
            )
        })?;
        let client = Arc::clone(&session.client);
        let ssl_mode = session.ssl_mode;
        *self
            .active_operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(ActiveOperation {
            cancel_token: client.cancel_token(),
            ssl_mode,
        });

        Ok((client, ssl_mode, lease))
    }

    pub(crate) fn active_operation(&self) -> Option<ActiveOperation> {
        self.active_operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub(crate) async fn connection_info(&self) -> Option<ConnectionInfo> {
        self.session
            .read()
            .await
            .as_ref()
            .map(|session| session.info.clone())
    }
}
