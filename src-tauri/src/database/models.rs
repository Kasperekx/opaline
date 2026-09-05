use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SslMode {
    Disable,
    Prefer,
    Require,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectionConfig {
    pub(crate) name: String,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) database: String,
    pub(crate) username: String,
    pub(crate) password: String,
    pub(crate) ssl_mode: SslMode,
    #[serde(default)]
    pub(crate) ca_path: Option<String>,
    #[serde(default)]
    pub(crate) read_only: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectionInfo {
    pub(crate) name: String,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) database: String,
    pub(crate) username: String,
    pub(crate) server_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DatabaseObject {
    pub(crate) schema: String,
    pub(crate) name: String,
    pub(crate) object_type: String,
    pub(crate) estimated_rows: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ColumnInfo {
    pub(crate) name: String,
    pub(crate) data_type: String,
    pub(crate) nullable: bool,
    pub(crate) default_value: Option<String>,
    pub(crate) primary_key: bool,
    pub(crate) identity: bool,
    pub(crate) generated: bool,
    pub(crate) enum_values: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableSort {
    pub(crate) column: String,
    pub(crate) direction: SortDirection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TablePageRequest {
    pub(crate) schema: String,
    pub(crate) table: String,
    pub(crate) page: u64,
    pub(crate) page_size: u16,
    pub(crate) filter: Option<String>,
    pub(crate) sort: Option<TableSort>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableDataRow {
    pub(crate) values: Vec<Option<String>>,
    pub(crate) row_version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableDataPage {
    pub(crate) columns: Vec<ColumnInfo>,
    pub(crate) rows: Vec<TableDataRow>,
    pub(crate) page: u64,
    pub(crate) page_size: u16,
    pub(crate) has_more: bool,
    pub(crate) editable: bool,
    pub(crate) editability_reason: Option<String>,
    pub(crate) insertable: bool,
    pub(crate) insertability_reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableCellValue {
    pub(crate) column: String,
    pub(crate) value: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateTableRowRequest {
    pub(crate) schema: String,
    pub(crate) table: String,
    pub(crate) key: Vec<TableCellValue>,
    pub(crate) changes: Vec<TableCellValue>,
    pub(crate) row_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InsertTableRowRequest {
    pub(crate) schema: String,
    pub(crate) table: String,
    pub(crate) values: Vec<TableCellValue>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteTableRowRequest {
    pub(crate) schema: String,
    pub(crate) table: String,
    pub(crate) key: Vec<TableCellValue>,
    pub(crate) row_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableRowIdentity {
    pub(crate) key: Vec<TableCellValue>,
    pub(crate) row_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteTableRowsRequest {
    pub(crate) schema: String,
    pub(crate) table: String,
    pub(crate) rows: Vec<TableRowIdentity>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateTableRowsRequest {
    pub(crate) schema: String,
    pub(crate) table: String,
    pub(crate) rows: Vec<TableRowIdentity>,
    pub(crate) change: TableCellValue,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableMutationResult {
    pub(crate) affected_rows: u64,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TableExportFormat {
    Csv,
    Json,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportTableDataRequest {
    pub(crate) schema: String,
    pub(crate) table: String,
    pub(crate) filter: Option<String>,
    pub(crate) sort: Option<TableSort>,
    pub(crate) format: TableExportFormat,
    pub(crate) path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableExportProgress {
    pub(crate) rows_exported: u64,
    pub(crate) bytes_written: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TableExportResult {
    pub(crate) rows_exported: u64,
    pub(crate) bytes_written: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QueryResultSet {
    pub(crate) columns: Vec<String>,
    pub(crate) rows: Vec<Vec<Option<String>>>,
    pub(crate) affected_rows: u64,
    pub(crate) truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QueryResult {
    pub(crate) result_sets: Vec<QueryResultSet>,
    pub(crate) duration_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QueryExecutionError {
    pub(crate) kind: QueryErrorKind,
    pub(crate) message: String,
    pub(crate) detail: Option<String>,
    pub(crate) hint: Option<String>,
    pub(crate) code: Option<String>,
    pub(crate) position: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum QueryErrorKind {
    Busy,
    Cancelled,
    Database,
    Timeout,
    Validation,
}

impl QueryExecutionError {
    pub(crate) fn simple(kind: QueryErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            detail: None,
            hint: None,
            code: None,
            position: None,
        }
    }
}
