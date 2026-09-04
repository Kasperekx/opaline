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
pub(crate) struct ActiveQuery {
    pub(crate) cancel_token: CancelToken,
    pub(crate) ssl_mode: SslMode,
}

#[derive(Default)]
pub(crate) struct AppState {
    session: RwLock<Option<DatabaseSession>>,
    query_running: AtomicBool,
    active_query: Mutex<Option<ActiveQuery>>,
}

pub(crate) struct QueryLease<'a> {
    state: &'a AppState,
}

impl Drop for QueryLease<'_> {
    fn drop(&mut self) {
        *self
            .state
            .active_query
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
        self.state.query_running.store(false, Ordering::Release);
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

    pub(crate) async fn begin_query(
        &self,
    ) -> Result<(Arc<Client>, SslMode, QueryLease<'_>), QueryExecutionError> {
        if self
            .query_running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(QueryExecutionError::simple(
                QueryErrorKind::Busy,
                "Another query is already running.",
            ));
        }

        let lease = QueryLease { state: self };
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
            .active_query
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(ActiveQuery {
            cancel_token: client.cancel_token(),
            ssl_mode,
        });

        Ok((client, ssl_mode, lease))
    }

    pub(crate) fn active_query(&self) -> Option<ActiveQuery> {
        self.active_query
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
