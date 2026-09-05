// Development-only visual fixture. No backend, real credentials, or persistent profiles.
// Vite's production entry remains index.html and does not include this file.
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "../src/App";
import { applyFixtureChanges, tableChangePage } from "./table-change-fixture";
import type { TableChangesRequest } from "../src/shared/types/database";
import {
  newProfile,
  type ConnectionCatalog,
  type ProfileInput,
  type SessionInfo,
} from "../src/features/connections/connection-types";

let catalog: ConnectionCatalog = {
  version: 1,
  workspaces: [
    { id: "mmo", name: "MMO" },
    { id: "analytics", name: "Analytics" },
  ],
  profiles: [
    {
      ...newProfile("mmo"),
      id: "local",
      name: "Local development",
      credentialId: null,
    },
    {
      ...newProfile("mmo"),
      id: "staging",
      name: "QA database",
      host: "staging.example.test",
      environment: "staging",
      readOnly: true,
      credentialId: "synthetic",
    },
    {
      ...newProfile("mmo"),
      id: "prod",
      name: "Live game",
      host: "production.example.test",
      environment: "production",
      credentialId: "synthetic",
      sslMode: "require",
    },
  ],
};
let sessions: SessionInfo[] = [];
// Explicit URL scenarios keep visual QA independent of the user's saved profiles.
const scenario = new URLSearchParams(location.search).get("scenario");
const inlinePage = structuredClone(tableChangePage);
inlinePage.hasMore = false;
if (scenario === "empty")
  catalog = { version: 1, workspaces: [], profiles: [] };
