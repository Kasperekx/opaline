// Development-only responsive fixture. All values and responses are synthetic.
import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { newProfile } from "../src/features/connections/connection-types";
import { SessionProvider } from "../src/features/connections/SessionContext";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";
import { useTableData } from "../src/features/table/useTableData";
import { tableRowKey } from "../src/features/table/table-change-set";
import { TableDataGrid } from "../src/features/table/TableDataGrid";
import { TableChangesBar } from "../src/features/table/TableChangesBar";
import { TableChangesReview } from "../src/features/table/TableChangesReview";
import { TablePagination } from "../src/features/table/TablePagination";
import { tableChangePage, applyFixtureChanges } from "./table-change-fixture";
import type { TableChangesRequest } from "../src/shared/types/database";
import "../src/App.css";
import "../src/features/connections/connections.css";
import "../src/features/query/p1.css";
import "../src/features/table/inline-editing.css";

const page = structuredClone(tableChangePage);
const session = {
  ...newProfile("fixture-workspace"),
  name: "MMO · Local development",
  id: "inline-fixture",
  profileId: "inline-fixture",
  serverVersion: "synthetic",
};
const tab = {
  id: "inline-fixture-table",
  kind: "table" as const,
  title: "users",
  schema: "public",
  table: "users",
  objectType: "table",
};
mockIPC((command, args) => {
  if (command === "load_table_page") return structuredClone(page);
  if (command === "apply_table_changes")
    return applyFixtureChanges(
      page,
      (args as { input: TableChangesRequest }).input,
    );
  if (command === "load_table_row")
    return {
      columns: page.columns.map((column) => column.name),
      row: page.rows[0],
    };
});
function GridPreview() {
  const table = useTableData(tab);
  const prepared = useRef(false);
  useEffect(() => {
    if (!table.data || prepared.current) return;
    prepared.current = true;
    const first = table.data.rows[0];
    table.changes.update(
      tableRowKey(table.data.columns, first),
      1,
      "Ada Lovelace — pending change",
      first,
    );
  }, [table]);
  return (
    <section
      className="table-data-view inline-editing-view"
      style={{ height: "100dvh" }}
    >
      <header className="table-data-toolbar">
        <strong>public / users</strong>
        <span className="editability-badge editable">Inline editing</span>
      </header>
      <TableDataGrid
        table={table}
        locked={table.busy || table.changes.disabled}
      />
      <TableChangesBar table={table} tab={tab} />
      <TablePagination
        table={table}
        locked={table.busy || table.changes.disabled}
      />
      <TableChangesReview table={table} tab={tab} />
    </section>
  );
}
function ResponsivePreview() {
  return (
    <main
      style={{
        display: "flex",
        gap: 16,
        padding: 16,
        height: "100dvh",
        overflow: "auto",
      }}
    >
      {[
        { width: 440, height: 580 },
        { width: 760, height: 440 },
      ].map(({ width, height }) => (
        <section key={width}>
          <p>
            {width} × {height} · Table viewport
          </p>
          <iframe
            title={`Inline editing at ${width} × ${height}`}
            width={width}
            height={height}
            src="/tests/inline-table.preview.html?frame"
            style={{ border: "1px solid #414a45" }}
          />
        </section>
      ))}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("frame") ? (
    <WorkSafetyProvider>
      <SessionProvider session={session}>
        <GridPreview />
      </SessionProvider>
    </WorkSafetyProvider>
  ) : (
    <ResponsivePreview />
  ),
);
