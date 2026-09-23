use super::{
    models::{FilterOperator, TableFilter},
    table_data::{quote_identifier, typed_parameter, TableMetadata},
};

/// Shared by paged reads and streaming exports. Values never enter SQL text.
pub(crate) fn conditions(
    metadata: &TableMetadata,
    filters: &[TableFilter],
    first_parameter: usize,
) -> Result<(String, Vec<String>), String> {
    if filters.len() > 20 {
        return Err("Use at most 20 column filters.".into());
    }
    let mut clauses = Vec::new();
    let mut values = Vec::new();
    for filter in filters {
        if filter.value.len() > 4096 || filter.value.contains('\0') {
            return Err("A filter value exceeds the supported limit.".into());
        }
        let column = metadata
            .columns
            .iter()
            .find(|column| column.name == filter.column)
            .ok_or("A filtered column no longer exists. Remove or edit the filter.")?;
        let name = quote_identifier(&column.name);
        let index = first_parameter + values.len();
        let clause = match filter.operator {
            FilterOperator::IsNull => format!("{name} IS NULL"),
            FilterOperator::IsNotNull => format!("{name} IS NOT NULL"),
            FilterOperator::Contains => {
                values.push(filter.value.clone());
                format!("strpos(lower({name}::text), lower(${index}::text)) > 0")
            }
            _ => {
                let operator = match filter.operator {
                    FilterOperator::Eq => "=",
                    FilterOperator::Ne => "<>",
                    FilterOperator::Gt => ">",
                    FilterOperator::Gte => ">=",
                    FilterOperator::Lt => "<",
                    FilterOperator::Lte => "<=",
                    _ => unreachable!(),
                };
                values.push(filter.value.clone());
                format!("{name} {operator} {}", typed_parameter(index, column))
            }
        };
        clauses.push(clause);
    }
    Ok((
        if clauses.is_empty() {
            String::new()
        } else {
            format!(" AND ({})", clauses.join(" AND "))
        },
        values,
    ))
}
