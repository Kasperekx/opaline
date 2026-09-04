use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use futures_util::{pin_mut, TryStreamExt};
use tokio::{fs::OpenOptions, io::AsyncWriteExt};
use tokio_postgres::{types::ToSql, Client};

use super::{
    models::{ExportTableDataRequest, TableExportFormat, TableExportProgress, TableExportResult},
    table_data::{
        normalize_filter, order_clause, qualified_name, searchable_projection, table_metadata,
        text_projection, validate_relation_name,
    },
};

const PROGRESS_INTERVAL_ROWS: u64 = 250;

pub(crate) async fn export_table<F>(
    client: &Client,
    request: &ExportTableDataRequest,
    mut on_progress: F,
) -> Result<TableExportResult, String>
where
    F: FnMut(TableExportProgress),
{
    validate_relation_name(&request.schema, &request.table)?;
    let destination = validated_destination(&request.path)?;
    let temporary = temporary_path(&destination)?;
    let result = write_export(client, request, &temporary, &mut on_progress).await;

    let export = match result {
        Ok(export) => export,
        Err(error) => {
            let _ = tokio::fs::remove_file(&temporary).await;
            return Err(error);
        }
    };

    if let Err(error) = publish_export(&temporary, &destination).await {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(error);
    }

    Ok(export)
}

