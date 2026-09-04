import type {
  QueryExecutionError,
  QueryResult,
} from "../../shared/types/database";

export type QueryTab = {
  id: string;
  title: string;
  sql: string;
  lastExecutedSql: string | null;
  result: QueryResult | null;
  error: QueryExecutionError | null;
};

export type QueryHistoryStatus =
  | "success"
  | "error"
  | "cancelled"
  | "timeout";

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
  fontSize: FontSizePreference;
  density: DensityPreference;
  maxRows: number;
  timeoutMs: number;
};
