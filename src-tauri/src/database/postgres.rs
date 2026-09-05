use super::client::DatabaseClient;
use std::time::Duration;

use futures_util::{pin_mut, TryStreamExt};
use rustls_tokio_postgres::{config_from_ca_cert, config_platform_verifier, MakeRustlsConnect};
use tokio_postgres::{
    config::SslMode as PostgresSslMode, error::ErrorPosition, CancelToken, Client,
    Config as PostgresConfig, Error, NoTls, SimpleQueryMessage,
};

use super::models::{
    ColumnInfo, ConnectionConfig, ConnectionInfo, DatabaseObject, QueryErrorKind,
    QueryExecutionError, QueryResult, QueryResultSet, SslMode,
};

const CONNECTION_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_QUERY_BYTES: usize = 1_000_000;
const DEFAULT_ROW_LIMIT: usize = 500;
const MAX_ROW_LIMIT: usize = 10_000;
const MAX_RESULT_BYTES: usize = 8 * 1024 * 1024;
const MAX_RESULT_SETS: usize = 32;

pub(crate) async fn connect(
    input: &ConnectionConfig,
) -> Result<(DatabaseClient, ConnectionInfo), String> {
    let tls = tls_config(input).await?;
    connect_with_tls(input, tls).await
}

pub(crate) async fn connect_with_tls(
    input: &ConnectionConfig,
    tls: Option<rustls::ClientConfig>,
) -> Result<(DatabaseClient, ConnectionInfo), String> {
    tokio::time::timeout(CONNECTION_TIMEOUT, establish_connection(input, tls))
        .await
        .map_err(|_| {
            "Connection timed out after 12 seconds. Check the server, port and TLS settings."
                .to_string()
        })?
}

async fn establish_connection(
    input: &ConnectionConfig,
    tls: Option<rustls::ClientConfig>,
) -> Result<(DatabaseClient, ConnectionInfo), String> {
    let client = open_client(input, tls).await?;
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
                ),
                a.attidentity <> '',
                a.attgenerated <> '',
                ARRAY(
                    SELECT e.enumlabel::text
                    FROM pg_catalog.pg_enum e
                    WHERE e.enumtypid = a.atttypid
                    ORDER BY e.enumsortorder
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
            identity: row.get(5),
            generated: row.get(6),
            enum_values: row.get(7),
        })
        .collect())
}

