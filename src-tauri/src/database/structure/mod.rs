mod catalog;
mod ddl;
pub(crate) mod models;

#[cfg(test)]
mod tests;

use tokio_postgres::Client;

use crate::database::table_data::validate_relation_name;
use models::RelationStructure;

pub(crate) async fn inspect(
    client: &Client,
    schema: &str,
    table: &str,
) -> Result<RelationStructure, String> {
    validate_relation_name(schema, table)?;
    let metadata = catalog::relation(client, schema, table).await?;
    let (columns, indexes, constraints, foreign_keys) = tokio::try_join!(
        catalog::columns(client, schema, table, metadata.oid),
        catalog::indexes(client, metadata.oid),
        catalog::constraints(client, metadata.oid),
        catalog::foreign_keys(client, metadata.oid),
    )?;
    let (ddl, ddl_notes) = ddl::build(schema, table, &metadata, &columns, &indexes, &constraints);
    let object_type = match metadata.kind.as_str() {
        "p" => "Partitioned table",
        "v" => "View",
        "m" => "Materialized view",
        "f" => "Foreign table",
        _ if metadata.partition_bound.is_some() => "Partition",
        _ => "Table",
    }
    .into();
    Ok(RelationStructure {
        schema: schema.into(),
        name: table.into(),
        object_type,
        owner: metadata.owner,
        comment: metadata.comment,
        columns,
        indexes,
        constraints,
        foreign_keys,
        ddl,
        ddl_notes,
    })
}
