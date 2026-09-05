use serde::Serialize;

use crate::database::models::ColumnInfo;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RelationStructure {
    pub(crate) schema: String,
    pub(crate) name: String,
    pub(crate) object_type: String,
    pub(crate) owner: String,
    pub(crate) comment: Option<String>,
    pub(crate) columns: Vec<StructureColumn>,
    pub(crate) indexes: Vec<StructureIndex>,
    pub(crate) constraints: Vec<StructureConstraint>,
    pub(crate) foreign_keys: Vec<StructureForeignKey>,
    pub(crate) ddl: Option<String>,
    pub(crate) ddl_notes: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StructureColumn {
    #[serde(flatten)]
    pub(crate) column: ColumnInfo,
    pub(crate) position: i16,
    pub(crate) comment: Option<String>,
    pub(crate) identity_generation: String,
    pub(crate) generation_kind: String,
    pub(crate) collation: Option<String>,
    pub(crate) identity_options: Option<String>,
    #[serde(skip)]
    pub(crate) is_local: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StructureIndex {
    pub(crate) name: String,
    pub(crate) method: String,
    pub(crate) columns: Vec<String>,
    pub(crate) included_columns: Vec<String>,
    pub(crate) unique: bool,
    pub(crate) primary: bool,
    pub(crate) valid: bool,
    pub(crate) predicate: Option<String>,
    pub(crate) definition: String,
    pub(crate) constraint_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StructureConstraint {
    pub(crate) name: String,
    pub(crate) kind: String,
    pub(crate) columns: Vec<String>,
    pub(crate) definition: String,
    pub(crate) validated: bool,
    pub(crate) deferrable: bool,
    pub(crate) initially_deferred: bool,
    #[serde(skip)]
    pub(crate) is_local: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StructureForeignKey {
    pub(crate) name: String,
    pub(crate) direction: String,
    pub(crate) source_schema: String,
    pub(crate) source_table: String,
    pub(crate) source_columns: Vec<String>,
    pub(crate) target_schema: String,
    pub(crate) target_table: String,
    pub(crate) target_columns: Vec<String>,
    pub(crate) on_update: String,
    pub(crate) on_delete: String,
    pub(crate) definition: String,
    pub(crate) validated: bool,
}

pub(super) struct RelationMetadata {
    pub(super) oid: u32,
    pub(super) kind: String,
    pub(super) owner: String,
    pub(super) comment: Option<String>,
    pub(super) persistence: String,
    pub(super) partition_key: Option<String>,
    pub(super) partition_bound: Option<String>,
    pub(super) parents: Vec<String>,
    pub(super) options: Vec<String>,
    pub(super) view_definition: Option<String>,
    pub(super) row_security: bool,
}
