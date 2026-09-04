use std::{future::Future, time::Duration};

use futures_util::{pin_mut, TryStreamExt};
use rustls_tokio_postgres::{config_platform_verifier, MakeRustlsConnect};
use tokio_postgres::{
    config::SslMode as PostgresSslMode, Client, Config as PostgresConfig, Error, NoTls,
    SimpleQueryMessage,
};

use super::models::{
    ColumnInfo, ConnectionConfig, ConnectionInfo, DatabaseObject, QueryResult, QueryResultSet,
    SslMode,
};

const CONNECTION_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_QUERY_BYTES: usize = 1_000_000;
const DEFAULT_ROW_LIMIT: usize = 500;
const MAX_ROW_LIMIT: usize = 10_000;

pub(crate) async fn connect(input: &ConnectionConfig) -> Result<(Client, ConnectionInfo), String> {
    let client = open_client(input).await?;
    let row = client
        .query_one(
            "SELECT current_database()::text, current_user::text, version()::text",
            &[],
        )
        .await
        .map_err(|error| database_error("Connected, but could not inspect the server", error))?;

    let version: String = row.get(2);
    let info = ConnectionInfo {
        name: input.name.trim().to_string(),
        host: input.host.trim().to_string(),
        port: input.port,
        database: row.get(0),
        username: row.get(1),
        server_version: version
            .split(',')
            .next()
            .unwrap_or("PostgreSQL")
            .to_string(),
    };

    Ok((client, info))
}

pub(crate) async fn list_objects(client: &Client) -> Result<Vec<DatabaseObject>, String> {
    let rows = client
        .query(
            r#"
            SELECT
                n.nspname::text,
                c.relname::text,
                CASE c.relkind
                    WHEN 'r' THEN 'table'
                    WHEN 'p' THEN 'partitioned_table'
                    WHEN 'v' THEN 'view'
                    WHEN 'm' THEN 'materialized_view'
                    WHEN 'f' THEN 'foreign_table'
                    ELSE 'other'
                END::text,
                GREATEST(c.reltuples::bigint, 0)
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
              AND n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname NOT LIKE 'pg_toast%'
            ORDER BY n.nspname, c.relname
            "#,
            &[],
        )
        .await
        .map_err(|error| database_error("Could not load database objects", error))?;

    Ok(rows
        .into_iter()
        .map(|row| DatabaseObject {
            schema: row.get(0),
            name: row.get(1),
            object_type: row.get(2),
            estimated_rows: row.get(3),
        })
        .collect())
}

pub(crate) async fn list_columns(
    client: &Client,
    schema: &str,
    table: &str,
) -> Result<Vec<ColumnInfo>, String> {
    let rows = client
        .query(
            r#"
            SELECT
                a.attname::text,
                pg_catalog.format_type(a.atttypid, a.atttypmod)::text,
                NOT a.attnotnull,
                pg_catalog.pg_get_expr(ad.adbin, ad.adrelid)::text,
                EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_index i
                    WHERE i.indrelid = a.attrelid
                      AND i.indisprimary
                      AND a.attnum = ANY(i.indkey)
                )
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_catalog.pg_attrdef ad
              ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
            WHERE n.nspname = $1
              AND c.relname = $2
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
            "#,
            &[&schema, &table],
        )
        .await
        .map_err(|error| database_error("Could not load table columns", error))?;

    Ok(rows
        .into_iter()
        .map(|row| ColumnInfo {
            name: row.get(0),
            data_type: row.get(1),
            nullable: row.get(2),
            default_value: row.get(3),
            primary_key: row.get(4),
        })
        .collect())
}

pub(crate) async fn execute_query(
    client: &Client,
    sql: &str,
    max_rows: Option<usize>,
) -> Result<QueryResult, String> {
    validate_query(sql)?;

    let started = std::time::Instant::now();
    let row_limit = max_rows
        .unwrap_or(DEFAULT_ROW_LIMIT)
        .clamp(1, MAX_ROW_LIMIT);
    let messages = client
        .simple_query_raw(sql)
        .await
        .map_err(|error| database_error("Query failed", error))?;
    pin_mut!(messages);
    let mut result_sets = Vec::new();
    let mut current: Option<QueryResultSet> = None;

    while let Some(message) = messages
        .try_next()
        .await
        .map_err(|error| database_error("Query failed", error))?
    {
        match message {
            SimpleQueryMessage::RowDescription(columns) => {
                current = Some(empty_result_set(
                    columns
                        .iter()
                        .map(|column| column.name().to_string())
                        .collect(),
                ));
            }
            SimpleQueryMessage::Row(row) => {
                let set = current.get_or_insert_with(|| {
                    empty_result_set(
                        row.columns()
                            .iter()
                            .map(|column| column.name().to_string())
                            .collect(),
                    )
                });
                if set.rows.len() < row_limit {
                    set.rows.push(
                        (0..row.len())
                            .map(|index| row.get(index).map(ToString::to_string))
                            .collect(),
                    );
                } else {
                    set.truncated = true;
                }
            }
            SimpleQueryMessage::CommandComplete(affected_rows) => {
                let mut set = current
                    .take()
                    .unwrap_or_else(|| empty_result_set(Vec::new()));
                set.affected_rows = affected_rows;
                result_sets.push(set);
            }
            _ => {}
        }
    }

    if let Some(set) = current {
        result_sets.push(set);
    }

    Ok(QueryResult {
        result_sets,
        duration_ms: started.elapsed().as_millis(),
    })
}

