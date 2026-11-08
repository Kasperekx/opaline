import { validateColumnValue } from "../../src/features/table/column-editor.ts";
import type {
  ConnectionProfile,
  SessionInfo,
} from "../../src/features/connections/connection-types";
import type {
  ColumnInfo,
  TableCellValue,
  TableChangesRequest,
  TableChangesResult,
  TableDataPage,
  TableDataRow,
  TableFilter,
  TablePageRequest,
  TableRowSnapshot,
} from "../../src/shared/types/database";

export const demoProfiles: ConnectionProfile[] = (
  ["local", "staging", "production"] as const
).map((environment) => ({
  id: `website-demo-${environment}`,
  workspaceId: "website-demo-workspace",
  name: `Atlas · ${environment === "local" ? "Development" : environment === "staging" ? "Staging" : "Production"}`,
  host: `${environment}.example.test`,
  port: 5432,
  database: "atlas_demo",
  username: "demo",
  sslMode: "require",
  caPath: null,
  environment,
  readOnly: environment !== "local",
  credentialId: null,
}));

export const demoSession = (profile: ConnectionProfile): SessionInfo => ({
  ...profile,
  profileId: profile.id,
  serverVersion: "Browser demo · no database connection",
});

const storageKey = "opaline.website-demo.v1";
const columns: ColumnInfo[] = [
  { name: "id", dataType: "integer", identity: true, primaryKey: true },
  { name: "name", dataType: "text" },
  {
    name: "role",
    dataType: "member_role",
    enumValues: ["owner", "editor", "viewer"],
    defaultValue: "'viewer'::member_role",
  },
  { name: "active", dataType: "boolean", defaultValue: "true" },
  {
    name: "metadata",
    dataType: "jsonb",
    nullable: true,
    defaultValue: "'{}'::jsonb",
  },
].map((column) => ({
  nullable: false,
  defaultValue: null,
  primaryKey: false,
  identity: false,
  generated: false,
  enumValues: [],
  ...column,
}));

// Fictional sample members; never copied from a connected database.
const sampleRows: TableDataRow[] = [
  ["1", "Alex Morgan", "owner", "true", '{"team":"Platform","timezone":"UTC"}'],
  [
    "2",
    "Sam Rivera",
    "editor",
    "true",
    '{"team":"Product","timezone":"UTC+1"}',
  ],
  ["3", "Jordan Lee", "editor", "true", '{"team":"Design","timezone":"UTC-5"}'],
  ["4", "Casey Quinn", "viewer", "false", null],
  [
    "5",
    "Riley Chen",
    "editor",
    "true",
    '{"team":"Platform","onboarding":true}',
  ],
  [
    "6",
    "Taylor Kim",
    "viewer",
    "true",
    '{"team":"Operations","timezone":"UTC+9"}',
  ],
  [
    "7",
    "Avery Blake",
    "editor",
    "true",
    '{"team":"Product","interests":["SQL","Rust"]}',
  ],
  [
    "8",
    "Jamie Park",
    "viewer",
    "false",
    '{"team":"Design","notifications":false}',
  ],
].map((values) => ({ values, rowVersion: "1" }));

type State = {
  version: 1;
  nextId: number;
  revision: number;
  rows: TableDataRow[];
};
const initialState = (): State => ({
  version: 1,
  nextId: 9,
  revision: 1,
  rows: structuredClone(sampleRows),
});
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function reject(message: string, rowId: string | null = null): never {
  throw Object.assign(new Error(message), { kind: "rejected", rowId });
}
const columnIndex = (name: string) => {
  const index = columns.findIndex((column) => column.name === name);
  if (index < 0) reject("This column is not part of the demo.");
  return index;
};
const validValue = (value: unknown, index: number) =>
  (value === null ||
    (typeof value === "string" &&
      value.length <= 4096 &&
      !value.includes("\0"))) &&
  validateColumnValue(columns[index], value as string | null) === null;

function validState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const state = value as State;
  if (
    state.version !== 1 ||
    !Number.isSafeInteger(state.nextId) ||
    state.nextId < 1 ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 1 ||
    !Array.isArray(state.rows) ||
    state.rows.length > 50
  )
    return false;
  const ids = new Set<string>();
  return state.rows.every((row) => {
    if (
      !row ||
      !Array.isArray(row.values) ||
      row.values.length !== columns.length ||
      !row.values.every(validValue) ||
      typeof row.rowVersion !== "string" ||
      !/^[1-9]\d*$/.test(row.rowVersion) ||
      Number(row.rowVersion) > state.revision
    )
      return false;
    const id = row.values[0];
    if (
      !id ||
      !/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      Number(id) >= state.nextId ||
      ids.has(id)
    )
      return false;
    ids.add(id);
    return true;
  });
}

