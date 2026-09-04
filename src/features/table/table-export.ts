import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type {
  ColumnInfo,
  TableDataRow,
  TableExportFormat as DatabaseTableExportFormat,
} from "../../shared/types/database";

export type TableExportFormat = DatabaseTableExportFormat;

type TableExport = {
  schema: string;
  table: string;
  columns: ColumnInfo[];
  rows: TableDataRow[];
  format: TableExportFormat;
};

const csvCell = (value: string | null) => {
  if (value === null) return "";
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

const serializeCsv = (columns: ColumnInfo[], rows: TableDataRow[]) => {
  const header = columns.map((column) => csvCell(column.name)).join(",");
  const body = rows.map((row) => row.values.map(csvCell).join(","));
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
};

const serializeJson = (columns: ColumnInfo[], rows: TableDataRow[]) =>
  `${JSON.stringify(
    rows.map((row) =>
      Object.fromEntries(
        columns.map((column, index) => [column.name, row.values[index] ?? null]),
      ),
    ),
    null,
    2,
  )}\n`;

const safeFilenamePart = (value: string) =>
  value.trim().replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "table";

export const tableExportFilename = (
  schema: string,
  table: string,
  format: TableExportFormat,
) => {
  const date = new Date().toISOString().slice(0, 10);
  return `${safeFilenamePart(schema)}-${safeFilenamePart(table)}-${date}.${format}`;
};

export const formatExportSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const chooseTableExportPath = (
  schema: string,
  table: string,
  format: TableExportFormat,
) =>
  save({
    defaultPath: tableExportFilename(schema, table, format),
    filters: [
      {
        name: format === "csv" ? "CSV data" : "JSON data",
        extensions: [format],
      },
    ],
  });

export async function saveTableExport({
  schema,
  table,
  columns,
  rows,
  format,
}: TableExport) {
  const path = await chooseTableExportPath(schema, table, format);
  if (!path) return null;

  const contents =
    format === "csv" ? serializeCsv(columns, rows) : serializeJson(columns, rows);
  await writeTextFile(path, contents);
  return path;
}
