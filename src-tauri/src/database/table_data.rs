use futures_util::{pin_mut, TryStreamExt};
use std::collections::HashSet;

use tokio_postgres::{types::ToSql, Client, Row};

use super::{
    models::{
        ColumnInfo, DeleteTableRowRequest, InsertTableRowRequest, SortDirection, TableCellValue,
        TableDataPage, TableDataRow, TablePageRequest, TableSort, UpdateTableRowRequest,
    },
    postgres,
};

const MIN_PAGE_SIZE: u16 = 10;
const MAX_PAGE_SIZE: u16 = 200;
const MAX_FILTER_CHARACTERS: usize = 500;

pub(crate) struct TableMetadata {
    pub(crate) columns: Vec<ColumnInfo>,
    relation_kind: String,
}

impl TableMetadata {
    fn supports_row_versions(&self) -> bool {
        matches!(self.relation_kind.as_str(), "r" | "p")
    }

    pub(crate) fn primary_key(&self) -> Vec<&ColumnInfo> {
        self.columns
            .iter()
            .filter(|column| column.primary_key)
            .collect()
    }

    fn editability(&self) -> (bool, Option<String>) {
        if !self.supports_row_versions() {
            return (
                false,
                Some("Views and foreign tables are opened in read-only mode.".into()),
            );
        }
        if self.primary_key().is_empty() {
            return (
                false,
                Some("Add a primary key to enable safe row editing.".into()),
            );
        }
        (true, None)
    }

    fn insertability(&self) -> (bool, Option<String>) {
        if self.supports_row_versions() {
            (true, None)
        } else {
            (
                false,
                Some("Views and foreign tables do not support direct row insertion.".into()),
            )
        }
    }
}

