import { invoke } from "@tauri-apps/api/core";
import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionInfo,
  DatabaseObject,
  DeleteTableRowRequest,
  QueryExecutionError,
  QueryResult,
  RunQueryOptions,
  TableDataPage,
  TableDataRow,
  TablePageRequest,
  UpdateTableRowRequest,
} from "../types/database";

export const isDesktopRuntime = () => "__TAURI_INTERNALS__" in window;

export const errorMessage = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
};

export const isQueryExecutionError = (
  error: unknown,
): error is QueryExecutionError => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Partial<QueryExecutionError>;
  return typeof candidate.kind === "string" && typeof candidate.message === "string";
};

export const databaseApi = {
  connectionInfo: () => invoke<ConnectionInfo | null>("connection_info"),
  connect: (input: ConnectionConfig) =>
    invoke<ConnectionInfo>("connect_postgres", { input }),
  disconnect: () => invoke<void>("disconnect_postgres"),
  listObjects: () => invoke<DatabaseObject[]>("list_database_objects"),
  listColumns: (schema: string, table: string) =>
    invoke<ColumnInfo[]>("list_columns", { schema, table }),
  runQuery: (sql: string, options: RunQueryOptions) =>
    invoke<QueryResult>("run_query", {
      sql,
      maxRows: options.maxRows,
      timeoutMs: options.timeoutMs,
    }),
  cancelQuery: () => invoke<boolean>("cancel_query"),
  loadTablePage: (input: TablePageRequest) =>
    invoke<TableDataPage>("load_table_page", { input }),
  updateTableRow: (input: UpdateTableRowRequest) =>
    invoke<TableDataRow>("update_table_row", { input }),
  deleteTableRow: (input: DeleteTableRowRequest) =>
    invoke<void>("delete_table_row", { input }),
};
