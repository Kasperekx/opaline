import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowRight,
  Blocks,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Columns3,
  Copy,
  Database,
  Ellipsis,
  Eye,
  Folder,
  KeyRound,
  LayoutGrid,
  Loader2,
  PanelLeftClose,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Table2,
  Unplug,
  X,
} from "lucide-react";
import "./App.css";

type ConnectionConfig = {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: "prefer" | "require" | "disable";
};

type ConnectionInfo = Omit<ConnectionConfig, "password" | "sslMode"> & {
  serverVersion: string;
};

type DatabaseObject = {
  schema: string;
  name: string;
  objectType: string;
  estimatedRows: number;
};

type ColumnInfo = {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  primaryKey: boolean;
};

type QueryResultSet = {
  columns: string[];
  rows: Array<Array<string | null>>;
  affectedRows: number;
  truncated: boolean;
};

type QueryResult = {
  resultSets: QueryResultSet[];
  durationMs: number;
};

const initialConnection: ConnectionConfig = {
  name: "Local PostgreSQL",
  host: "localhost",
  port: 5432,
  database: "postgres",
  username: "postgres",
  password: "",
  sslMode: "prefer",
};

const starterQuery = `select
  current_database() as database,
  current_user as connected_as,
  now() as connected_at;`;

const codeMirrorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "#dfe6dc",
    fontSize: "13px",
  },
  ".cm-content": {
    caretColor: "#c8f26a",
    padding: "22px 0",
    fontFamily:
      '"SFMono-Regular", "Cascadia Code", "Roboto Mono", ui-monospace, monospace',
    lineHeight: "1.75",
  },
  ".cm-line": { padding: "0 24px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "#555d57",
    border: "none",
    paddingLeft: "8px",
  },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.025)" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "#99a598",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(200,242,106,.13)",
  },
  ".cm-cursor": { borderLeftColor: "#c8f26a" },
}, { dark: true });

const sqlHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: "#c8f26a" },
  { tag: tags.string, color: "#edc98e" },
  { tag: tags.number, color: "#8ed7c6" },
  { tag: tags.comment, color: "#687169", fontStyle: "italic" },
  { tag: tags.operator, color: "#9eaaa0" },
  { tag: tags.name, color: "#dfe6dc" },
]));

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function friendlyError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function RailButton({
  label,
  active = false,
  children,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className={`rail-button ${active ? "active" : ""}`} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function AppRail({ connected = false }: { connected?: boolean }) {
  return (
    <aside className="app-rail" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="Opaline">
        <span />
      </div>
      <nav>
        <RailButton label="Connections" active>
          <Database size={18} />
        </RailButton>
        <RailButton label="Query history">
          <Clock3 size={18} />
        </RailButton>
        <RailButton label="Saved queries">
          <Blocks size={18} />
        </RailButton>
      </nav>
      <div className="rail-bottom">
        <RailButton label="Settings">
          <Settings2 size={18} />
        </RailButton>
        <RailButton label="Help">
          <CircleHelp size={18} />
        </RailButton>
        <span className={`connection-pip ${connected ? "online" : ""}`} title={connected ? "Connected" : "Offline"} />
      </div>
    </aside>
  );
}

function TopBar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="top-bar" data-tauri-drag-region>
      <div className="top-bar-title" data-tauri-drag-region>
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {action}
    </header>
  );
}

function Welcome({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="home-shell">
      <AppRail />
      <div className="home-main">
        <TopBar
          title="Opaline"
          subtitle="Local-first PostgreSQL workspace"
          action={
            <button className="button secondary compact" onClick={onConnect}>
              <Plus size={15} /> New connection
            </button>
          }
        />
        <main className="welcome">
          <section className="welcome-copy">
            <div className="eyebrow"><Sparkles size={13} /> Open source · private by default</div>
            <h1>Your databases,<br /><span>without the noise.</span></h1>
            <p>
              A calm, precise workspace for PostgreSQL. Credentials stay on your
              machine and queries go straight to your database.
            </p>
            <button className="button primary hero-action" onClick={onConnect}>
              Connect PostgreSQL <ArrowRight size={16} />
            </button>
          </section>

          <section className="connection-section" aria-labelledby="connections-title">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Workspace</span>
                <h2 id="connections-title">Connections</h2>
              </div>
              <button className="icon-button" aria-label="Connection options">
                <Ellipsis size={17} />
              </button>
            </div>
            <button className="connection-card" onClick={onConnect}>
              <div className="postgres-glyph"><Database size={21} /></div>
              <div className="connection-card-copy">
                <strong>Local PostgreSQL</strong>
                <span>localhost:5432 · postgres</span>
              </div>
              <span className="connect-label">Connect <ArrowRight size={14} /></span>
            </button>
            <button className="new-connection-card" onClick={onConnect}>
              <Plus size={17} />
              <span>
                <strong>Add another connection</strong>
                <small>PostgreSQL is available in this first release</small>
              </span>
            </button>
          </section>

          <div className="privacy-note">
            <ShieldCheck size={17} />
            <span><strong>No account. No cloud.</strong> Your database credentials never touch our servers.</span>
          </div>
        </main>
      </div>
    </div>
  );
}

