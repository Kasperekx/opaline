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
  identity: boolean;
  generated: boolean;
};

export type SortDirection = "asc" | "desc";

export type TableSort = {
  column: string;
  direction: SortDirection;
};

export type TablePageRequest = {
  schema: string;
  table: string;
  page: number;
  pageSize: number;
  filter: string | null;
  sort: TableSort | null;
};

export type TableDataRow = {
  values: Array<string | null>;
  rowVersion: string | null;
};

export type TableDataPage = {
  columns: ColumnInfo[];
  rows: TableDataRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  editable: boolean;
  editabilityReason: string | null;
};

export type TableCellValue = {
  column: string;
  value: string | null;
};

export type UpdateTableRowRequest = {
  schema: string;
  table: string;
  key: TableCellValue[];
  changes: TableCellValue[];
  rowVersion: string;
};

export type DeleteTableRowRequest = Omit<UpdateTableRowRequest, "changes">;

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