pub(crate) async fn execute_query(
    client: &Client,
    sql: &str,
    max_rows: Option<usize>,
) -> Result<QueryResult, QueryExecutionError> {
    validate_query(sql)?;

    let started = std::time::Instant::now();
    let row_limit = max_rows
        .unwrap_or(DEFAULT_ROW_LIMIT)
        .clamp(1, MAX_ROW_LIMIT);
    let messages = client.simple_query_raw(sql).await.map_err(query_error)?;
    pin_mut!(messages);
    let mut result_sets = Vec::new();
    let mut current: Option<QueryResultSet> = None;
    let mut retained_bytes = 0usize;

    while let Some(message) = messages.try_next().await.map_err(query_error)? {
        match message {
            SimpleQueryMessage::RowDescription(columns) => {
                if columns.len() > 512 {
                    return Err(QueryExecutionError::simple(
                        QueryErrorKind::Validation,
                        "Result exceeds 512 columns. Select fewer columns.",
                    ));
                }
                retained_bytes += columns
                    .iter()
                    .map(|column| column.name().len() + 24)
                    .sum::<usize>();
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
                let row_bytes = (0..row.len())
                    .map(|index| row.get(index).map_or(0, str::len) + 24)
                    .sum::<usize>();
                if set.rows.len() < row_limit
                    && retained_bytes.saturating_add(row_bytes) <= MAX_RESULT_BYTES
                {
                    retained_bytes += row_bytes;
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
                if result_sets.len() > MAX_RESULT_SETS {
                    return Err(QueryExecutionError::simple(
                        QueryErrorKind::Validation,
                        "A run can return at most 32 result sets. Run a smaller selection.",
                    ));
                }
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

#[cfg(test)]
pub(crate) async fn cancel_query(
    cancel_token: &CancelToken,
    ssl_mode: SslMode,
) -> Result<(), String> {
    let tls = if matches!(ssl_mode, SslMode::Disable) {
        None
    } else {
        Some(
            config_platform_verifier()
                .map_err(|error| format!("Could not load system TLS certificates: {error}"))?,
        )
    };
    cancel_with_tls(cancel_token, tls).await
}

pub(crate) async fn cancel_with_tls(
    cancel_token: &CancelToken,
    tls: Option<rustls::ClientConfig>,
) -> Result<(), String> {
    let Some(tls_config) = tls else {
        return cancel_token
            .cancel_query(NoTls)
            .await
            .map_err(|error| database_error("Could not cancel query", error));
    };
    cancel_token
        .cancel_query(MakeRustlsConnect::new(tls_config))
        .await
        .map_err(|error| database_error("Could not cancel query", error))
}

fn validate_query(sql: &str) -> Result<(), QueryExecutionError> {
    if sql.trim().is_empty() {
        return Err(QueryExecutionError::simple(
            QueryErrorKind::Validation,
            "Write a query before running it.",
        ));
    }
    if sql.len() > MAX_QUERY_BYTES {
        return Err(QueryExecutionError::simple(
            QueryErrorKind::Validation,
            "Query is too large (maximum 1 MB).",
        ));
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
    if input.read_only {
        config.options("-c default_transaction_read_only=on");
    }
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

pub(crate) async fn tls_config(
    input: &ConnectionConfig,
) -> Result<Option<rustls::ClientConfig>, String> {
    if let Some(path) = &input.ca_path {
        if input.ssl_mode != SslMode::Require {
            return Err("Custom CA requires TLS: Require.".into());
        }
        let path = std::path::PathBuf::from(path);
        return tokio::task::spawn_blocking(move || {
            let metadata =
                std::fs::metadata(&path).map_err(|_| "Cannot read the custom CA certificate.")?;
            if !path.is_absolute() || !metadata.is_file() || metadata.len() > 4 * 1024 * 1024 {
                return Err("Choose a PEM certificate file smaller than 4 MB.".into());
            }
            config_from_ca_cert(path).map(Some).map_err(|_| {
                "Invalid CA certificate. Choose a valid PEM certificate bundle.".into()
            })
        })
        .await
        .map_err(|_| "Could not load the custom CA certificate.".to_string())?;
    }
    if input.ssl_mode == SslMode::Disable {
        return Ok(None);
    }
    config_platform_verifier()
        .map(Some)
        .map_err(|_| "Could not load system TLS certificates.".into())
}

async fn open_client(
    input: &ConnectionConfig,
    tls_config: Option<rustls::ClientConfig>,
) -> Result<DatabaseClient, String> {
    let config = build_config(input)?;

    let Some(tls_config) = tls_config else {
        let (client, connection) = config
            .connect(NoTls)
            .await
            .map_err(|error| database_error("Could not connect", error))?;
        return Ok(DatabaseClient::new(client, connection));
    };
    let tls = MakeRustlsConnect::new(tls_config);
    let (client, connection) = config
        .connect(tls)
        .await
        .map_err(|error| database_error("Could not connect securely", error))?;
    Ok(DatabaseClient::new(client, connection))
}

fn database_error(context: &str, error: Error) -> String {
    format!("{context}: {error}")
}

fn query_error(error: Error) -> QueryExecutionError {
    let Some(database_error) = error.as_db_error() else {
        return QueryExecutionError::simple(
            QueryErrorKind::Database,
            format!("Query failed: {error}"),
        );
    };

    let code = database_error.code().code().to_string();
    QueryExecutionError {
        kind: if code == "57014" {
            QueryErrorKind::Cancelled
        } else {
            QueryErrorKind::Database
        },
        message: database_error.message().to_string(),
        detail: database_error.detail().map(str::to_string),
        hint: database_error.hint().map(str::to_string),
        code: Some(code),
        position: match database_error.position() {
            Some(ErrorPosition::Original(position)) => Some(*position),
            _ => None,
        },
    }
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
            ca_path: None,
            read_only: false,
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
            validate_query("  ").unwrap_err().message,
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

        let client = open_client(&config, tls_config(&config).await.unwrap())
            .await
            .expect("Opaline should connect to the test database");
        let result = execute_query(&client, "SELECT 'opaline' AS client, 42 AS answer", None)
            .await
            .expect("Opaline should execute a query");

        assert_eq!(result.result_sets[0].rows[0][0].as_deref(), Some("opaline"));
        assert_eq!(result.result_sets[0].rows[0][1].as_deref(), Some("42"));

        let limited = execute_query(&client, "SELECT generate_series(1, 25) AS number", Some(10))
            .await
            .expect("Opaline should limit large result sets");
        assert_eq!(limited.result_sets[0].rows.len(), 10);
        assert!(limited.result_sets[0].truncated);

        let syntax_error = execute_query(&client, "SELEC 1", None)
            .await
            .expect_err("invalid SQL should return a structured error");
        assert_eq!(syntax_error.code.as_deref(), Some("42601"));
        assert_eq!(syntax_error.position, Some(1));

        let cancel_token = client.cancel_token();
        let cancel_task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            cancel_query(&cancel_token, SslMode::Disable).await
        });
        let cancelled = execute_query(&client, "SELECT pg_sleep(10)", None)
            .await
            .expect_err("the long query should be cancelled");
        cancel_task
            .await
            .expect("the cancellation task should finish")
            .expect("PostgreSQL should accept the cancellation request");
        assert!(matches!(cancelled.kind, QueryErrorKind::Cancelled));
        assert_eq!(cancelled.code.as_deref(), Some("57014"));
    }
}
