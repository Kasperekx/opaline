import type {
  ColumnInfo,
  TableCellValue,
  TableChange,
  TableDataRow,
} from "../../shared/types/database";
import { initialColumnValue, validateColumnValue } from "./column-editor";
import type { InsertCellValue } from "./table-types";

export const MAX_TABLE_CHANGES = 500;
export type RowChange = {
  id: string;
  key: string;
  original: TableDataRow | null;
  values: InsertCellValue[];
  deleted: boolean;
};
export type ActiveCell = {
  key: string;
  column: number;
  before: InsertCellValue;
};

export function primaryKey(
  columns: ColumnInfo[],
  row: TableDataRow,
): TableCellValue[] {
  return columns.flatMap((column, index) =>
    column.primaryKey
      ? [{ column: column.name, value: row.values[index] }]
      : [],
  );
}

export function tableRowKey(
  columns: ColumnInfo[],
  row: TableDataRow,
  fallback = "",
) {
  const key = primaryKey(columns, row);
  return key.length ? `key:${JSON.stringify(key)}` : `readonly:${fallback}`;
}

export function changedValues(
  columns: ColumnInfo[],
  row: RowChange,
): TableCellValue[] {
  return columns.flatMap((column, index) => {
    const value = row.values[index];
    return !column.identity &&
      !column.generated &&
      value !== undefined &&
      (!row.original || value !== row.original.values[index])
      ? [{ column: column.name, value }]
      : [];
  });
}
export const hasRowChanges = (columns: ColumnInfo[], row: RowChange) =>
  !row.original || row.deleted || changedValues(columns, row).length > 0;

export function rowErrors(columns: ColumnInfo[], row: RowChange) {
  return columns.map((column, index) =>
    row.deleted ||
    column.identity ||
    column.generated ||
    (row.original && row.values[index] === row.original.values[index])
      ? null
      : !row.original &&
          column.primaryKey &&
          column.defaultValue === null &&
          row.values[index] === ""
        ? "Enter a primary key value for this new row."
        : validateColumnValue(column, row.values[index]),
  );
}

export function newRowChange(columns: ColumnInfo[]): RowChange {
  const id = crypto.randomUUID();
  return {
    id,
    key: `new:${id}`,
    original: null,
    deleted: false,
    values: columns.map((column) =>
      column.identity || column.generated || column.defaultValue !== null
        ? undefined
        : initialColumnValue(column),
    ),
  };
}

export function existingRowChange(
  columns: ColumnInfo[],
  row: TableDataRow,
): RowChange {
  return {
    id: crypto.randomUUID(),
    key: tableRowKey(columns, row),
    original: row,
    values: [...row.values],
    deleted: false,
  };
}

/** Duplicate the displayed draft, never its database identity or generated values. */
export function duplicateRowChange(
  columns: ColumnInfo[],
  values: InsertCellValue[],
): RowChange {
  const row = newRowChange(columns);
  row.values = columns.map((column, index) => {
    if (column.identity || column.generated) return undefined;
    if (column.primaryKey) return column.defaultValue !== null ? undefined : "";
    return values[index];
  });
  return row;
}

export function changeSetSummary(columns: ColumnInfo[], rows: RowChange[]) {
  const pending = rows.filter((row) => hasRowChanges(columns, row));
  return {
    rows: pending,
    updated: pending.filter((row) => row.original && !row.deleted).length,
    inserted: pending.filter((row) => !row.original).length,
    deleted: pending.filter((row) => row.deleted).length,
    fields: pending
      .filter((row) => row.original && !row.deleted)
      .reduce((count, row) => count + changedValues(columns, row).length, 0),
    invalid: pending.some((row) => rowErrors(columns, row).some(Boolean)),
  };
}

export function buildChanges(
  columns: ColumnInfo[],
  rows: RowChange[],
): TableChange[] {
  const summary = changeSetSummary(columns, rows);
  if (summary.rows.length > MAX_TABLE_CHANGES)
    throw new Error("Save at most 500 changed rows at a time.");
  if (summary.invalid)
    throw new Error("Fix the highlighted values before saving.");
  return summary.rows.map((row) => {
    if (!row.original)
      return {
        kind: "insert",
        id: row.id,
        values: changedValues(columns, row),
      };
    const key = primaryKey(columns, row.original);
    if (!key.length || !row.original.rowVersion)
      throw new Error("This row has no safe identity. Refresh before editing.");
    const identity = { id: row.id, key, rowVersion: row.original.rowVersion };
    return row.deleted
      ? { ...identity, kind: "delete" }
      : { ...identity, kind: "update", changes: changedValues(columns, row) };
  });
}

export function changeError(error: unknown): {
  kind: "rejected" | "unknown";
  message: string;
  rowId: string | null;
} {
  if (
    error &&
    typeof error === "object" &&
    "kind" in error &&
    "message" in error &&
    (error.kind === "rejected" || error.kind === "unknown") &&
    typeof error.message === "string"
  ) {
    return {
      kind: error.kind,
      message: error.message,
      rowId:
        "rowId" in error && typeof error.rowId === "string"
          ? error.rowId
          : null,
    };
  }
  // An unstructured IPC failure might occur after COMMIT; never suggest a blind retry.
  return {
    kind: "unknown",
    message:
      "The save outcome could not be confirmed. Verify the database before discarding this draft; do not retry it blindly.",
    rowId: null,
  };
}