pub(crate) async fn fetch_page(
    client: &Client,
    request: &TablePageRequest,
) -> Result<TableDataPage, String> {
    validate_relation_name(&request.schema, &request.table)?;
    let metadata = table_metadata(client, &request.schema, &request.table).await?;
    if metadata.columns.is_empty() {
        return Err("This relation has no visible columns.".into());
    }

    let page_size = request.page_size.clamp(MIN_PAGE_SIZE, MAX_PAGE_SIZE);
    let limit = i64::from(page_size) + 1;
    let offset = request
        .page
        .checked_mul(u64::from(page_size))
        .and_then(|value| i64::try_from(value).ok())
        .ok_or_else(|| "The requested page is too far from the start of the table.".to_string())?;
    let filter = normalize_filter(request.filter.as_deref())?;
    let qualified_table = qualified_name(&request.schema, &request.table);
    let selected_columns = text_projection(&metadata.columns);
    let row_version = if metadata.supports_row_versions() {
        ", xmin::text AS __opaline_row_version"
    } else {
        ""
    };
    let searchable_columns = searchable_projection(&metadata.columns);
    let order_clause = order_clause(&metadata, request.sort.as_ref())?;
    let sql = format!(
        "SELECT {selected_columns}{row_version} \
         FROM {qualified_table} \
         WHERE ($1::text IS NULL OR \
           strpos(lower(concat_ws(' ', {searchable_columns})), lower($1::text)) > 0) \
         {order_clause} LIMIT $2 OFFSET $3"
    );
    let filter_parameter = filter.as_deref();
    let parameters: [&(dyn ToSql + Sync); 3] = [&filter_parameter, &limit, &offset];
    let rows = client
        .query_raw(&sql, parameters)
        .await
        .map_err(|error| format!("Could not load table data: {error}"))?;
    pin_mut!(rows);
    let mut data_rows = Vec::new();
    let mut has_more = false;
    let mut bytes = 0usize;
    while let Some(row) = rows
        .try_next()
        .await
        .map_err(|error| format!("Could not load table data: {error}"))?
    {
        if data_rows.len() == usize::from(page_size) {
            has_more = true;
            break;
        }
        for index in 0..metadata.columns.len() {
            bytes = bytes.saturating_add(
                row.try_get::<_, Option<&str>>(index)
                    .map_err(|_| "Could not decode row data.")?
                    .map_or(0, str::len)
                    + 24,
            );
        }
        if bytes > 4 * 1024 * 1024 {
            return Err("This page exceeds the 4 MiB data budget. Reduce the page size, select fewer columns in SQL, or use a streaming export.".into());
        }
        data_rows.push(map_row(&row, &metadata)?);
    }
    let (editable, editability_reason) = metadata.editability();
    let (insertable, insertability_reason) = metadata.insertability();

    Ok(TableDataPage {
        columns: metadata.columns,
        rows: data_rows,
        page: request.page,
        page_size,
        has_more,
        editable,
        editability_reason,
        insertable,
        insertability_reason,
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TableRowRequest {
    pub schema: String,
    pub table: String,
    pub key: Vec<TableCellValue>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableRowSnapshot {
    pub columns: Vec<String>,
    pub row: Option<TableDataRow>,
}

// Read a fresh row for conflict review without replacing its original version or draft.
pub(crate) async fn fetch_row(
    client: &Client,
    request: &TableRowRequest,
) -> Result<TableRowSnapshot, String> {
    validate_relation_name(&request.schema, &request.table)?;
    if request.key.len() > 1600
        || request.key.iter().any(|value| {
            value
                .value
                .as_ref()
                .is_some_and(|value| value.len() > 1024 * 1024)
        })
    {
        return Err("Row identity exceeds the comparison budget.".into());
    }
    let metadata = table_metadata(client, &request.schema, &request.table).await?;
    ensure_editable(&metadata)?;
    let key = validated_key(&metadata, &request.key)?;
    let parameters = key
        .iter()
        .map(|(_, value)| value.clone())
        .collect::<Vec<_>>();
    let predicate = key
        .iter()
        .enumerate()
        .map(|(index, (column, _))| {
            format!(
                "{} IS NOT DISTINCT FROM {}",
                quote_identifier(&column.name),
                typed_parameter(index + 1, column)
            )
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    let sql = format!(
        "SELECT {} FROM {} WHERE {predicate}",
        returning_clause(&metadata),
        qualified_name(&request.schema, &request.table)
    );
    let row = client
        .query_opt(&sql, &sql_parameters(&parameters))
        .await
        .map_err(|error| format!("Could not compare current values: {error}"))?
        .map(|row| map_row(&row, &metadata))
        .transpose()?;
    if row.as_ref().is_some_and(|row| {
        row.values.iter().flatten().map(String::len).sum::<usize>() > 4 * 1024 * 1024
    }) {
        return Err(
            "This row exceeds the 4 MiB comparison budget. Inspect selected columns in SQL.".into(),
        );
    }
    Ok(TableRowSnapshot {
        columns: metadata
            .columns
            .into_iter()
            .map(|column| column.name)
            .collect(),
        row,
    })
}

pub(crate) async fn insert_row(
    client: &Client,
    request: &InsertTableRowRequest,
) -> Result<TableDataRow, String> {
    validate_relation_name(&request.schema, &request.table)?;
    let metadata = table_metadata(client, &request.schema, &request.table).await?;
    ensure_insertable(&metadata)?;
    let values = validated_insert_values(&metadata, &request.values)?;
    let qualified_table = qualified_name(&request.schema, &request.table);
    let returning = returning_clause(&metadata);
    let mut parameters = Vec::with_capacity(values.len());

    let sql = if values.is_empty() {
        format!("INSERT INTO {qualified_table} DEFAULT VALUES RETURNING {returning}")
    } else {
        let columns = values
            .iter()
            .map(|(column, _)| quote_identifier(&column.name))
            .collect::<Vec<_>>()
            .join(", ");
        let placeholders = values
            .iter()
            .enumerate()
            .map(|(index, (column, value))| {
                parameters.push(value.clone());
                typed_parameter(index + 1, column)
            })
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "INSERT INTO {qualified_table} ({columns}) VALUES ({placeholders}) \
             RETURNING {returning}"
        )
    };
    let parameter_refs = sql_parameters(&parameters);
    let row = client
        .query_one(&sql, &parameter_refs)
        .await
        .map_err(|error| format!("Could not insert row: {error}"))?;

    map_row(&row, &metadata)
}

pub(crate) async fn update_row(
    client: &Client,
    request: &UpdateTableRowRequest,
) -> Result<TableDataRow, String> {
    validate_relation_name(&request.schema, &request.table)?;
    let metadata = table_metadata(client, &request.schema, &request.table).await?;
    ensure_editable(&metadata)?;
    let key = validated_key(&metadata, &request.key)?;
    let changes = validated_changes(&metadata, &request.changes)?;
    let qualified_table = qualified_name(&request.schema, &request.table);
    let mut parameters = Vec::with_capacity(changes.len() + key.len() + 1);
    let assignments = changes
        .iter()
        .enumerate()
        .map(|(index, (column, value))| {
            parameters.push(value.clone());
            format!(
                "{} = {}",
                quote_identifier(&column.name),
                typed_parameter(index + 1, column)
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    let key_start = parameters.len();
    let key_predicate = key
        .iter()
        .enumerate()
        .map(|(index, (column, value))| {
            parameters.push(value.clone());
            format!(
                "{} IS NOT DISTINCT FROM {}",
                quote_identifier(&column.name),
                typed_parameter(key_start + index + 1, column)
            )
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    parameters.push(Some(request.row_version.clone()));
    let version_parameter = parameters.len();
    let returning = returning_clause(&metadata);
    let sql = format!(
        "UPDATE {qualified_table} SET {assignments} \
         WHERE {key_predicate} AND xmin = ${version_parameter}::text::xid \
         RETURNING {returning}"
    );
    let parameter_refs = sql_parameters(&parameters);
    let row = client
        .query_opt(&sql, &parameter_refs)
        .await
        .map_err(|error| format!("Could not update row: {error}"))?
        .ok_or_else(stale_row_error)?;

    map_row(&row, &metadata)
}

pub(crate) async fn delete_row(
    client: &Client,
    request: &DeleteTableRowRequest,
) -> Result<(), String> {
    validate_relation_name(&request.schema, &request.table)?;
    let metadata = table_metadata(client, &request.schema, &request.table).await?;
    ensure_editable(&metadata)?;
    let key = validated_key(&metadata, &request.key)?;
    let mut parameters = Vec::with_capacity(key.len() + 1);
    let key_predicate = key
        .iter()
        .enumerate()
        .map(|(index, (column, value))| {
            parameters.push(value.clone());
            format!(
                "{} IS NOT DISTINCT FROM {}",
                quote_identifier(&column.name),
                typed_parameter(index + 1, column)
            )
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    parameters.push(Some(request.row_version.clone()));
    let version_parameter = parameters.len();
    let qualified_table = qualified_name(&request.schema, &request.table);
    let sql = format!(
        "DELETE FROM {qualified_table} \
         WHERE {key_predicate} AND xmin = ${version_parameter}::text::xid \
         RETURNING 1"
    );
    let parameter_refs = sql_parameters(&parameters);
    client
        .query_opt(&sql, &parameter_refs)
        .await
        .map_err(|error| format!("Could not delete row: {error}"))?
        .ok_or_else(stale_row_error)?;
    Ok(())
}

pub(crate) async fn table_metadata(
    client: &Client,
    schema: &str,
    table: &str,
) -> Result<TableMetadata, String> {
    let relation = client
        .query_opt(
            "SELECT c.relkind::text \
             FROM pg_catalog.pg_class c \
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
             WHERE n.nspname = $1 AND c.relname = $2 \
               AND c.relkind IN ('r', 'p', 'v', 'm', 'f')",
            &[&schema, &table],
        )
        .await
        .map_err(|error| format!("Could not inspect table: {error}"))?
        .ok_or_else(|| "The selected table or view no longer exists.".to_string())?;
    let columns = postgres::list_columns(client, schema, table).await?;
    Ok(TableMetadata {
        columns,
        relation_kind: relation.get(0),
    })
}

pub(crate) fn normalize_filter(filter: Option<&str>) -> Result<Option<String>, String> {
    let Some(filter) = filter.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if filter.chars().count() > MAX_FILTER_CHARACTERS {
        return Err(format!(
            "The row filter can contain at most {MAX_FILTER_CHARACTERS} characters."
        ));
    }
    Ok(Some(filter.to_string()))
}

pub(crate) fn order_clause(
    metadata: &TableMetadata,
    sort: Option<&TableSort>,
) -> Result<String, String> {
    let primary_key = metadata.primary_key();
    let mut terms = Vec::new();
    if let Some(sort) = sort {
        let column = metadata
            .columns
            .iter()
            .find(|column| column.name == sort.column)
            .ok_or_else(|| "The selected sort column no longer exists.".to_string())?;
        let (direction, nulls) = match sort.direction {
            SortDirection::Asc => ("ASC", "NULLS LAST"),
            SortDirection::Desc => ("DESC", "NULLS FIRST"),
        };
        terms.push(format!(
            "{} {direction} {nulls}",
            quote_identifier(&column.name)
        ));
    }
    for column in primary_key {
        if sort.is_some_and(|sort| sort.column == column.name) {
            continue;
        }
        terms.push(format!("{} ASC", quote_identifier(&column.name)));
    }
    if terms.is_empty() && metadata.supports_row_versions() {
        terms.push("ctid ASC".into());
    }
    Ok(if terms.is_empty() {
        String::new()
    } else {
        format!("ORDER BY {}", terms.join(", "))
    })
}

pub(crate) fn validated_key<'a>(
    metadata: &'a TableMetadata,
    values: &'a [TableCellValue],
) -> Result<Vec<(&'a ColumnInfo, Option<String>)>, String> {
    let primary_key = metadata.primary_key();
    if values.len() != primary_key.len() {
        return Err("The row identity is incomplete. Refresh the table and try again.".into());
    }
    primary_key
        .into_iter()
        .map(|column| {
            let value = values
                .iter()
                .find(|value| value.column == column.name)
                .ok_or_else(|| {
                    "The row identity is incomplete. Refresh the table and try again.".to_string()
                })?;
            Ok((column, value.value.clone()))
        })
        .collect()
}

pub(crate) fn validated_changes<'a>(
    metadata: &'a TableMetadata,
    changes: &'a [TableCellValue],
) -> Result<Vec<(&'a ColumnInfo, Option<String>)>, String> {
    if changes.is_empty() {
        return Err("Change at least one value before saving.".into());
    }
    validated_writable_values(metadata, changes)
}

fn validated_insert_values<'a>(
    metadata: &'a TableMetadata,
    values: &'a [TableCellValue],
) -> Result<Vec<(&'a ColumnInfo, Option<String>)>, String> {
    let values = validated_writable_values(metadata, values)?;
    let included = values
        .iter()
        .map(|(column, _)| column.name.as_str())
        .collect::<HashSet<_>>();
    if let Some(column) = metadata.columns.iter().find(|column| {
        !column.nullable
            && column.default_value.is_none()
            && !column.identity
            && !column.generated
            && !included.contains(column.name.as_str())
    }) {
        return Err(format!("{} requires a value.", column.name));
    }
    Ok(values)
}

fn validated_writable_values<'a>(
    metadata: &'a TableMetadata,
    values: &'a [TableCellValue],
) -> Result<Vec<(&'a ColumnInfo, Option<String>)>, String> {
    if values.len() > metadata.columns.len() {
        return Err("The row mutation contains too many columns.".into());
    }
    let mut seen = HashSet::new();
    values
        .iter()
        .map(|value| {
            if !seen.insert(value.column.as_str()) {
                return Err("A column can only be submitted once.".to_string());
            }
            let column = metadata
                .columns
                .iter()
                .find(|column| column.name == value.column)
                .ok_or_else(|| "A submitted column no longer exists.".to_string())?;
            if column.identity || column.generated {
                return Err(format!("{} is managed by PostgreSQL.", column.name));
            }
            if !column.nullable && value.value.is_none() {
                return Err(format!("{} cannot be NULL.", column.name));
            }
            Ok((column, value.value.clone()))
        })
        .collect()
}

pub(crate) fn ensure_editable(metadata: &TableMetadata) -> Result<(), String> {
    let (editable, reason) = metadata.editability();
    if editable {
        Ok(())
    } else {
        Err(reason.unwrap_or_else(|| "This relation is read-only.".into()))
    }
}

fn ensure_insertable(metadata: &TableMetadata) -> Result<(), String> {
    let (insertable, reason) = metadata.insertability();
    if insertable {
        Ok(())
    } else {
        Err(reason.unwrap_or_else(|| "This relation does not accept new rows.".into()))
    }
}

fn map_row(row: &Row, metadata: &TableMetadata) -> Result<TableDataRow, String> {
    let values = (0..metadata.columns.len())
        .map(|index| row.try_get(index))
        .collect::<Result<Vec<Option<String>>, _>>()
        .map_err(|error| format!("Could not decode table row: {error}"))?;
    let row_version = if metadata.supports_row_versions() {
        row.try_get(metadata.columns.len())
            .map_err(|error| format!("Could not decode row version: {error}"))?
    } else {
        None
    };
    Ok(TableDataRow {
        values,
        row_version,
    })
}

fn returning_clause(metadata: &TableMetadata) -> String {
    let columns = metadata
        .columns
        .iter()
        .map(|column| format!("{}::text", quote_identifier(&column.name)))
        .collect::<Vec<_>>()
        .join(", ");
    format!("{columns}, xmin::text AS __opaline_row_version")
}

pub(crate) fn sql_parameters(values: &[Option<String>]) -> Vec<&(dyn ToSql + Sync)> {
    values
        .iter()
        .map(|value| value as &(dyn ToSql + Sync))
        .collect()
}

pub(crate) fn typed_parameter(index: usize, column: &ColumnInfo) -> String {
    format!("${index}::text::{}", column.data_type)
}

pub(crate) fn text_projection(columns: &[ColumnInfo]) -> String {
    columns
        .iter()
        .map(|column| format!("{}::text", quote_identifier(&column.name)))
        .collect::<Vec<_>>()
        .join(", ")
}

pub(crate) fn searchable_projection(columns: &[ColumnInfo]) -> String {
    columns
        .iter()
        .map(|column| format!("COALESCE({}::text, '')", quote_identifier(&column.name)))
        .collect::<Vec<_>>()
        .join(", ")
}

pub(crate) fn validate_relation_name(schema: &str, table: &str) -> Result<(), String> {
    if schema.trim().is_empty() || table.trim().is_empty() {
        return Err("Schema and table are required.".into());
    }
    Ok(())
}

pub(crate) fn qualified_name(schema: &str, table: &str) -> String {
    format!("{}.{}", quote_identifier(schema), quote_identifier(table))
}

pub(crate) fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn stale_row_error() -> String {
    "This row changed or was deleted after it was loaded. Refresh before editing it again.".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{
        models::{
            ConnectionConfig, DeleteTableRowsRequest, SslMode, TableRowIdentity, TableSort,
            UpdateTableRowsRequest,
        },
        table_mutation::{delete_rows, update_rows},
    };

    #[test]
    fn quotes_postgres_identifiers() {
        assert_eq!(quote_identifier("user data"), "\"user data\"");
        assert_eq!(quote_identifier("a\"b"), "\"a\"\"b\"");
    }

    #[test]
    fn validates_filter_length() {
        assert_eq!(
            normalize_filter(Some("  hello  ")).unwrap(),
            Some("hello".into())
        );
        assert!(normalize_filter(Some(&"x".repeat(MAX_FILTER_CHARACTERS + 1))).is_err());
    }

    #[tokio::test]
    async fn browses_and_mutates_rows_when_postgres_is_configured() {
        let Ok(port) = std::env::var("OPALINE_TEST_POSTGRES_PORT") else {
            return;
        };
        let config = ConnectionConfig {
            name: "Table data test".into(),
            host: "127.0.0.1".into(),
            port: port.parse().expect("test port must be a number"),
            database: "postgres".into(),
            username: "postgres".into(),
            password: "opaline_test".into(),
            ssl_mode: SslMode::Disable,
            ca_path: None,
            read_only: false,
        };
        let (client, _) = postgres::connect(&config)
            .await
            .expect("Opaline should connect to the test database");
        client
            .batch_execute(
                "CREATE TEMP TABLE opaline_stage_two (\
                    id integer PRIMARY KEY, \
                    name text NOT NULL, \
                    note text\
                 ); \
                 INSERT INTO opaline_stage_two \
                 SELECT value, 'row-' || value, NULL \
                 FROM generate_series(1, 12) AS value; \
                 CREATE TEMP TABLE opaline_without_key (value text); \
                 INSERT INTO opaline_without_key VALUES ('read only'); \
                 CREATE TEMP VIEW opaline_stage_two_view AS \
                 SELECT id, name FROM opaline_stage_two; \
                 CREATE TEMP TABLE opaline_insert_target (\
                    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, \
                    label text NOT NULL, \
                    note text NOT NULL DEFAULT 'database default'\
                 ); \
                 CREATE TYPE pg_temp.opaline_status AS ENUM ('draft', 'ready', 'archived'); \
                 CREATE TEMP TABLE opaline_typed_target (\
                    id integer PRIMARY KEY, \
                    status pg_temp.opaline_status NOT NULL\
                 ); \
                 INSERT INTO opaline_typed_target VALUES (1, 'draft'\
                 );",
            )
            .await
            .expect("test data should be created");
        let schema: String = client
            .query_one(
                "SELECT n.nspname::text \
                 FROM pg_catalog.pg_class c \
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
                 WHERE c.relname = 'opaline_stage_two' AND c.relpersistence = 't'",
                &[],
            )
            .await
            .expect("temporary schema should exist")
            .get(0);

        let first_page = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                page: 0,
                page_size: 10,
                filter: None,
                sort: Some(TableSort {
                    column: "id".into(),
                    direction: SortDirection::Asc,
                }),
            },
        )
        .await
        .expect("the first page should load");
        assert!(first_page.editable);
        assert_eq!(first_page.rows.len(), 10);
        assert!(first_page.has_more);
        assert_eq!(first_page.rows[0].values[0].as_deref(), Some("1"));

        let typed_page = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_typed_target".into(),
                page: 0,
                page_size: 10,
                filter: None,
                sort: None,
            },
        )
        .await
        .expect("typed column metadata should load");
        assert_eq!(
            typed_page.columns[1].enum_values,
            ["draft", "ready", "archived"]
        );

        let original = first_page.rows[0].clone();
        let updated = update_row(
            &client,
            &UpdateTableRowRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                key: vec![TableCellValue {
                    column: "id".into(),
                    value: Some("1".into()),
                }],
                changes: vec![TableCellValue {
                    column: "name".into(),
                    value: Some("updated".into()),
                }],
                row_version: original
                    .row_version
                    .clone()
                    .expect("editable rows have a version"),
            },
        )
        .await
        .expect("the row should be updated");
        assert_eq!(updated.values[1].as_deref(), Some("updated"));

        let stale_update = update_row(
            &client,
            &UpdateTableRowRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                key: vec![TableCellValue {
                    column: "id".into(),
                    value: Some("1".into()),
                }],
                changes: vec![TableCellValue {
                    column: "name".into(),
                    value: Some("stale".into()),
                }],
                row_version: original
                    .row_version
                    .expect("the original row has a version"),
            },
        )
        .await
        .expect_err("a stale row version must not overwrite newer data");
        assert!(stale_update.contains("changed or was deleted"));

        let stale_bulk_rows = [1_usize, 2_usize]
            .into_iter()
            .map(|index| TableRowIdentity {
                key: vec![TableCellValue {
                    column: "id".into(),
                    value: first_page.rows[index].values[0].clone(),
                }],
                row_version: first_page.rows[index]
                    .row_version
                    .clone()
                    .expect("editable rows have versions"),
            })
            .collect::<Vec<_>>();
        update_row(
            &client,
            &UpdateTableRowRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                key: stale_bulk_rows[0].key.clone(),
                changes: vec![TableCellValue {
                    column: "name".into(),
                    value: Some("concurrent-change".into()),
                }],
                row_version: stale_bulk_rows[0].row_version.clone(),
            },
        )
        .await
        .expect("one selected row should change concurrently");
        let stale_bulk_update = update_rows(
            &client,
            &UpdateTableRowsRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                rows: stale_bulk_rows,
                change: TableCellValue {
                    column: "name".into(),
                    value: Some("must-not-be-written".into()),
                },
            },
        )
        .await
        .expect_err("one stale row should reject the complete bulk update");
        assert!(stale_bulk_update.contains("Nothing was written"));
        let rejected_bulk_rows = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                page: 0,
                page_size: 10,
                filter: Some("must-not-be-written".into()),
                sort: None,
            },
        )
        .await
        .expect("the rejected bulk update should be verifiable");
        assert!(rejected_bulk_rows.rows.is_empty());

        let refreshed_page = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                page: 0,
                page_size: 10,
                filter: None,
                sort: None,
            },
        )
        .await
        .expect("rows should refresh after the concurrency conflict");
        let bulk_rows = [1_usize, 2_usize]
            .into_iter()
            .map(|index| TableRowIdentity {
                key: vec![TableCellValue {
                    column: "id".into(),
                    value: refreshed_page.rows[index].values[0].clone(),
                }],
                row_version: refreshed_page.rows[index]
                    .row_version
                    .clone()
                    .expect("editable rows have versions"),
            })
            .collect::<Vec<_>>();
        let bulk_updated = update_rows(
            &client,
            &UpdateTableRowsRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                rows: bulk_rows,
                change: TableCellValue {
                    column: "name".into(),
                    value: Some("bulk-updated".into()),
                },
            },
        )
        .await
        .expect("selected rows should update atomically");
        assert_eq!(bulk_updated.affected_rows, 2);

        let refreshed_bulk_rows = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                page: 0,
                page_size: 10,
                filter: Some("bulk-updated".into()),
                sort: None,
            },
        )
        .await
        .expect("bulk-updated rows should reload");
        assert_eq!(refreshed_bulk_rows.rows.len(), 2);
        let delete_targets = refreshed_bulk_rows
            .rows
            .iter()
            .map(|row| TableRowIdentity {
                key: vec![TableCellValue {
                    column: "id".into(),
                    value: row.values[0].clone(),
                }],
                row_version: row
                    .row_version
                    .clone()
                    .expect("editable rows have versions"),
            })
            .collect::<Vec<_>>();
        let bulk_deleted = delete_rows(
            &client,
            &DeleteTableRowsRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                rows: delete_targets,
            },
        )
        .await
        .expect("selected rows should delete atomically");
        assert_eq!(bulk_deleted.affected_rows, 2);

        let filtered = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                page: 0,
                page_size: 25,
                filter: Some("row-12".into()),
                sort: None,
            },
        )
        .await
        .expect("the text filter should load");
        assert_eq!(filtered.rows.len(), 1);
        assert_eq!(filtered.rows[0].values[0].as_deref(), Some("12"));

        let literal_wildcard = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_stage_two".into(),
                page: 0,
                page_size: 25,
                filter: Some("%".into()),
                sort: None,
            },
        )
        .await
        .expect("filter metacharacters should be treated as ordinary text");
        assert!(literal_wildcard.rows.is_empty());

        let table_without_key = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_without_key".into(),
                page: 0,
                page_size: 25,
                filter: None,
                sort: None,
            },
        )
        .await
        .expect("tables without keys should still be browsable");
        assert!(!table_without_key.editable);
        assert!(table_without_key
            .editability_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("primary key")));

        let view = fetch_page(
            &client,
            &TablePageRequest {
                schema: schema.clone(),
                table: "opaline_stage_two_view".into(),
                page: 0,
                page_size: 25,
                filter: None,
                sort: None,
            },
        )
        .await
        .expect("views should still be browsable");
        assert!(!view.editable);
        assert!(view
            .editability_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("read-only")));

        let inserted = insert_row(
            &client,
            &InsertTableRowRequest {
                schema: schema.clone(),
                table: "opaline_insert_target".into(),
                values: vec![TableCellValue {
                    column: "label".into(),
                    value: Some("created in Opaline".into()),
                }],
            },
        )
        .await
        .expect("identity and default columns should be generated by PostgreSQL");
        assert_eq!(inserted.values[0].as_deref(), Some("1"));
        assert_eq!(inserted.values[1].as_deref(), Some("created in Opaline"));
        assert_eq!(inserted.values[2].as_deref(), Some("database default"));

        let missing_required_value = insert_row(
            &client,
            &InsertTableRowRequest {
                schema: schema.clone(),
                table: "opaline_insert_target".into(),
                values: Vec::new(),
            },
        )
        .await
        .expect_err("required values should be validated before insertion");
        assert!(missing_required_value.contains("label requires a value"));

        let managed_identity = insert_row(
            &client,
            &InsertTableRowRequest {
                schema: schema.clone(),
                table: "opaline_insert_target".into(),
                values: vec![TableCellValue {
                    column: "id".into(),
                    value: Some("99".into()),
                }],
            },
        )
        .await
        .expect_err("managed identity values must not be submitted");
        assert!(managed_identity.contains("managed by PostgreSQL"));

        delete_row(
            &client,
            &DeleteTableRowRequest {
                schema,
                table: "opaline_stage_two".into(),
                key: vec![TableCellValue {
                    column: "id".into(),
                    value: Some("1".into()),
                }],
                row_version: updated
                    .row_version
                    .expect("the updated row has a fresh version"),
            },
        )
        .await
        .expect("the updated row should be deleted");
    }
}