async fn write_export<F>(
    client: &Client,
    request: &ExportTableDataRequest,
    temporary: &Path,
    on_progress: &mut F,
) -> Result<TableExportResult, String>
where
    F: FnMut(TableExportProgress),
{
    let metadata = table_metadata(client, &request.schema, &request.table).await?;
    if metadata.columns.is_empty() {
        return Err("This relation has no visible columns.".into());
    }
    let filter = normalize_filter(request.filter.as_deref())?;
    let selected_columns = text_projection(&metadata.columns);
    let searchable_columns = searchable_projection(&metadata.columns);
    let order = order_clause(&metadata, request.sort.as_ref())?;
    let relation = qualified_name(&request.schema, &request.table);
    let sql = format!(
        "SELECT {selected_columns} FROM {relation} \
         WHERE ($1::text IS NULL OR \
           strpos(lower(concat_ws(' ', {searchable_columns})), lower($1::text)) > 0) \
         {order}"
    );
    let filter_parameter = filter.as_deref();
    let parameters: [&(dyn ToSql + Sync); 1] = [&filter_parameter];
    let stream = client
        .query_raw(&sql, parameters)
        .await
        .map_err(export_query_error)?;
    pin_mut!(stream);

    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temporary)
        .await
        .map_err(|error| format!("Could not create the export file: {error}"))?;
    let mut progress = TableExportProgress {
        rows_exported: 0,
        bytes_written: 0,
    };

    match request.format {
        TableExportFormat::Csv => {
            let header = format!(
                "\u{FEFF}{}\r\n",
                metadata
                    .columns
                    .iter()
                    .map(|column| csv_cell(&column.name))
                    .collect::<Vec<_>>()
                    .join(",")
            );
            write_chunk(&mut file, &header, &mut progress).await?;
        }
        TableExportFormat::Json => write_chunk(&mut file, "[\n", &mut progress).await?,
    }
    on_progress(progress.clone());

    while let Some(row) = stream.try_next().await.map_err(export_query_error)? {
        let values = (0..metadata.columns.len())
            .map(|index| {
                row.try_get::<_, Option<String>>(index)
                    .map_err(|error| format!("Could not decode an exported row: {error}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let chunk = match request.format {
            TableExportFormat::Csv => format!(
                "{}\r\n",
                values
                    .iter()
                    .map(|value| csv_cell(value.as_deref().unwrap_or_default()))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            TableExportFormat::Json => {
                json_row(&metadata.columns, &values, progress.rows_exported > 0)?
            }
        };
        write_chunk(&mut file, &chunk, &mut progress).await?;
        progress.rows_exported += 1;
        if progress.rows_exported % PROGRESS_INTERVAL_ROWS == 0 {
            on_progress(progress.clone());
        }
    }

    if matches!(request.format, TableExportFormat::Json) {
        write_chunk(&mut file, "\n]\n", &mut progress).await?;
    }
    file.flush()
        .await
        .map_err(|error| format!("Could not flush the export file: {error}"))?;
    file.sync_all()
        .await
        .map_err(|error| format!("Could not sync the export file: {error}"))?;
    on_progress(progress.clone());
    Ok(TableExportResult {
        rows_exported: progress.rows_exported,
        bytes_written: progress.bytes_written,
    })
}

async fn write_chunk(
    file: &mut tokio::fs::File,
    chunk: &str,
    progress: &mut TableExportProgress,
) -> Result<(), String> {
    file.write_all(chunk.as_bytes())
        .await
        .map_err(|error| format!("Could not write the export file: {error}"))?;
    progress.bytes_written = progress.bytes_written.saturating_add(chunk.len() as u64);
    Ok(())
}

fn json_row(
    columns: &[super::models::ColumnInfo],
    values: &[Option<String>],
    has_previous: bool,
) -> Result<String, String> {
    let fields = columns
        .iter()
        .enumerate()
        .map(|(index, column)| {
            let name = serde_json::to_string(&column.name)
                .map_err(|error| format!("Could not encode a JSON column name: {error}"))?;
            let value = match values.get(index).and_then(Option::as_ref) {
                Some(value) => serde_json::to_string(value)
                    .map_err(|error| format!("Could not encode a JSON value: {error}"))?,
                None => "null".into(),
            };
            Ok(format!("{name}: {value}"))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let prefix = if has_previous { ",\n" } else { "" };
    Ok(format!("{prefix}  {{{}}}", fields.join(", ")))
}

fn csv_cell(value: &str) -> String {
    if value.contains([',', '"', '\r', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.into()
    }
}

fn validated_destination(path: &str) -> Result<PathBuf, String> {
    let destination = PathBuf::from(path.trim());
    if !destination.is_absolute() || destination.file_name().is_none() {
        return Err("Choose a valid export destination.".into());
    }
    Ok(destination)
}

fn temporary_path(destination: &Path) -> Result<PathBuf, String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "The export destination has no parent directory.".to_string())?;
    let filename = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The export filename is not valid Unicode.".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "The system clock cannot create an export filename.".to_string())?
        .as_nanos();
    Ok(parent.join(format!(
        ".{filename}.opaline-{}-{nonce}.part",
        std::process::id()
    )))
}

async fn publish_export(temporary: &Path, destination: &Path) -> Result<(), String> {
    if !tokio::fs::try_exists(destination)
        .await
        .map_err(|error| format!("Could not inspect the export destination: {error}"))?
    {
        return tokio::fs::rename(temporary, destination)
            .await
            .map_err(|error| format!("Could not publish the export file: {error}"));
    }

    let backup = temporary_path(destination)?.with_extension("opaline-backup");
    tokio::fs::rename(destination, &backup)
        .await
        .map_err(|error| format!("Could not prepare the existing export file: {error}"))?;
    if let Err(error) = tokio::fs::rename(temporary, destination).await {
        let restore = tokio::fs::rename(&backup, destination).await;
        return Err(match restore {
            Ok(()) => format!("Could not replace the export file: {error}"),
            Err(restore_error) => format!(
                "Could not replace the export file ({error}) or restore the previous file ({restore_error})."
            ),
        });
    }
    let _ = tokio::fs::remove_file(&backup).await;
    Ok(())
}

fn export_query_error(error: tokio_postgres::Error) -> String {
    if error
        .as_db_error()
        .is_some_and(|database_error| database_error.code().code() == "57014")
    {
        "Export cancelled.".into()
    } else {
        format!("Could not export table data: {error}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{
        models::{ConnectionConfig, SslMode},
        postgres,
    };

    #[test]
    fn escapes_csv_cells() {
        assert_eq!(csv_cell("plain"), "plain");
        assert_eq!(csv_cell("a,b"), "\"a,b\"");
        assert_eq!(csv_cell("a\"b"), "\"a\"\"b\"");
    }

    #[test]
    fn rejects_relative_export_paths() {
        assert!(validated_destination("rows.csv").is_err());
    }

    #[tokio::test]
    async fn streams_csv_when_postgres_is_configured() {
        let Ok(port) = std::env::var("OPALINE_TEST_POSTGRES_PORT") else {
            return;
        };
        let config = ConnectionConfig {
            name: "Table export test".into(),
            host: "127.0.0.1".into(),
            port: port.parse().expect("test port must be a number"),
            database: "postgres".into(),
            username: "postgres".into(),
            password: "opaline_test".into(),
            ssl_mode: SslMode::Disable,
        };
        let (client, _) = postgres::connect(&config)
            .await
            .expect("Opaline should connect to the test database");
        client
            .batch_execute(
                "CREATE TEMP TABLE opaline_export_target (id integer PRIMARY KEY, label text); \
                 INSERT INTO opaline_export_target \
                 SELECT value, CASE WHEN value = 3 THEN 'quoted, value' ELSE 'row-' || value END \
                 FROM generate_series(1, 600) AS value; \
                 CREATE TEMP VIEW opaline_slow_export AS \
                 SELECT value::integer AS id, pg_sleep(0.002)::text AS wait \
                 FROM generate_series(1, 10000) AS value;",
            )
            .await
            .expect("export test data should be created");
        let schema: String = client
            .query_one(
                "SELECT n.nspname::text \
                 FROM pg_catalog.pg_class c \
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
                 WHERE c.relname = 'opaline_export_target' AND c.relpersistence = 't'",
                &[],
            )
            .await
            .expect("temporary schema should exist")
            .get(0);
        let destination = std::env::temp_dir().join(format!(
            "opaline-export-test-{}-{}.csv",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("the system clock should be valid")
                .as_nanos()
        ));
        let mut updates = Vec::new();
        let result = export_table(
            &client,
            &ExportTableDataRequest {
                schema,
                table: "opaline_export_target".into(),
                filter: None,
                sort: None,
                format: TableExportFormat::Csv,
                path: destination.to_string_lossy().into_owned(),
            },
            |progress| updates.push(progress),
        )
        .await
        .expect("CSV export should succeed");
        let contents = tokio::fs::read_to_string(&destination)
            .await
            .expect("the CSV export should be readable");
        let _ = tokio::fs::remove_file(&destination).await;

        assert_eq!(result.rows_exported, 600);
        assert!(result.bytes_written > 0);
        assert!(updates.len() >= 4);
        assert!(contents.starts_with('\u{FEFF}'));
        assert!(contents.contains("\"quoted, value\""));

        let cancelled_destination = destination.with_file_name(format!(
            "opaline-cancelled-export-{}.csv",
            std::process::id()
        ));
        let cancel_token = client.cancel_token();
        let cancellation = tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(35)).await;
            postgres::cancel_query(&cancel_token, SslMode::Disable)
                .await
                .expect("the slow export should accept cancellation");
        });
        let cancelled = export_table(
            &client,
            &ExportTableDataRequest {
                schema: schema_for_relation(&client, "opaline_slow_export").await,
                table: "opaline_slow_export".into(),
                filter: None,
                sort: None,
                format: TableExportFormat::Csv,
                path: cancelled_destination.to_string_lossy().into_owned(),
            },
            |_| {},
        )
        .await
        .expect_err("the slow export should be cancelled");
        cancellation
            .await
            .expect("the cancellation task should finish");
        assert!(cancelled.contains("cancelled"));
        assert!(!cancelled_destination.exists());
    }

    async fn schema_for_relation(client: &Client, relation: &str) -> String {
        client
            .query_one(
                "SELECT n.nspname::text \
                 FROM pg_catalog.pg_class c \
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
                 WHERE c.relname = $1 AND c.relpersistence = 't'",
                &[&relation],
            )
            .await
            .expect("temporary schema should exist")
            .get(0)
    }
}
