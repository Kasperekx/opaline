use std::collections::HashSet;

use tokio_postgres::Client;

use super::{
    models::{
        DeleteTableRowsRequest, TableMutationResult, TableRowIdentity, UpdateTableRowsRequest,
    },
    table_data::{
        ensure_editable, qualified_name, quote_identifier, sql_parameters, table_metadata,
        typed_parameter, validate_relation_name, validated_changes, validated_key, TableMetadata,
    },
};

pub(crate) const MAX_BULK_MUTATION_ROWS: usize = 500;

pub(crate) async fn delete_rows(
    client: &Client,
    request: &DeleteTableRowsRequest,
) -> Result<TableMutationResult, String> {
    validate_relation_name(&request.schema, &request.table)?;
    let metadata = table_metadata(client, &request.schema, &request.table).await?;
    ensure_editable(&metadata)?;
    let qualified_table = qualified_name(&request.schema, &request.table);
    let targets = build_bulk_targets(&metadata, &qualified_table, &request.rows)?;
    let sql = format!(
        "{}, deleted AS (\
           DELETE FROM {qualified_table} AS source USING targets \
           WHERE {} AND source.xmin = targets.{}::xid \
             AND (SELECT count(*) FROM matched) = {} \
           RETURNING 1\
         ) SELECT count(*)::bigint FROM deleted",
        targets.with_clause, targets.match_predicate, targets.version_column, targets.row_count,
    );
    execute_bulk_mutation(
        client,
        &sql,
        &targets.parameters,
        targets.row_count,
        "delete",
    )
    .await
}

pub(crate) async fn update_rows(
    client: &Client,
    request: &UpdateTableRowsRequest,
) -> Result<TableMutationResult, String> {
    validate_relation_name(&request.schema, &request.table)?;
    let metadata = table_metadata(client, &request.schema, &request.table).await?;
    ensure_editable(&metadata)?;
    let mut changes = validated_changes(&metadata, std::slice::from_ref(&request.change))?;
    let (column, value) = changes
        .pop()
        .ok_or_else(|| "Choose a column to update.".to_string())?;
    if column.primary_key {
        return Err("Primary keys cannot be changed in a bulk update.".into());
    }

    let qualified_table = qualified_name(&request.schema, &request.table);
    let mut targets = build_bulk_targets(&metadata, &qualified_table, &request.rows)?;
    targets.parameters.push(value);
    let change_parameter = typed_parameter(targets.parameters.len(), column);
    let sql = format!(
        "{}, updated AS (\
           UPDATE {qualified_table} AS source \
           SET {} = {change_parameter} FROM targets \
           WHERE {} AND source.xmin = targets.{}::xid \
             AND (SELECT count(*) FROM matched) = {} \
           RETURNING 1\
         ) SELECT count(*)::bigint FROM updated",
        targets.with_clause,
        quote_identifier(&column.name),
        targets.match_predicate,
        targets.version_column,
        targets.row_count,
    );
    execute_bulk_mutation(
        client,
        &sql,
        &targets.parameters,
        targets.row_count,
        "update",
    )
    .await
}

struct BulkTargets {
    with_clause: String,
    match_predicate: String,
    version_column: String,
    parameters: Vec<Option<String>>,
    row_count: usize,
}

fn build_bulk_targets(
    metadata: &TableMetadata,
    qualified_table: &str,
    rows: &[TableRowIdentity],
) -> Result<BulkTargets, String> {
    if rows.is_empty() {
        return Err("Select at least one row.".into());
    }
    if rows.len() > MAX_BULK_MUTATION_ROWS {
        return Err(format!(
            "Bulk changes are limited to {MAX_BULK_MUTATION_ROWS} rows at a time."
        ));
    }

    let primary_key = metadata.primary_key();
    let mut version_name = "__opaline_row_version".to_string();
    while primary_key.iter().any(|column| column.name == version_name) {
        version_name.push('_');
    }
    let version_column = quote_identifier(&version_name);
    let mut parameters = Vec::new();
    let mut identities = HashSet::new();
    let mut value_rows = Vec::with_capacity(rows.len());

    for row in rows {
        if row.row_version.trim().is_empty() {
            return Err("A selected row is missing its version. Refresh and try again.".into());
        }
        let key = validated_key(metadata, &row.key)?;
        let identity = key
            .iter()
            .map(|(_, value)| value.clone())
            .collect::<Vec<_>>();
        if !identities.insert(identity) {
            return Err("The bulk change contains the same row more than once.".into());
        }

        let mut placeholders = Vec::with_capacity(key.len() + 1);
        for (column, value) in key {
            parameters.push(value);
            placeholders.push(typed_parameter(parameters.len(), column));
        }
        parameters.push(Some(row.row_version.clone()));
        placeholders.push(format!("${}::text", parameters.len()));
        value_rows.push(format!("({})", placeholders.join(", ")));
    }

    let target_columns = primary_key
        .iter()
        .map(|column| quote_identifier(&column.name))
        .chain(std::iter::once(version_column.clone()))
        .collect::<Vec<_>>()
        .join(", ");
    let match_predicate = primary_key
        .iter()
        .map(|column| {
            let name = quote_identifier(&column.name);
            format!("source.{name} IS NOT DISTINCT FROM targets.{name}")
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    let with_clause = format!(
        "WITH targets ({target_columns}) AS (VALUES {}), \
         matched AS (\
           SELECT 1 FROM {qualified_table} AS source \
           JOIN targets ON {match_predicate} \
           WHERE source.xmin = targets.{version_column}::xid\
         )",
        value_rows.join(", ")
    );

    Ok(BulkTargets {
        with_clause,
        match_predicate,
        version_column,
        parameters,
        row_count: rows.len(),
    })
}

async fn execute_bulk_mutation(
    client: &Client,
    sql: &str,
    parameters: &[Option<String>],
    expected_rows: usize,
    operation: &str,
) -> Result<TableMutationResult, String> {
    let parameter_refs = sql_parameters(parameters);
    let affected_rows: i64 = client
        .query_one(sql, &parameter_refs)
        .await
        .map_err(|error| format!("Could not {operation} selected rows: {error}"))?
        .get(0);
    if affected_rows != expected_rows as i64 {
        return Err(
            "At least one selected row changed or was deleted. Nothing was written; refresh and try again."
                .into(),
        );
    }
    Ok(TableMutationResult {
        affected_rows: affected_rows as u64,
    })
}