if (scenario === "single") catalog.profiles = catalog.profiles.slice(0, 1);
if (scenario === "many") {
  catalog.profiles.push(
    ...Array.from({ length: 40 }, (_, index) => ({
      ...catalog.profiles[index % 3]!,
      id: `fixture-${index}`,
      name: `Service ${index + 1} · PostgreSQL connection with a long descriptive name`,
      host: `postgres-${index + 1}.internal.eu-west-1.example.test`,
    })),
  );
}
mockWindows("main");
mockIPC(async (command, args) => {
  const payload = args as Record<string, unknown>;
  if (command === "plugin:dialog|open")
    return "/synthetic-fixture/archive.dump";
  if (command === "prepare_restore")
    return {
      id: "synthetic-snapshot",
      format: "custom",
      bytes: 1024,
      digest: "a".repeat(64),
      preview: "TABLE public users\nSEQUENCE public users_id_seq",
      serverMajor: 17,
    };
  if (command === "release_restore") return;
  if (command === "restore_database" || command === "dump_database")
    throw new Error(
      "Visual fixture only: no database operation was performed.",
    );
  if (scenario?.startsWith("inline")) {
    if (command === "load_table_page") return structuredClone(inlinePage);
    if (command === "list_columns") return inlinePage.columns;
    if (command === "load_table_row") {
      const { key } = payload.input as {
        key: { column: string; value: string | null }[];
      };
      return {
        columns: inlinePage.columns.map((column) => column.name),
        row:
          inlinePage.rows.find((row) =>
            key.every(
              (value) =>
                row.values[
                  inlinePage.columns.findIndex(
                    (column) => column.name === value.column,
                  )
                ] === value.value,
            ),
          ) ?? null,
      };
    }
    if (command === "apply_table_changes") {
      if (scenario === "inline-error")
        throw {
          kind: "rejected",
          message: "A row changed in another session. Nothing was saved.",
          rowId: (payload.input as TableChangesRequest).changes[0].id,
        };
      if (scenario === "inline-unknown")
        throw {
          kind: "unknown",
          message:
            "Connection lost while committing. Verify the database before retrying.",
          rowId: null,
        };
      return applyFixtureChanges(
        inlinePage,
        payload.input as TableChangesRequest,
      );
    }
  }
  if (command === "enable_exit_guard" || command === "exit_application") return;
  if (command === "connection_catalog") return structuredClone(catalog);
  if (command === "active_connections") return sessions;
  if (command === "connection_statuses")
    return sessions.map((session) => ({ id: session.id, status: "active" }));
  if (command === "save_workspace") {
    if (payload.id)
      catalog.workspaces = catalog.workspaces.map((w) =>
        w.id === payload.id ? { ...w, name: String(payload.name) } : w,
      );
    else
      catalog.workspaces.push({
        id: crypto.randomUUID(),
        name: String(payload.name),
      });
    return structuredClone(catalog);
  }
  if (command === "test_profile")
    return {
      ...(payload.input as ProfileInput),
      serverVersion: "PostgreSQL 17 · synthetic fixture",
    };
  if (command === "save_profile") {
    const { password, passwordAction, ...input } =
      payload.input as ProfileInput;
    void password;
    const profile = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      credentialId: passwordAction === "store" ? "synthetic" : null,
    };
    catalog.profiles = [
      ...catalog.profiles.filter((p) => p.id !== profile.id),
      profile,
    ];
    return structuredClone(catalog);
  }
  if (command === "delete_profile") {
    catalog.profiles = catalog.profiles.filter((p) => p.id !== payload.id);
    return structuredClone(catalog);
  }
  if (command === "connect_profile") {
    const profile = catalog.profiles.find((p) => p.id === payload.profileId)!;
    const session = {
      ...profile,
      id: crypto.randomUUID(),
      profileId: profile.id,
      serverVersion: "PostgreSQL 17 · synthetic fixture",
    };
    sessions = [...sessions, session];
    return session;
  }
  if (command === "disconnect_postgres") {
    sessions = sessions.filter((s) => s.id !== payload.sessionId);
    return;
  }
  if (command === "list_database_objects")
    return [
      {
        schema: "public",
        name: "users",
        objectType: "table",
        estimatedRows: 2,
      },
    ];
  const columns = [
    {
      name: "id",
      dataType: "integer",
      nullable: false,
      primaryKey: true,
      identity: false,
      generated: false,
      defaultValue: null,
      enumValues: [],
    },
    {
      name: "name",
      dataType: "text",
      nullable: false,
      primaryKey: false,
      identity: false,
      generated: false,
      defaultValue: null,
      enumValues: [],
    },
  ];
  if (command === "list_columns") return columns;
  if (command === "sql_completion_catalog")
    return columns.map((column) => ({
      schema: "public",
      table: "users",
      column: column.name,
    }));
  if (command === "backup_tools")
    return {
      id: "fixture-tools",
      source: "custom",
      directory: "/synthetic/postgresql/bin",
      version: "17.11",
      major: 17,
    };
  if (command === "prepare_restore")
    return {
      id: "fixture-restore",
      format: "custom",
      bytes: 24000,
      digest: "a".repeat(64),
      serverMajor: 17,
      preview:
        "; Synthetic archive · no database operations\n; Dumped from database version: 17.11\nTABLE public users postgres\nTABLE DATA public users postgres\nCONSTRAINT public users_pkey postgres\nINDEX public users_name postgres",
    };
  if (command === "plugin:dialog|open") return "/synthetic/trusted.dump";
  if (
    command === "release_restore" ||
    command === "release_sql_file" ||
    command === "validate_sql_format"
  )
    return;
  if (command === "load_table_page")
    return {
      columns,
      rows: [
        { values: ["1", "Ada"], rowVersion: "1" },
        { values: ["2", "Grace"], rowVersion: "2" },
      ],
      page: 0,
      pageSize: 50,
      hasMore: false,
      editable: true,
      insertable: true,
      editabilityReason: null,
      insertabilityReason: null,
    };
  if (command === "run_query")
    return {
      durationMs: 2,
      resultSets: [
        {
          columns: ["session", "result"],
          rows: [
            [
              sessions.find((s) => s.id === payload.sessionId)?.name,
              "Synthetic test result",
            ],
          ],
          affectedRows: 1,
          truncated: false,
        },
      ],
    };
  if (command === "cancel_query") return true;
  if (command.startsWith("plugin:")) return;
  throw new Error("Unimplemented fixture command: " + command);
});
createRoot(document.getElementById("root")!).render(<App />);