function rowKey(key: TableCellValue[]): string {
  if (
    !Array.isArray(key) ||
    key.length !== 1 ||
    key[0]?.column !== "id" ||
    typeof key[0].value !== "string" ||
    !/^[1-9]\d*$/.test(key[0].value)
  )
    reject("A valid primary key is required.");
  return key[0].value as string;
}

function setValues(row: TableDataRow, values: TableCellValue[]) {
  if (!Array.isArray(values) || values.length > columns.length)
    reject("Invalid demo values.");
  const names = new Set<string>();
  for (const item of values) {
    if (!item || typeof item.column !== "string")
      reject("Invalid demo column.");
    const index = columnIndex(item.column);
    if (index === 0 || names.has(item.column))
      reject("Identity keys cannot be edited.");
    if (!validValue(item.value, index))
      reject(`Invalid value for ${item.column}.`);
    names.add(item.column);
    row.values[index] = item.value;
  }
}

function compare(left: string, right: string, index: number) {
  return index === 0
    ? Number(left) - Number(right)
    : left.localeCompare(right, "en");
}

function matches(row: TableDataRow, filter: TableFilter) {
  const index = columnIndex(filter.column);
  const value = row.values[index];
  if (filter.operator === "is_null") return value === null;
  if (filter.operator === "is_not_null") return value !== null;
  if (value === null) return false;
  const comparison = compare(value, filter.value, index);
  switch (filter.operator) {
    case "eq":
      return value === filter.value;
    case "ne":
      return value !== filter.value;
    case "contains":
      return value.toLowerCase().includes(filter.value.toLowerCase());
    case "gt":
      return comparison > 0;
    case "gte":
      return comparison >= 0;
    case "lt":
      return comparison < 0;
    case "lte":
      return comparison <= 0;
    default:
      return reject("This filter is not supported in the demo.");
  }
}