function ConnectionModal({
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: ConnectionConfig) => void;
}) {
  const [value, setValue] = useState(initialConnection);

  if (!open) return null;

  const update = <K extends keyof ConnectionConfig>(key: K, next: ConnectionConfig[K]) => {
    setValue((current) => ({ ...current, [key]: next }));
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="connection-modal" role="dialog" aria-modal="true" aria-labelledby="connection-title">
        <div className="modal-head">
          <div className="modal-title-wrap">
            <div className="postgres-glyph large"><Database size={22} /></div>
            <div>
              <span className="section-kicker">New connection</span>
              <h2 id="connection-title">PostgreSQL</h2>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
          <label className="field full">
            <span>Connection name</span>
            <input value={value.name} onChange={(event) => update("name", event.target.value)} placeholder="Production" autoFocus />
          </label>
          <div className="field-row host-row">
            <label className="field">
              <span>Host</span>
              <input value={value.host} onChange={(event) => update("host", event.target.value)} placeholder="localhost" required />
            </label>
            <label className="field port-field">
              <span>Port</span>
              <input type="number" min="1" max="65535" value={value.port} onChange={(event) => update("port", Number(event.target.value))} required />
            </label>
          </div>
          <label className="field full">
            <span>Database</span>
            <input value={value.database} onChange={(event) => update("database", event.target.value)} placeholder="postgres" required />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Username</span>
              <input value={value.username} onChange={(event) => update("username", event.target.value)} placeholder="postgres" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={value.password} onChange={(event) => update("password", event.target.value)} placeholder="Optional" />
            </label>
          </div>
          <label className="field full">
            <span>SSL mode</span>
            <select value={value.sslMode} onChange={(event) => update("sslMode", event.target.value as ConnectionConfig["sslMode"])}>
              <option value="prefer">Prefer</option>
              <option value="require">Require</option>
              <option value="disable">Disable</option>
            </select>
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="modal-footer">
            <span className="secure-copy"><KeyRound size={13} /> Kept in memory for this session</span>
            <div>
              <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? <Loader2 className="spin" size={16} /> : <Database size={15} />}
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function Explorer({
  connection,
  objects,
  selected,
  columns,
  filter,
  onFilter,
  onRefresh,
  onSelect,
}: {
  connection: ConnectionInfo;
  objects: DatabaseObject[];
  selected: DatabaseObject | null;
  columns: ColumnInfo[];
  filter: string;
  onFilter: (value: string) => void;
  onRefresh: () => void;
  onSelect: (object: DatabaseObject) => void;
}) {
  const schemas = useMemo(() => {
    const groups = new Map<string, DatabaseObject[]>();
    objects
      .filter((object) => `${object.schema}.${object.name}`.toLowerCase().includes(filter.toLowerCase()))
      .forEach((object) => groups.set(object.schema, [...(groups.get(object.schema) ?? []), object]));
    return [...groups.entries()];
  }, [objects, filter]);

  return (
    <aside className="explorer" aria-label="Database explorer">
      <div className="explorer-connection">
        <div className="tiny-db"><Database size={14} /></div>
        <div>
          <strong>{connection.name || connection.database}</strong>
          <span>{connection.database}</span>
        </div>
        <ChevronDown size={14} />
      </div>
      <div className="search-box">
        <Search size={13} />
        <input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="Filter objects" aria-label="Filter database objects" />
        <kbd>⌘K</kbd>
      </div>
      <div className="explorer-label">
        <span>Database objects</span>
        <button onClick={onRefresh} aria-label="Refresh database objects"><RefreshCw size={12} /></button>
      </div>
      <div className="tree-scroll">
        {schemas.length === 0 ? (
          <div className="tree-empty">No tables or views found.</div>
        ) : schemas.map(([schema, schemaObjects]) => (
          <div className="tree-group" key={schema}>
            <div className="tree-schema"><ChevronDown size={13} /><Folder size={14} /> <span>{schema}</span></div>
            <div className="tree-branch">
              {schemaObjects.map((object) => {
                const isSelected = selected?.schema === object.schema && selected?.name === object.name;
                const isView = object.objectType.includes("view");
                return (
                  <div key={`${object.schema}.${object.name}`}>
                    <button className={`tree-item ${isSelected ? "selected" : ""}`} onClick={() => onSelect(object)}>
                      <ChevronRight size={12} className={isSelected ? "open" : ""} />
                      {isView ? <Eye size={13} /> : <Table2 size={13} />}
                      <span>{object.name}</span>
                    </button>
                    {isSelected && columns.length > 0 && (
                      <div className="column-list">
                        {columns.map((column) => (
                          <div className="column-item" key={column.name} title={`${column.dataType}${column.nullable ? " · nullable" : ""}`}>
                            {column.primaryKey ? <KeyRound size={11} /> : <Columns3 size={11} />}
                            <span>{column.name}</span><small>{column.dataType}</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="explorer-footer">
        <span className="online-dot" />
        <span>{connection.host}:{connection.port}</span>
      </div>
    </aside>
  );
}

function ResultsGrid({ result, busy, error }: { result: QueryResult | null; busy: boolean; error: string | null }) {
  const set = result?.resultSets[0];

  if (busy) {
    return <div className="results-state"><Loader2 className="spin" size={20} /><span>Running query…</span></div>;
  }
  if (error) {
    return <div className="results-state error-state"><SquareTerminal size={20} /><strong>Query failed</strong><span>{error}</span></div>;
  }
  if (!set) {
    return <div className="results-state"><Play size={19} /><span>Run the query to see results</span><kbd>⌘ ↵</kbd></div>;
  }
  if (set.columns.length === 0) {
    return <div className="results-state"><Check size={20} /><strong>Query completed</strong><span>{set.affectedRows} rows affected</span></div>;
  }

  return (
    <div className="result-table-wrap">
      <table className="result-table">
        <thead>
          <tr><th className="row-number">#</th>{set.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {set.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="row-number">{rowIndex + 1}</td>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={cell === null ? "null-cell" : ""} title={cell ?? "NULL"}>{cell ?? "NULL"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Workspace({
  connection,
  onDisconnect,
}: {
  connection: ConnectionInfo;
  onDisconnect: () => void;
}) {
  const [objects, setObjects] = useState<DatabaseObject[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selected, setSelected] = useState<DatabaseObject | null>(null);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState(starterQuery);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshObjects = async () => {
    try {
      setObjects(await invoke<DatabaseObject[]>("list_database_objects"));
    } catch (error) {
      setQueryError(friendlyError(error));
    }
  };

  useEffect(() => { void refreshObjects(); }, []);

  useEffect(() => {
    const runWithShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void runQuery();
      }
    };
    window.addEventListener("keydown", runWithShortcut);
    return () => window.removeEventListener("keydown", runWithShortcut);
  });

  const selectObject = async (object: DatabaseObject) => {
    setSelected(object);
    setColumns([]);
    setQuery(`select *\nfrom "${object.schema}"."${object.name}"\nlimit 100;`);
    try {
      setColumns(await invoke<ColumnInfo[]>("list_columns", { schema: object.schema, table: object.name }));
    } catch (error) {
      setQueryError(friendlyError(error));
    }
  };

  const runQuery = async () => {
    setBusy(true);
    setQueryError(null);
    try {
      setResult(await invoke<QueryResult>("run_query", { sql: query, maxRows: 500 }));
    } catch (error) {
      setResult(null);
      setQueryError(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const copyQuery = async () => {
    await navigator.clipboard.writeText(query);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const activeSet = result?.resultSets[0];
  const resultCount = activeSet?.rows.length ?? 0;

  return (
    <div className="workspace-shell">
      <AppRail connected />
      <Explorer
        connection={connection}
        objects={objects}
        selected={selected}
        columns={columns}
        filter={filter}
        onFilter={setFilter}
        onRefresh={refreshObjects}
        onSelect={selectObject}
      />
      <main className="query-workspace">
        <TopBar
          title={connection.database}
          subtitle={`${connection.username}@${connection.host}`}
          action={
            <div className="workspace-actions">
              <span className="version-pill">{connection.serverVersion}</span>
              <button className="icon-button" title="Disconnect" aria-label="Disconnect" onClick={onDisconnect}><Unplug size={16} /></button>
              <button className="icon-button" aria-label="More options"><Ellipsis size={17} /></button>
            </div>
          }
        />
        <div className="tab-bar">
          <button className="editor-tab active"><span className="tab-dot" /> Query 1 <X size={12} /></button>
          <button className="new-tab" aria-label="New query"><Plus size={15} /></button>
          <div className="tab-spacer" />
          <button className="icon-button subtle" aria-label="Toggle sidebar"><PanelLeftClose size={15} /></button>
        </div>
        <section className="editor-pane" aria-label="SQL editor">
          <div className="editor-toolbar">
            <div className="query-path"><SquareTerminal size={13} /><span>Query 1</span><span className="unsaved">Unsaved</span></div>
            <div className="editor-actions">
              <button className="toolbar-button" onClick={copyQuery}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button>
              <button className="run-button" onClick={() => void runQuery()} disabled={busy}>
                {busy ? <Loader2 className="spin" size={14} /> : <Play size={13} fill="currentColor" />} Run
                <kbd>⌘↵</kbd>
              </button>
            </div>
          </div>
          <div className="code-editor">
            <CodeMirror
              value={query}
              height="100%"
              extensions={[sql({ dialect: PostgreSQL }), codeMirrorTheme, sqlHighlighting]}
              onChange={setQuery}
              theme="none"
              basicSetup={{
                foldGutter: false,
                dropCursor: false,
                allowMultipleSelections: true,
                indentOnInput: true,
              }}
            />
          </div>
        </section>
        <section className="results-pane" aria-label="Query results">
          <div className="results-header">
            <div className="results-tabs">
              <button className="active">Results {activeSet && <span>{resultCount}</span>}</button>
              <button>Messages {queryError && <i />}</button>
            </div>
            <div className="result-meta">
              {result && <><span>{resultCount} {resultCount === 1 ? "row" : "rows"}</span><span>{result.durationMs} ms</span></>}
              {activeSet?.truncated && <span className="truncated">Limited to {resultCount}</span>}
              <button className="icon-button subtle" aria-label="Result view options"><LayoutGrid size={14} /></button>
            </div>
          </div>
          <ResultsGrid result={result} busy={busy} error={queryError} />
        </section>
        <footer className="status-bar">
          <span><i /> Connected</span>
          <span>{connection.database}</span>
          <span className="status-spacer" />
          <span>UTF-8</span>
          <span>Ln 1, Col 1</span>
        </footer>
      </main>
    </div>
  );
}

function App() {
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    invoke<ConnectionInfo | null>("connection_info").then(setConnection).catch(() => undefined);
  }, []);

  const connect = async (input: ConnectionConfig) => {
    if (!isTauriRuntime()) {
      setConnectionError("Database connections are available in the desktop app. Run `npm run tauri dev`.");
      return;
    }
    setConnecting(true);
    setConnectionError(null);
    try {
      const info = await invoke<ConnectionInfo>("connect_postgres", { input });
      setConnection(info);
      setModalOpen(false);
    } catch (error) {
      setConnectionError(friendlyError(error));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await invoke("disconnect_postgres").catch(() => undefined);
    setConnection(null);
  };

  return (
    <>
      {connection ? (
        <Workspace connection={connection} onDisconnect={() => void disconnect()} />
      ) : (
        <Welcome onConnect={() => { setConnectionError(null); setModalOpen(true); }} />
      )}
      <ConnectionModal
        open={modalOpen}
        busy={connecting}
        error={connectionError}
        onClose={() => setModalOpen(false)}
        onSubmit={(value) => void connect(value)}
      />
    </>
  );
}

export default App;
