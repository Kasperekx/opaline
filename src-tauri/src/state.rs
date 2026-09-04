use std::sync::Arc;

use tokio::sync::RwLock;
use tokio_postgres::Client;

use crate::database::models::ConnectionInfo;

pub(crate) struct DatabaseSession {
    client: Arc<Client>,
    info: ConnectionInfo,
}

#[derive(Default)]
pub(crate) struct AppState {
    session: RwLock<Option<DatabaseSession>>,
}

impl AppState {
    pub(crate) async fn set_session(&self, client: Client, info: ConnectionInfo) {
        *self.session.write().await = Some(DatabaseSession {
            client: Arc::new(client),
            info,
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

    pub(crate) async fn connection_info(&self) -> Option<ConnectionInfo> {
        self.session
            .read()
            .await
            .as_ref()
            .map(|session| session.info.clone())
    }
}
