use std::{future::Future, ops::Deref};
use tokio_postgres::{Client, Error};

// The transport belongs to the session, including failed test connections.
// Invalidating or dropping a session must also release its socket and server locks.
pub(crate) struct DatabaseClient {
    client: Client,
    transport: tokio::task::JoinHandle<()>,
}
impl DatabaseClient {
    pub fn new(
        client: Client,
        connection: impl Future<Output = Result<(), Error>> + Send + 'static,
    ) -> Self {
        let transport = tokio::spawn(async move {
            if connection.await.is_err() {
                eprintln!("PostgreSQL connection ended unexpectedly.");
            }
        });
        Self { client, transport }
    }
    pub fn abort(&self) {
        self.transport.abort();
    }
}
impl Deref for DatabaseClient {
    type Target = Client;
    fn deref(&self) -> &Client {
        &self.client
    }
}
impl Drop for DatabaseClient {
    fn drop(&mut self) {
        self.abort();
    }
}