fn validate_query(sql: &str) -> Result<(), String> {
    if sql.trim().is_empty() {
        return Err("Write a query before running it.".into());
    }
    if sql.len() > MAX_QUERY_BYTES {
        return Err("Query is too large (maximum 1 MB).".into());
    }
    Ok(())
}

fn empty_result_set(columns: Vec<String>) -> QueryResultSet {
    QueryResultSet {
        columns,
        rows: Vec::new(),
        affected_rows: 0,
        truncated: false,
    }
}

fn build_config(input: &ConnectionConfig) -> Result<PostgresConfig, String> {
    if input.host.trim().is_empty()
        || input.database.trim().is_empty()
        || input.username.trim().is_empty()
    {
        return Err("Host, database and username are required.".into());
    }

    let mut config = PostgresConfig::new();
    config
        .host(input.host.trim())
        .port(input.port)
        .dbname(input.database.trim())
        .user(input.username.trim())
        .password(&input.password)
        .application_name("Opaline")
        .connect_timeout(CONNECTION_TIMEOUT)
        .ssl_mode(match input.ssl_mode {
            SslMode::Disable => PostgresSslMode::Disable,
            SslMode::Prefer => PostgresSslMode::Prefer,
            SslMode::Require => PostgresSslMode::Require,
        });

    Ok(config)
}

async fn open_client(input: &ConnectionConfig) -> Result<Client, String> {
    let config = build_config(input)?;

    if matches!(input.ssl_mode, SslMode::Disable) {
        let (client, connection) = config
            .connect(NoTls)
            .await
            .map_err(|error| database_error("Could not connect", error))?;
        drive_connection(connection);
        return Ok(client);
    }

    let tls_config = config_platform_verifier()
        .map_err(|error| format!("Could not load system TLS certificates: {error}"))?;
    let tls = MakeRustlsConnect::new(tls_config);
    let (client, connection) = config
        .connect(tls)
        .await
        .map_err(|error| database_error("Could not connect securely", error))?;
    drive_connection(connection);
    Ok(client)
}

fn drive_connection<F>(connection: F)
where
    F: Future<Output = Result<(), Error>> + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        if let Err(error) = connection.await {
            eprintln!("PostgreSQL connection ended: {error}");
        }
    });
}

fn database_error(context: &str, error: Error) -> String {
    format!("{context}: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> ConnectionConfig {
        ConnectionConfig {
            name: "Local".into(),
            host: "localhost".into(),
            port: 5432,
            database: "postgres".into(),
            username: "postgres".into(),
            password: String::new(),
            ssl_mode: SslMode::Prefer,
        }
    }

    #[test]
    fn builds_a_valid_postgres_config() {
        assert!(build_config(&input()).is_ok());
    }

    #[test]
    fn rejects_missing_connection_fields() {
        let mut config = input();
        config.host = "  ".into();
        assert_eq!(
            build_config(&config).unwrap_err(),
            "Host, database and username are required."
        );
    }

    #[test]
    fn rejects_empty_and_oversized_queries() {
        assert_eq!(
            validate_query("  ").unwrap_err(),
            "Write a query before running it."
        );
        assert!(validate_query(&"x".repeat(MAX_QUERY_BYTES + 1)).is_err());
    }

    #[tokio::test]
    async fn connects_and_queries_postgres_when_configured() {
        let Ok(port) = std::env::var("OPALINE_TEST_POSTGRES_PORT") else {
            return;
        };

        let mut config = input();
        config.host = "127.0.0.1".into();
        config.port = port.parse().expect("test port must be a number");
        config.password = "opaline_test".into();
        config.ssl_mode = SslMode::Disable;

        let client = open_client(&config)
            .await
            .expect("Opaline should connect to the test database");
        let result = execute_query(&client, "SELECT 'opaline' AS client, 42 AS answer", None)
            .await
            .expect("Opaline should execute a query");

        assert_eq!(result.result_sets[0].rows[0][0].as_deref(), Some("opaline"));
        assert_eq!(result.result_sets[0].rows[0][1].as_deref(), Some("42"));
    }
}
