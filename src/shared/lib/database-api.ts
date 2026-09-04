import { invoke } from "@tauri-apps/api/core";
import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionInfo,
  DatabaseObject,
  QueryResult,
} from "../types/database";

export const isDesktopRuntime = () => "__TAURI_INTERNALS__" in window;

export const errorMessage = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
};

export const databaseApi = {
  connectionInfo: () => invoke<ConnectionInfo | null>("connection_info"),
  connect: (input: ConnectionConfig) =>
    invoke<ConnectionInfo>("connect_postgres", { input }),
  disconnect: () => invoke<void>("disconnect_postgres"),
  listObjects: () => invoke<DatabaseObject[]>("list_database_objects"),
  listColumns: (schema: string, table: string) =>
    invoke<ColumnInfo[]>("list_columns", { schema, table }),
  runQuery: (sql: string, maxRows = 500) =>
    invoke<QueryResult>("run_query", { sql, maxRows }),
};
