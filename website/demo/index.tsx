import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { mockIPC } from "@tauri-apps/api/mocks";
import {
  ArrowRight,
  Database,
  FolderOpen,
  LockKeyhole,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { SessionProvider } from "../../src/features/connections/SessionContext";
import { ConnectionRow } from "../../src/features/connections/ConnectionRow";
import { EnvironmentBadge } from "../../src/features/connections/EnvironmentBadge";
import {
  environmentLabels,
  type ConnectionProfile,
} from "../../src/features/connections/connection-types";
import { TableDataGrid } from "../../src/features/table/TableDataGrid";
import { TableChangesBar } from "../../src/features/table/TableChangesBar";
import { TableChangesReview } from "../../src/features/table/TableChangesReview";
import { TablePagination } from "../../src/features/table/TablePagination";
import { TableErrorNotice } from "../../src/features/table/TableErrorNotice";
import { useTableData } from "../../src/features/table/useTableData";
import { tableViewKey } from "../../src/features/table/table-view-state";
import { ViewTabs } from "../../src/shared/components/ViewTabs";
import {
  WorkSafetyProvider,
  useWorkSafety,
} from "../../src/shared/safety/WorkSafety";
import { createDemoStore, demoProfiles, demoSession } from "./data";
import { GuidedTableGuide } from "./GuidedTableGuide";
import "../../src/App.css";
import "../../src/features/connections/connections.css";
import "../../src/features/connections/connection-home.css";
import "../../src/shared/safety/safety.css";
import "../../src/features/query/p1.css";
import "../../src/features/structure/structure.css";
import "../../src/features/table/inline-editing.css";
import "../../src/styles/controls.css";
import "../../src/styles/studio.css";
import "../../src/features/table/table-grid.css";
import "./demo.css";

const tab = {
  id: "website-demo-table",
  kind: "table" as const,
  title: "team_members",
  schema: "public",
  table: "team_members",
  objectType: "table",
};
const guided =
  new URLSearchParams(window.location.search).get("guided") === "1";
// The embedded walkthrough starts with an unfiltered view and does not overwrite
// the visitor's full-demo filters, layout or page preferences.
const guidedTab = { ...tab, initialFilters: [] };
let storage: Storage | null = null;
try {
  storage = window.localStorage;
} catch {
  /* Private browsing may deny storage. */
}
const store = createDemoStore(storage);

// Only a three-command local adapter is reachable. There is no native runtime,
// SQL engine, credentials form, or network-backed connection in this bundle.
mockIPC((command, args) => {
  try {
    return store.invoke(command, args as Record<string, unknown>);
  } finally {
    window.dispatchEvent(new Event("demo-storage-change"));
  }
});

function DemoTable({
  readOnly,
  active,
  memoryOnly,
}: {
  readOnly: boolean;
  active: boolean;
  memoryOnly: boolean;
}) {
  const table = useTableData(guided ? guidedTab : tab);
  const locked = table.busy || table.changes.disabled;
  return (
    <section
      className="table-data-view inline-editing-view"
      data-table-density={table.density}
      aria-label="Sample team members"
      onKeyDown={(event) => {
        if (
          active &&
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s" &&
          !event.shiftKey &&
          !event.altKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          if (!locked && !document.querySelector("dialog[open]"))
            void table.changes.save();
        }
      }}
    >
      {guided && <GuidedTableGuide table={table} memoryOnly={memoryOnly} />}
      {!guided && (
        <header className="table-data-toolbar">
          <div className="table-identity">
            <span>public</span>
            <strong>team_members</strong>
            <span className="editability-badge">
              {readOnly ? <LockKeyhole size={12} /> : <ShieldCheck size={12} />}
              {readOnly ? "Read only" : "Inline editing"}
            </span>
          </div>
          <form
            className="table-filter"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              table.applyFilter();
            }}
          >
            <Search size={15} />
            <input
              aria-label="Filter table rows"
              placeholder="Filter all columns…"
              value={table.filterDraft}
              disabled={locked}
              onChange={(event) => table.setFilterDraft(event.target.value)}
            />
            <button aria-label="Apply row filter" disabled={locked}>
              <ArrowRight size={15} />
            </button>
          </form>
          <div className="table-toolbar-actions">
            <button
              disabled={
                readOnly ||
                locked ||
                !table.data ||
                table.data.rows.length >= 50
              }
              onClick={table.changes.insert}
            >
              <Plus size={15} /> Add row
            </button>
            <button
              aria-label="Refresh table data"
              disabled={locked}
              onClick={table.refresh}
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </header>
      )}
      <div className="table-context-stack">
        {table.error && (
          <TableErrorNotice
            title="Could not load demo data"
            message={table.error}
            hint="Refresh to retry, or reset the sample data using Reset demo."
          />
        )}
      </div>
      <TableDataGrid table={table} locked={locked} />
      <TableChangesBar table={table} tab={tab} />
      {!guided && <TablePagination table={table} locked={locked} />}
      {createPortal(
        <TableChangesReview table={table} tab={tab} />,
        document.body,
      )}
    </section>
  );
}

