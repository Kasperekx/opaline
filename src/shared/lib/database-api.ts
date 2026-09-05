import { Channel, invoke } from "@tauri-apps/api/core";
import type { RelationStructure } from "../types/structure";
import type {
  ColumnInfo,
  TableChangesRequest,
  TableChangesResult,
  TableRowSnapshot,
  TableCellValue,
  DatabaseObject,
  DeleteTableRowRequest,
  DeleteTableRowsRequest,
  ExportTableDataRequest,
  InsertTableRowRequest,
  QueryExecutionError,
  QueryResult,
  RunQueryOptions,
  TableDataPage,
  TableDataRow,
  TableExportProgress,
  TableExportResult,
  TableMutationResult,
  TablePageRequest,
  UpdateTableRowRequest,
  UpdateTableRowsRequest,
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
  return (
    typeof candidate.kind === "string" && typeof candidate.message === "string"
  );
};

export const createDatabaseApi = (sessionId: string) => {
  const scopedInvoke = <T>(
    command: string,
    args: Record<string, unknown> = {},
  ) => invoke<T>(command, { ...args, sessionId });
  return {
    completionCatalog: () =>
      scopedInvoke<{ schema: string; table: string; column: string }[]>(
        "sql_completion_catalog",
      ),
    inspectRelation: (schema: string, table: string) =>
      scopedInvoke<RelationStructure>("inspect_relation", { schema, table }),
    listObjects: () => scopedInvoke<DatabaseObject[]>("list_database_objects"),
    listColumns: (schema: string, table: string) =>
      scopedInvoke<ColumnInfo[]>("list_columns", { schema, table }),
    runQuery: (sql: string, options: RunQueryOptions) =>
      scopedInvoke<QueryResult>("run_query", {
        sql,
        maxRows: options.maxRows,
        timeoutMs: options.timeoutMs,
        executionMode: options.executionMode ?? "atomic",
      }),
    cancelQuery: () => scopedInvoke<boolean>("cancel_query"),
    loadTablePage: (input: TablePageRequest) =>
      scopedInvoke<TableDataPage>("load_table_page", { input }),
    loadTableRow: (input: {
      schema: string;
      table: string;
      key: TableCellValue[];
    }) => scopedInvoke<TableRowSnapshot>("load_table_row", { input }),
    applyTableChanges: (input: TableChangesRequest) =>
      scopedInvoke<TableChangesResult>("apply_table_changes", { input }),
    insertTableRow: (input: InsertTableRowRequest) =>
      scopedInvoke<TableDataRow>("insert_table_row", { input }),
    updateTableRow: (input: UpdateTableRowRequest) =>
      scopedInvoke<TableDataRow>("update_table_row", { input }),
    deleteTableRow: (input: DeleteTableRowRequest) =>
      scopedInvoke<void>("delete_table_row", { input }),
    deleteTableRows: (input: DeleteTableRowsRequest) =>
      scopedInvoke<TableMutationResult>("delete_table_rows", { input }),
    updateTableRows: (input: UpdateTableRowsRequest) =>
      scopedInvoke<TableMutationResult>("update_table_rows", { input }),
    exportTableData: (
      input: ExportTableDataRequest,
      onProgress: (progress: TableExportProgress) => void,
    ) => {
      const progressChannel = new Channel<TableExportProgress>(onProgress);
      return scopedInvoke<TableExportResult>("export_table_data", {
        input,
        onProgress: progressChannel,
      });
    },
  };
};
