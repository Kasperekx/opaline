import type { ColumnInfo, TableFilter } from "../../shared/types/database";
import type { StructureForeignKey } from "../../shared/types/structure";

export type OpenRelatedTable = (
  schema: string,
  table: string,
  filters: TableFilter[],
) => void;
export function relatedFilters(
  relation: StructureForeignKey,
  columns: ColumnInfo[],
  values: (string | null)[],
): TableFilter[] | null {
  if (
    relation.direction !== "outgoing" ||
    !relation.sourceColumns.length ||
    relation.sourceColumns.length !== relation.targetColumns.length
  )
    return null;
  const filters: TableFilter[] = [];
  for (const [index, source] of relation.sourceColumns.entries()) {
    const value = values[columns.findIndex((column) => column.name === source)];
    if (value == null || value.length > 4096) return null;
    filters.push({
      column: relation.targetColumns[index],
      operator: "eq",
      value,
    });
  }
  return filters.length <= 20 ? filters : null;
}
