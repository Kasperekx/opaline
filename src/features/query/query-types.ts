import type {
  QueryExecutionError,
  QueryResult,
  QueryExecutionMode,
  TableFilter,
} from "../../shared/types/database";

export type QueryTab = {
  // Explicit consent is tab-local and never persisted in recovery/history.
  executionMode?: QueryExecutionMode;
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
  initialFilters?: TableFilter[];
  kind: "table";
  id: string;
  title: string;
  schema: string;
  table: string;
  objectType: string;
};

export type DiagramTab = {
  kind: "diagram";
  id: string;
  title: string;
  focus?: { schema: string; name: string; request: number };
};
export type SchemaTab = {
  kind: "schema";
  id: string;
  title: string;
  schema: string;
  table: string | null;
  drop?: boolean;
};
export type WorkspaceTab = QueryTab | TableTab | DiagramTab | SchemaTab;

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
