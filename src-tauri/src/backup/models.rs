use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DumpFormat {
    Custom,
    Sql,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DumpContent {
    All,
    Schema,
    Data,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DumpInput {
    pub tools_id: Option<String>,
    pub path: String,
    pub format: DumpFormat,
    pub content: DumpContent,
    pub schemas: Vec<String>,
    pub tables: Vec<TableName>,
    pub password: Option<String>,
}
#[derive(Deserialize)]
pub(crate) struct TableName {
    pub schema: String,
    pub table: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestoreInput {
    pub prepared_id: String,
    pub password: Option<String>,
    pub trusted_file: bool,
    pub confirm_database: String,
    pub confirm_production: bool,
    pub allow_nonempty: bool,
    pub clean: bool,
    pub confirm_clean: bool,
    pub preserve_ownership: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolInfo {
    pub id: String,
    pub directory: String,
    pub version: String,
    pub major: u32,
    pub source: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestorePreview {
    pub id: String,
    pub format: DumpFormat,
    pub bytes: u64,
    pub digest: String,
    pub preview: String,
    pub server_major: u32,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JobProgress {
    pub stage: String,
    pub elapsed_ms: u64,
    pub message: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JobResult {
    pub bytes: u64,
    pub duration_ms: u64,
    pub message: String,
}
