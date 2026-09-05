import type {
  QueryExecutionError,
  QueryResult,
} from "../../shared/types/database";

export type QueryTab = {
  file?: { id: string; path: string; savedSql: string };
  kind: "query";
  id: string;
  title: string;
  sql: string;
  lastExecutedSql: string | null;
  result: QueryResult | null;
  error: QueryExecutionError | null;
};

export type TableTab = {
  kind: "table";
  id: string;
  title: string;
  schema: string;
  table: string;
  objectType: string;
};

export type WorkspaceTab = QueryTab | TableTab;

export type QueryHistoryStatus = "success" | "error" | "cancelled" | "timeout";

export type QueryHistoryEntry = {
  id: string;
  title: string;
  sql: string;
  database: string;
  executedAt: string;
  durationMs: number;
  rowCount: number;
  status: QueryHistoryStatus;
};

export type FontSizePreference = "comfortable" | "large";
export type DensityPreference = "comfortable" | "compact";

export type QueryPreferences = {
  historyEnabled: boolean;
  fontSize: FontSizePreference;
  density: DensityPreference;
  maxRows: number;
  timeoutMs: number;
};
