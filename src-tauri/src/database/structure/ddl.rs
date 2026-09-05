use super::models::{RelationMetadata, StructureColumn, StructureConstraint, StructureIndex};
use crate::database::table_data::{qualified_name, quote_identifier};

pub(super) fn build(
    schema: &str,
    table: &str,
    metadata: &RelationMetadata,
    columns: &[StructureColumn],
    indexes: &[StructureIndex],
    constraints: &[StructureConstraint],
) -> (Option<String>, Vec<String>) {
    let mut notes = vec![
        "Structure preview: dependencies must already exist. Ownership, grants, triggers and policies are not included. Use pg_dump for a complete backup.".into(),
    ];
    if metadata.kind == "f" {
        notes.push("CREATE FOREIGN TABLE is not generated because server and foreign-data wrapper options require a separate export.".into());
        return (None, notes);
    }
    if metadata.row_security {
        notes.push("Row-level security is enabled on this table. Its policies and security settings are not included.".into());
    }
    if metadata.partition_bound.is_some() || !metadata.parents.is_empty() {
        notes.push("Parent tables must exist. Partition attachments and inherited overrides are not included in this preview.".into());
        // A flattened CREATE TABLE would misrepresent partitioning or inheritance.
        return (None, notes);
    }
    let relation = qualified_name(schema, table);
    let object_keyword = match metadata.kind.as_str() {
        "v" => "VIEW",
        "m" => "MATERIALIZED VIEW",
        _ => "TABLE",
    };
    let mut statements = Vec::new();
    if let Some(definition) = &metadata.view_definition {
        let names = columns
            .iter()
            .map(|column| quote_identifier(&column.column.name))
            .collect::<Vec<_>>()
            .join(", ");
        let options = relation_options(&metadata.options);
        let no_data = if metadata.kind == "m" {
            "\nWITH NO DATA"
        } else {
            ""
        };
        statements.push(format!(
            "CREATE {object_keyword} {relation} ({names}){options} AS\n{}{no_data};",
            definition.trim().trim_end_matches(';'),
        ));
    } else {
        let persistence = match metadata.persistence.as_str() {
            "u" => "UNLOGGED ",
            "t" => "TEMPORARY ",
            _ => "",
        };
        let definitions = columns
            .iter()
            .filter(|column| column.is_local)
            .map(column_definition)
            .collect::<Vec<_>>();
        let partition = metadata
            .partition_key
            .as_ref()
            .map(|key| format!("\nPARTITION BY {key}"))
            .unwrap_or_default();
        statements.push(format!(
            "CREATE {persistence}TABLE {relation} (\n{}\n){partition}{};",
            definitions.join(",\n"),
            relation_options(&metadata.options),
        ));
        for constraint in constraints
            .iter()
            .filter(|item| item.is_local && item.kind != "n")
        {
            statements.push(format!(
                "ALTER TABLE {relation} ADD CONSTRAINT {} {};",
                quote_identifier(&constraint.name),
                constraint.definition,
            ));
        }
    }
    for index in indexes
        .iter()
        .filter(|index| index.constraint_name.is_none())
    {
        statements.push(format!("{};", index.definition.trim_end_matches(';')));
    }
    if let Some(comment) = &metadata.comment {
        statements.push(format!(
            "COMMENT ON {object_keyword} {relation} IS {};",
            literal(comment)
        ));
    }
    for column in columns {
        if let Some(comment) = &column.comment {
            statements.push(format!(
                "COMMENT ON COLUMN {relation}.{} IS {};",
                quote_identifier(&column.column.name),
                literal(comment),
            ));
        }
    }
    (Some(format!("-- Structure preview. Dependencies, grants, triggers and policies are not included.\n\n{}\n", statements.join("\n\n"))), notes)
}

fn column_definition(column: &StructureColumn) -> String {
    let info = &column.column;
    let mut definition = format!("    {} {}", quote_identifier(&info.name), info.data_type);
    if let Some(collation) = &column.collation {
        definition.push_str(&format!(" COLLATE {collation}"));
    }
    if info.identity {
        let generation = if column.identity_generation == "a" {
            "ALWAYS"
        } else {
            "BY DEFAULT"
        };
        definition.push_str(&format!(" GENERATED {generation} AS IDENTITY"));
        if let Some(options) = &column.identity_options {
            definition.push_str(&format!(" ({options})"));
        }
    } else if info.generated {
        if let Some(expression) = &info.default_value {
            let storage = if column.generation_kind == "v" {
                "VIRTUAL"
            } else {
                "STORED"
            };
            definition.push_str(&format!(" GENERATED ALWAYS AS ({expression}) {storage}"));
        }
    } else if let Some(default) = &info.default_value {
        definition.push_str(&format!(" DEFAULT {default}"));
    }
    if !info.nullable {
        definition.push_str(" NOT NULL");
    }
    definition
}

fn relation_options(options: &[String]) -> String {
    if options.is_empty() {
        return String::new();
    }
    let options = options
        .iter()
        .filter_map(|option| option.split_once('='))
        .map(|(name, value)| format!("{} = {}", quote_identifier(name), literal(value)))
        .collect::<Vec<_>>()
        .join(", ");
    format!("\nWITH ({options})")
}

fn literal(value: &str) -> String {
    format!("E'{}'", value.replace('\\', "\\\\").replace('\'', "''"))
}
