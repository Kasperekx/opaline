use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use rustls_tokio_postgres::{config_platform_verifier, MakeRustlsConnect};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tokio_postgres::{config::SslMode, Client, Config as PgConfig, NoTls, SimpleQueryMessage};

#[derive(Default)]
struct AppState {
    session: RwLock<Option<DatabaseSession>>,
}

struct DatabaseSession {
    client: Arc<Client>,
    info: ConnectionInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionConfig {
    name: String,
    host: String,
    port: u16,
    database: String,
    username: String,
    password: String,
    ssl_mode: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionInfo {
    name: String,
    host: String,
    port: u16,
    database: String,
    username: String,
    server_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseObject {
    schema: String,
    name: String,
    object_type: String,
    estimated_rows: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ColumnInfo {
    name: String,
    data_type: String,
    nullable: bool,
    default_value: Option<String>,
    primary_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryResultSet {
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
    affected_rows: u64,
    truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryResult {
    result_sets: Vec<QueryResultSet>,
    duration_ms: u128,
}

fn postgres_config(input: &ConnectionConfig) -> Result<PgConfig, String> {
    if input.host.trim().is_empty()
        || input.database.trim().is_empty()
        || input.username.trim().is_empty()
    {
        return Err("Host, database and username are required.".into());
    }

    let mut config = PgConfig::new();
    config
        .host(input.host.trim())
        .port(input.port)
        .dbname(input.database.trim())
        .user(input.username.trim())
        .password(&input.password)
        .application_name("Opaline")
        .connect_timeout(Duration::from_secs(12));

    config.ssl_mode(match input.ssl_mode.as_str() {
        "disable" => SslMode::Disable,
        "require" => SslMode::Require,
        _ => SslMode::Prefer,
    });

    Ok(config)
}

async fn open_client(input: &ConnectionConfig) -> Result<Client, String> {
    let config = postgres_config(input)?;

    if input.ssl_mode == "disable" {
        let (client, connection) = config
            .connect(NoTls)
            .await
            .map_err(|error| format!("Could not connect: {error}"))?;
        tauri::async_runtime::spawn(async move {
            if let Err(error) = connection.await {
                eprintln!("PostgreSQL connection ended: {error}");
            }
        });
        return Ok(client);
    }

    let tls_config = config_platform_verifier()
        .map_err(|error| format!("Could not load system TLS certificates: {error}"))?;
    let tls = MakeRustlsConnect::new(tls_config);
    let (client, connection) = config
        .connect(tls)
        .await
        .map_err(|error| format!("Could not connect securely: {error}"))?;
    tauri::async_runtime::spawn(async move {
        if let Err(error) = connection.await {
            eprintln!("PostgreSQL connection ended: {error}");
        }
    });

    Ok(client)
}

#[tauri::command]
async fn connect_postgres(
    input: ConnectionConfig,
    state: tauri::State<'_, AppState>,
) -> Result<ConnectionInfo, String> {
    let client = open_client(&input).await?;
    let row = client
        .query_one(
            "SELECT current_database()::text, current_user::text, version()::text",
            &[],
        )
        .await
        .map_err(|error| format!("Connected, but could not inspect the server: {error}"))?;

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

    *state.session.write().await = Some(DatabaseSession {
        client: Arc::new(client),
        info: info.clone(),
    });

    Ok(info)
}

#[tauri::command]
async fn disconnect_postgres(state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.session.write().await = None;
    Ok(())
}

async fn current_client(state: &tauri::State<'_, AppState>) -> Result<Arc<Client>, String> {
    state
        .session
        .read()
        .await
        .as_ref()
        .map(|session| Arc::clone(&session.client))
        .ok_or_else(|| "No active PostgreSQL connection.".to_string())
}

#[tauri::command]
async fn connection_info(
    state: tauri::State<'_, AppState>,
) -> Result<Option<ConnectionInfo>, String> {
    Ok(state
        .session
        .read()
        .await
        .as_ref()
        .map(|session| session.info.clone()))
}

#[tauri::command]
async fn list_database_objects(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DatabaseObject>, String> {
    let client = current_client(&state).await?;
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
        .map_err(|error| format!("Could not load database objects: {error}"))?;

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

#[tauri::command]
async fn list_columns(
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ColumnInfo>, String> {
    let client = current_client(&state).await?;
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
        .map_err(|error| format!("Could not load table columns: {error}"))?;

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

#[tauri::command]
async fn run_query(
    sql: String,
    max_rows: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, String> {
    if sql.trim().is_empty() {
        return Err("Write a query before running it.".into());
    }
    if sql.len() > 1_000_000 {
        return Err("Query is too large (maximum 1 MB).".into());
    }

    let client = current_client(&state).await?;
    let started = Instant::now();
    let messages = client
        .simple_query(&sql)
        .await
        .map_err(|error| format!("Query failed: {error}"))?;
    let row_limit = max_rows.unwrap_or(500).clamp(1, 10_000);

    let mut result_sets = Vec::new();
    let mut current: Option<QueryResultSet> = None;

    for message in messages {
        match message {
            SimpleQueryMessage::RowDescription(columns) => {
                current = Some(QueryResultSet {
                    columns: columns
                        .iter()
                        .map(|column| column.name().to_string())
                        .collect(),
                    rows: Vec::new(),
                    affected_rows: 0,
                    truncated: false,
                });
            }
            SimpleQueryMessage::Row(row) => {
                let set = current.get_or_insert_with(|| QueryResultSet {
                    columns: row
                        .columns()
                        .iter()
                        .map(|column| column.name().to_string())
                        .collect(),
                    rows: Vec::new(),
                    affected_rows: 0,
                    truncated: false,
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
                let mut set = current.take().unwrap_or(QueryResultSet {
                    columns: Vec::new(),
                    rows: Vec::new(),
                    affected_rows: 0,
                    truncated: false,
                });
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            connect_postgres,
            disconnect_postgres,
            connection_info,
            list_database_objects,
            list_columns,
            run_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running Opaline");
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
            ssl_mode: "prefer".into(),
        }
    }

    #[test]
    fn builds_a_valid_postgres_config() {
        assert!(postgres_config(&input()).is_ok());
    }

    #[test]
    fn rejects_missing_connection_fields() {
        let mut config = input();
        config.host = "  ".into();
        assert_eq!(
            postgres_config(&config).unwrap_err(),
            "Host, database and username are required."
        );
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
        config.ssl_mode = "disable".into();

        let client = open_client(&config)
            .await
            .expect("Opaline should connect to the test database");
        let messages = client
            .simple_query("SELECT 'opaline' AS client, 42 AS answer")
            .await
            .expect("Opaline should execute a query");
        let row = messages
            .iter()
            .find_map(|message| match message {
                SimpleQueryMessage::Row(row) => Some(row),
                _ => None,
            })
            .expect("query should return one row");

        assert_eq!(row.get("client"), Some("opaline"));
        assert_eq!(row.get("answer"), Some("42"));
    }
}
