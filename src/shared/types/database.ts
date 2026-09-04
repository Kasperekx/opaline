export type SslMode = "prefer" | "require" | "disable";

export type ConnectionConfig = {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
};

export type ConnectionInfo = Omit<ConnectionConfig, "password" | "sslMode"> & {
  serverVersion: string;
};

export type DatabaseObject = {
  schema: string;
  name: string;
  objectType: string;
  estimatedRows: number;
};

export type ColumnInfo = {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  primaryKey: boolean;
};

export type QueryResultSet = {
  columns: string[];
  rows: Array<Array<string | null>>;
  affectedRows: number;
  truncated: boolean;
};

export type QueryResult = {
  resultSets: QueryResultSet[];
  durationMs: number;
};

export type QueryErrorKind =
  | "busy"
  | "cancelled"
  | "database"
  | "timeout"
  | "validation";

export type QueryExecutionError = {
  kind: QueryErrorKind;
  message: string;
  detail: string | null;
  hint: string | null;
  code: string | null;
  position: number | null;
};

export type RunQueryOptions = {
  maxRows: number;
  timeoutMs: number;
};
