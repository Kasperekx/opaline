import type { ColumnInfo } from "../../shared/types/database";

export type ColumnEditorKind =
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "integer"
  | "json"
  | "number"
  | "text"
  | "time"
  | "uuid";

const integerTypes = new Set(["smallint", "integer", "bigint"]);
const numberTypes = ["numeric", "decimal", "real", "double precision"];

export function columnEditorKind(column: ColumnInfo): ColumnEditorKind {
  if (column.enumValues.length > 0) return "enum";
  const type = column.dataType.toLowerCase();
  if (type === "boolean") return "boolean";
  if (integerTypes.has(type)) return "integer";
  if (
    numberTypes.some(
      (candidate) => type === candidate || type.startsWith(`${candidate}(`),
    )
  ) {
    return "number";
  }
  if (type === "date") return "date";
  if (/^timestamp(?:\(\d+\))? without time zone$/.test(type)) return "datetime";
  if (/^time(?:\(\d+\))? without time zone$/.test(type)) return "time";
  if (type === "json" || type === "jsonb") return "json";
  if (type === "uuid") return "uuid";
  return "text";
}

export function initialColumnValue(column: ColumnInfo): string | null {
  if (column.nullable) return null;
  switch (columnEditorKind(column)) {
    case "boolean":
      return "false";
    case "enum":
      return column.enumValues[0] ?? "";
    default:
      return "";
  }
}

export function inputValue(column: ColumnInfo, value: string): string {
  return columnEditorKind(column) === "datetime"
    ? value.replace(" ", "T")
    : value;
}

export function databaseValue(column: ColumnInfo, value: string): string {
  return columnEditorKind(column) === "datetime"
    ? value.replace("T", " ")
    : value;
}

export function validateColumnValue(
  column: ColumnInfo,
  value: string | null | undefined,
): string | null {
  if (value === undefined) return null;
  if (value === null)
    return column.nullable ? null : `${column.name} cannot be NULL.`;

  switch (columnEditorKind(column)) {
    case "boolean":
      return value === "true" || value === "false"
        ? null
        : "Choose true or false.";
    case "enum":
      return column.enumValues.includes(value)
        ? null
        : "Choose one of the allowed values.";
    case "integer":
      return /^[+-]?\d+$/.test(value) ? null : "Enter a whole number.";
    case "number":
      return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
        ? null
        : "Enter a valid number.";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "Enter a valid date.";
    case "datetime":
      return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(
        value,
      )
        ? null
        : "Enter a valid date and time.";
    case "time":
      return /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
        ? null
        : "Enter a valid time.";
    case "json":
      try {
        JSON.parse(value);
        return null;
      } catch {
        return "Enter valid JSON.";
      }
    case "uuid":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
        ? null
        : "Enter a valid UUID.";
    case "text":
      return null;
  }
}

export function writableColumns(columns: ColumnInfo[]) {
  return columns.filter(
    (column) => !column.identity && !column.generated && !column.primaryKey,
  );
}
