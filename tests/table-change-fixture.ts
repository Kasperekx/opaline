import type {
  ColumnInfo,
  TableChangesRequest,
  TableChangesResult,
  TableDataPage,
} from "../src/shared/types/database";
const column = (
  name: string,
  dataType: string,
  extra: Partial<ColumnInfo> = {},
): ColumnInfo => ({
  name,
  dataType,
  nullable: false,
  defaultValue: null,
  primaryKey: false,
  identity: false,
  generated: false,
  enumValues: [],
  ...extra,
});
export const tableChangePage: TableDataPage = {
  page: 0,
  pageSize: 50,
  hasMore: true,
  editable: true,
  insertable: true,
  editabilityReason: null,
  insertabilityReason: null,
  columns: [
    column("id", "integer", { primaryKey: true }),
    column("name", "text"),
    column("note", "text", { nullable: true, defaultValue: "'default note'" }),
    column("enabled", "boolean"),
    column("payload", "jsonb", { defaultValue: "'{}'::jsonb" }),
    column("counter", "bigint", { nullable: true }),
  ],
  rows: [
    {
      values: [
        "1",
        "Ada",
        null,
        "true",
        '{"id":9007199254740993}',
        "9007199254740993",
      ],
      rowVersion: "10",
    },
    { values: ["2", "Grace", "note", "false", "{}", null], rowVersion: "11" },
  ],
};
// UI-only server simulation. Transaction guarantees are tested against real PostgreSQL in Rust.
export function applyFixtureChanges(
  page: TableDataPage,
  input: TableChangesRequest,
): TableChangesResult {
  const rows = structuredClone(page.rows);
  const result = input.changes.map((change) => {
    if (change.kind === "insert") {
      const row = {
        values: page.columns.map((column) => {
          const explicit = change.values.find(
            (value) => value.column === column.name,
          );
          return explicit
            ? explicit.value
            : column.name === "payload"
              ? "{}"
              : column.name === "note"
                ? "default note"
                : null;
        }),
        rowVersion: "12",
      };
      rows.push(row);
      return { id: change.id, row };
    }
    const index = rows.findIndex((row) =>
      change.key.every(
        (key) =>
          row.values[
            page.columns.findIndex((column) => column.name === key.column)
          ] === key.value,
      ),
    );
    if (index < 0)
      throw {
        kind: "rejected",
        message: "The row no longer exists.",
        rowId: change.id,
      };
    if (change.kind === "delete") {
      rows.splice(index, 1);
      return { id: change.id, row: null };
    }
    const row = { values: [...rows[index].values], rowVersion: "12" };
    change.changes.forEach((value) => {
      row.values[
        page.columns.findIndex((column) => column.name === value.column)
      ] = value.value;
    });
    rows[index] = row;
    return { id: change.id, row };
  });
  page.rows = rows;
  return { rows: result };
}