function Demo() {
  const safety = useWorkSafety();
  const [profile, setProfile] = useState(demoProfiles[0]);
  const [view, setView] = useState<"table" | "connections">("table");
  const [revision, setRevision] = useState(0);
  const [warning, setWarning] = useState(store.warning());
  const session = useMemo(
    () => ({
      ...demoSession(profile),
      profileId: guided ? `${profile.id}-guided` : profile.id,
    }),
    [profile],
  );
  useEffect(() => {
    const update = () => setWarning(store.warning());
    window.addEventListener("demo-storage-change", update);
    return () => window.removeEventListener("demo-storage-change", update);
  }, []);
  const selectProfile = (next: ConnectionProfile, open: boolean) => {
    const select = () => {
      setProfile(next);
      if (open) setView("table");
    };
    if (next.id === profile.id) select();
    else safety.request(select);
  };
  const reset = () =>
    safety.request(
      () => {
        store.reset();
        // Only this demo's view preferences are removed; never clear site storage.
        for (const preset of demoProfiles) {
          try {
            storage?.removeItem(
              tableViewKey(
                guided ? `${preset.id}-guided` : preset.id,
                tab.schema,
                tab.table,
              ),
            );
          } catch {
            /* The store warning already explains memory-only mode. */
          }
        }
        setWarning(store.warning());
        setProfile(demoProfiles[0]);
        setView("table");
        setRevision((value) => value + 1);
      },
      {},
      { allowSave: false },
    );
  return (
    <div className={`demo-application ${guided ? "demo-guided" : ""}`}>
      <header className="demo-window-bar">
        <span className="demo-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <strong>Opaline</strong>
        </span>
        {guided ? (
          <span className="demo-table-title">
            <Table2 size={14} aria-hidden="true" />
            team_members<span>Sample table</span>
          </span>
        ) : (
          <span className="demo-project">
            Atlas <span>/</span> {profile.name}
          </span>
        )}
        <button className="button ghost" onClick={reset}>
          <RotateCcw size={14} /> Reset demo
        </button>
      </header>
      {!guided && (
        <>
          <div className="demo-navigation">
            <ViewTabs
              id="demo-view"
              label="Demo views"
              active={view}
              tabs={[
                { id: "table", label: "Table", Icon: Table2 },
                { id: "connections", label: "Connections", Icon: FolderOpen },
              ]}
              onChange={setView}
            />
            <EnvironmentBadge
              environment={profile.environment}
              readOnly={profile.readOnly}
            />
          </div>
          <p className="demo-guide">
            {view === "connections"
              ? "One project, three environments. Open a sample session to explore."
              : profile.readOnly
                ? "This sample session is read-only. Switch to Local to try editing."
                : "Double-click a cell to edit. Enter stages it. Review, then save."}
          </p>
        </>
      )}
      {warning && (
        <p className="demo-warning" role="status">
          {warning}
        </p>
      )}
      <div
        className="demo-panel"
        role={guided ? undefined : "tabpanel"}
        id="demo-view-panel-table"
        aria-labelledby={guided ? undefined : "demo-view-tab-table"}
        hidden={view !== "table"}
      >
        <SessionProvider key={`${profile.id}-${revision}`} session={session}>
          <DemoTable
            readOnly={profile.readOnly}
            active={view === "table"}
            memoryOnly={warning !== null}
          />
        </SessionProvider>
      </div>
      {!guided && (
        <div
          className="demo-panel demo-connections"
          role="tabpanel"
          id="demo-view-panel-connections"
          aria-labelledby="demo-view-tab-connections"
          hidden={view !== "connections"}
        >
          <div className="demo-connections-heading">
            <Database size={21} />
            <div>
              <h1>Atlas</h1>
              <p>Sample workspace · PostgreSQL</p>
            </div>
          </div>
          {demoProfiles.map((preset) => (
            <section
              className={`connection-environment-group env-${preset.environment}`}
              key={preset.id}
              aria-label={`${environmentLabels[preset.environment]} sample connection`}
            >
              <header className="environment-group-heading">
                <i aria-hidden="true" />
                <h2>{environmentLabels[preset.environment]}</h2>
                <span>1</span>
              </header>
              <ul className="connection-list">
                <ConnectionRow
                  profile={preset}
                  active
                  available
                  selected={profile.id === preset.id}
                  onDetails={() => selectProfile(preset, false)}
                  onConnect={() => selectProfile(preset, true)}
                  onEdit={() => {}}
                />
              </ul>
            </section>
          ))}
          <p className="demo-presets-note">
            Preset sessions only. Add your own connections in the desktop app.
          </p>
        </div>
      )}
      <footer className="demo-status">
        <span className="demo-status-dot" aria-hidden="true" /> Sample data only
        <span className="demo-storage-label">
          {warning
            ? "No database connected · In-memory session"
            : "No database connected · Browser-local saves"}
        </span>
      </footer>
    </div>
  );
}

class DemoBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="demo-fallback">
        <h1>The demo could not load.</h1>
        <p>
          No database was connected. Reload to try again, or explore the
          screenshots on the landing page.
        </p>
        <button className="button secondary" onClick={() => location.reload()}>
          Reload demo
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <DemoBoundary>
    <WorkSafetyProvider>
      <Demo />
    </WorkSafetyProvider>
  </DemoBoundary>,
);
