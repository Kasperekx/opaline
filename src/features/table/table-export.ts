import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { ColumnInfo, TableDataRow } from "../../shared/types/database";

export type TableExportFormat = "csv" | "json";

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

export async function saveTableExport({
  schema,
  table,
  columns,
  rows,
  format,
}: TableExport) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${safeFilenamePart(schema)}-${safeFilenamePart(table)}-${date}.${format}`;
  const path = await save({
    defaultPath: filename,
    filters: [
      {
        name: format === "csv" ? "CSV data" : "JSON data",
        extensions: [format],
      },
    ],
  });
  if (!path) return null;

  const contents =
    format === "csv" ? serializeCsv(columns, rows) : serializeJson(columns, rows);
  await writeTextFile(path, contents);
  return path;
}