export function createDemoStore(storage: StoragePort | null) {
  let state = initialState();
  let blocked = false;
  let warning: string | null = storage
    ? null
    : "Browser storage is unavailable. Changes last until this demo is closed.";
  try {
    const saved = storage?.getItem(storageKey);
    if (saved !== null && saved !== undefined) {
      const parsed: unknown =
        saved.length <= 1_100_000 ? JSON.parse(saved) : null;
      if (!validState(parsed)) throw new Error("Invalid saved demo");
      state = parsed;
    }
  } catch {
    blocked = true;
    warning =
      "Saved demo data could not be read. Changes stay in memory; reset the demo to replace it.";
  }
  const persist = () => {
    if (!storage || blocked) return;
    try {
      storage.setItem(storageKey, JSON.stringify(state));
      warning = null;
    } catch {
      warning =
        "Browser storage is full or unavailable. Changes are kept in memory only.";
    }
  };
  return {
    warning: () => warning,
    reset() {
      state = initialState();
      try {
        storage?.removeItem(storageKey);
        blocked = false;
        warning = storage
          ? null
          : "Browser storage is unavailable. Changes last until this demo is closed.";
      } catch {
        blocked = true;
        warning =
          "The demo was reset in memory, but saved browser data could not be removed.";
      }
    },
    invoke(
      command: string,
      args: Record<string, unknown> = {},
    ): TableDataPage | TableChangesResult | TableRowSnapshot {
      if (
        !["load_table_page", "apply_table_changes", "load_table_row"].includes(
          command,
        )
      )
        reject(
          "This action is not available in the browser demo. No database was contacted.",
        );
      const profile = demoProfiles.find((item) => item.id === args.sessionId);
      if (!profile) reject("Unknown demo connection.");
      const input = args.input as TablePageRequest &
        TableChangesRequest & { key: TableCellValue[] };
      if (!input || input.schema !== "public" || input.table !== "team_members")
        reject("Only public.team_members is available in this demo.");
      // Each environment is separate; only the local sample can be changed.
      const rows = profile.readOnly ? sampleRows : state.rows;
      if (command === "load_table_row") {
        const id = rowKey(input.key);
        return {
          columns: columns.map((column) => column.name),
          row: structuredClone(
            rows.find((row) => row.values[0] === id) ?? null,
          ),
        };
      }
      if (command === "load_table_page") {
        if (
          !Number.isInteger(input.page) ||
          input.page < 0 ||
          input.page > 1e6 ||
          ![25, 50, 100].includes(input.pageSize) ||
          !(
            input.filter === null ||
            (typeof input.filter === "string" && input.filter.length <= 1000)
          ) ||
          (input.conditions !== undefined &&
            (!Array.isArray(input.conditions) || input.conditions.length > 20))
        )
          reject("Invalid demo page request.");
        for (const filter of input.conditions ?? []) {
          if (
            !filter ||
            typeof filter.column !== "string" ||
            typeof filter.value !== "string" ||
            filter.value.length > 4096 ||
            ![
              "eq",
              "ne",
              "contains",
              "gt",
              "gte",
              "lt",
              "lte",
              "is_null",
              "is_not_null",
            ].includes(filter.operator)
          )
            reject("Invalid demo filter.");
          columnIndex(filter.column);
        }
        const search = input.filter?.toLowerCase() ?? "";
        const filtered = rows.filter(
          (row) =>
            row.values.some((value) => value?.toLowerCase().includes(search)) &&
            (input.conditions ?? []).every((filter) => matches(row, filter)),
        );
        if (input.sort !== null) {
          if (!input.sort || !["asc", "desc"].includes(input.sort.direction))
            reject("Invalid demo sort.");
          const index = columnIndex(input.sort.column);
          const direction = input.sort.direction === "asc" ? 1 : -1;
          filtered.sort((a, b) => {
            const left = a.values[index],
              right = b.values[index];
            return (
              direction *
              (left === right
                ? 0
                : left === null
                  ? 1
                  : right === null
                    ? -1
                    : compare(left, right, index))
            );
          });
        }
        return {
          columns: structuredClone(columns),
          rows: structuredClone(
            filtered.slice(
              input.page * input.pageSize,
              (input.page + 1) * input.pageSize,
            ),
          ),
          page: input.page,
          pageSize: input.pageSize,
          hasMore: filtered.length > (input.page + 1) * input.pageSize,
          editable: !profile.readOnly,
          insertable: !profile.readOnly,
          editabilityReason: profile.readOnly
            ? "This sample environment is read-only. Try Development to edit."
            : null,
          insertabilityReason: profile.readOnly
            ? "This sample environment is read-only. Try Development to edit."
            : null,
        };
      }
      if (profile.readOnly) reject("This sample connection is read-only.");
      if (
        !Array.isArray(input.changes) ||
        input.changes.length === 0 ||
        input.changes.length > 50
      )
        reject("Save between 1 and 50 row changes in this demo.");
      const next = structuredClone(state);
      const result: TableChangesResult = { rows: [] };
      const changeIds = new Set<string>();
      const touched = new Set<string>();
      next.revision++;
      for (const change of input.changes) {
        if (
          !change ||
          typeof change.id !== "string" ||
          !change.id ||
          changeIds.has(change.id)
        )
          reject("Invalid change identifier.");
        changeIds.add(change.id);
        if (change.kind === "insert") {
          const row: TableDataRow = {
            values: [String(next.nextId++), "", "viewer", "true", "{}"],
            rowVersion: String(next.revision),
          };
          setValues(row, change.values);
          if (!change.values.some((value) => value.column === "name"))
            reject("A name is required for new sample rows.", change.id);
          next.rows.push(row);
          result.rows.push({ id: change.id, row });
        } else if (change.kind === "update" || change.kind === "delete") {
          const id = rowKey(change.key);
          const index = next.rows.findIndex((row) => row.values[0] === id);
          if (
            touched.has(id) ||
            index < 0 ||
            next.rows[index].rowVersion !== change.rowVersion
          )
            reject(
              "The sample row changed or was removed. Refresh before trying again.",
              change.id,
            );
          touched.add(id);
          if (change.kind === "delete") {
            next.rows.splice(index, 1);
            result.rows.push({ id: change.id, row: null });
          } else {
            setValues(next.rows[index], change.changes);
            next.rows[index].rowVersion = String(next.revision);
            result.rows.push({ id: change.id, row: next.rows[index] });
          }
        } else reject("Unsupported demo change.");
      }
      if (next.rows.length > 50)
        reject(
          "This demo supports up to 50 sample rows. Reset it to start over.",
        );
      if (!validState(next))
        reject("Invalid sample data. No changes were saved.");
      state = next;
      persist();
      return structuredClone(result);
    },
  };
}
