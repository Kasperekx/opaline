import type { RelationStructure } from "../../shared/types/structure";

/** Search displayed metadata locally; never issue a database query while typing. */
export function filterStructure(
  data: RelationStructure,
  input: string,
): RelationStructure {
  const query = input.trim().toLocaleLowerCase();
  if (!query) return data;
  const matches = (values: (string | null)[]) =>
    values.join(" ").toLocaleLowerCase().includes(query);
  return {
    ...data,
    columns: data.columns.filter((column) =>
      matches([
        column.name,
        column.dataType,
        column.comment,
        column.defaultValue,
        column.collation,
        ...column.enumValues,
      ]),
    ),
    indexes: data.indexes.filter((index) =>
      matches([
        index.name,
        index.method,
        index.definition,
        index.constraintName,
        index.predicate,
        ...index.columns,
        ...index.includedColumns,
      ]),
    ),
    constraints: data.constraints.filter((constraint) =>
      matches([constraint.name, constraint.definition, ...constraint.columns]),
    ),
    foreignKeys: data.foreignKeys.filter((key) =>
      matches([
        key.name,
        key.direction,
        key.sourceSchema,
        key.sourceTable,
        key.targetSchema,
        key.targetTable,
        key.onUpdate,
        key.onDelete,
        key.definition,
        ...key.sourceColumns,
        ...key.targetColumns,
      ]),
    ),
  };
}
