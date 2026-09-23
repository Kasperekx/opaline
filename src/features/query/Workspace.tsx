import {
  Check,
  Copy,
  Loader2,
  PanelsTopLeft,
  ChevronDown,
  CircleHelp,
  X,
  Play,
  Square,
  SquareTerminal,
  Unplug,
  BookMarked,
  FolderOpen,
  Save,
  Wand2,
  Command,
  HardDriveDownload,
  RotateCcw,
  Clock3,
  Settings2,
  Database,
  Network,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
} from "react";
import { Explorer } from "../explorer/Explorer";
import { HelpDialog } from "../../shared/components/HelpDialog";
import { ResizeHandle } from "../../shared/components/ResizeHandle";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { useMediaQuery } from "../../shared/hooks/useMediaQuery";
import { primaryModifierLabel } from "../../shared/lib/platform";
import type {
  SessionInfo,
  SessionStatus,
} from "../connections/connection-types";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import type { useQueryPreferences } from "./useQueryPreferences";
import { TableWorkspace } from "../table/TableWorkspace";
import { QueryHistoryPanel } from "./QueryHistoryPanel";
import { QueryPreferencesPanel } from "./QueryPreferencesPanel";
import { ResultsGrid } from "./ResultsGrid";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
import { useWorkspace } from "./useWorkspace";
import { useWorkspaceLayout } from "./useWorkspaceLayout";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { useWorkRisk, useWorkSafety } from "../../shared/safety/WorkSafety";
import { FileWorkRisk, useSqlDocuments } from "./useSqlDocuments";
import { useSqlCompletions } from "./useSqlCompletions";
import { QueryLibrary } from "./QueryLibrary";
import { CommandPalette } from "./CommandPalette";
import { useWorkspaceCommands } from "./useWorkspaceCommands";
import "./p1.css";
import { BackupDialog } from "../backup/BackupDialog";
import { QueryExecutionControl } from "./QueryExecutionControl";
import { SchemaEditor } from "../structure/SchemaEditor";

const DiagramWorkspace = lazy(() => import("../diagram/DiagramWorkspace"));

type WorkspaceProps = {
  connection: SessionInfo;
  workspaceName?: string;
  active: boolean;
  status: SessionStatus;
  onReconnect: () => void;
  onSwitchConnection: () => void;
  onManageConnections: () => void;
  queryPreferences: ReturnType<typeof useQueryPreferences>;
  onDisconnect: () => void;
};

type WorkspacePanel = "history" | "settings";

export function Workspace({
  connection,
  workspaceName,
  active,
  status,
  onReconnect,
  onSwitchConnection,
  onDisconnect,
  onManageConnections,
  queryPreferences,
}: WorkspaceProps) {
  const workspace = useWorkspace(connection.database, queryPreferences);
  const safety = useWorkSafety();
  useWorkRisk({
    sessionId: connection.id,
    tabId: workspace.runningTabId ?? undefined,
    label: `${connection.name}: SQL query`,
    busy: workspace.runningTabId !== null,
  });
  const layout = useWorkspaceLayout();
  const compactWindow = useMediaQuery("(max-width: 1080px)");
  const editorRef = useRef<SqlEditorHandle>(null);
  const documents = useSqlDocuments(workspace.tabs, connection.id, editorRef);
  const completions = useSqlCompletions(workspace.objects);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [schemaRevision, setSchemaRevision] = useState(0);
  const [schemaApplying, setSchemaApplying] = useState(false);
  const [dirtyTableIds, setDirtyTableIds] = useState<Set<string>>(
    () => new Set(),
  );
  const onTableDirtyChange = useCallback((id: string, dirty: boolean) => {
    setDirtyTableIds((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const querySplitRef = useRef<HTMLDivElement>(null);
  const [explorerVisible, setExplorerVisible] = useState(!compactWindow);
  const navigatorTrigger = useRef<HTMLButtonElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<WorkspacePanel | null>(null);
  const activeTab = workspace.tabs.activeTab;
  const activeQueryTab = activeTab?.kind === "query" ? activeTab : null;
  const activeResult = activeQueryTab?.result ?? null;
  const activeSet =
    activeResult?.resultSets[workspace.activeResultIndex] ?? null;
  const resultCount = activeSet?.rows.length ?? 0;
  const queryBusy = workspace.runningTabId === activeQueryTab?.id;
  const dirty =
    activeQueryTab !== null &&
    activeQueryTab.sql !== activeQueryTab.lastExecutedSql;

  const commands = useWorkspaceCommands({
    onCloseTab: (id) =>
      safety.request(() => workspace.tabs.closeTab(id), {
        sessionId: connection.id,
        tabId: id,
      }),
    onSelectTab: (id) => {
      workspace.tabs.setActiveTabId(id);
      workspace.setActiveResultIndex(0);
    },
    active,
    hasQuery: activeQueryTab !== null,
    workspace,
    documents,
    completions,
    onSwitchConnection,
    onOpenLibrary: () => setLibraryOpen(true),
    onOpenHistory: () => setOpenPanel("history"),
    onOpenBackup: () => setBackupOpen(true),
    onOpenCommands: () => setCommandsOpen(true),
  });
  useEffect(() => {
    if (!active || !explorerVisible) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`database-explorer-${connection.id}`)
        ?.querySelector<HTMLInputElement>("input")
        ?.focus(),
    );
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]"))
        return;
      event.preventDefault();
      setExplorerVisible(false);
      navigatorTrigger.current?.focus();
    };
    window.addEventListener("keydown", dismiss);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", dismiss);
    };
  }, [active, explorerVisible, connection.id]);

  const togglePanel = (panel: WorkspacePanel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const resizeEditor = useCallback(
    (delta: number) => {
      const extent = querySplitRef.current?.clientHeight;
      if (extent) layout.resizeEditor((delta / extent) * 100);
    },
    [layout],
  );

  const splitStyle = {
    "--editor-ratio": `${layout.editorRatio}fr`,
    "--results-ratio": `${100 - layout.editorRatio}fr`,
  } as CSSProperties;

  return (
    <div
      className={`workbench ${explorerVisible ? "navigator-open" : ""} ${compactWindow ? "navigator-overlay" : ""}`}
    >
      {workspace.tabs.tabs
        .filter((tab) => tab.kind === "query")
        .map((tab) => (
          <FileWorkRisk key={tab.id} tab={tab} sessionId={connection.id} />
        ))}
      <div className="object-navigator" hidden={!explorerVisible}>
        <Explorer
          onCreateTable={() => workspace.tabs.openSchema()}
          onEditTable={(object, drop) =>
            workspace.tabs.openSchema(object.schema, object.name, drop)
          }
          onDiagram={workspace.tabs.openDiagram}
          id={`database-explorer-${connection.id}`}
          active={active}
          onSwitchConnection={onSwitchConnection}
          onReveal={() => setExplorerVisible(true)}
          connection={connection}
          objects={workspace.objects}
          selected={workspace.selected}
          expandedObjectKey={workspace.expandedObjectKey}
          columns={workspace.columns}
          filter={workspace.filter}
          loading={workspace.explorerBusy}
          columnsLoading={workspace.columnsBusy}
          error={workspace.explorerError}
          columnsError={workspace.columnsError}
          onFilter={workspace.setFilter}
          onRefresh={() => {
            completions.refresh();
            void workspace.refreshObjects();
          }}
          onSelect={(object) => {
            workspace.selectObject(object);
            if (compactWindow) {
              setExplorerVisible(false);
              requestAnimationFrame(() => navigatorTrigger.current?.focus());
            }
          }}
          onToggle={workspace.toggleObject}
        />
        <button
          className="icon-button navigator-close"
          aria-label="Close database explorer"
          onClick={() => {
            setExplorerVisible(false);
            navigatorTrigger.current?.focus();
          }}
        >
          <X size={16} />
        </button>
      </div>
      {explorerVisible && compactWindow && (
        <button
          className="navigator-backdrop"
          aria-label="Dismiss database explorer"
          onClick={() => {
            setExplorerVisible(false);
            navigatorTrigger.current?.focus();
          }}
        />
      )}
      <main
        className="workbench-canvas"
        data-environment={connection.environment}
      >
        <WorkspaceTabs
          startAction={
            <button
              ref={navigatorTrigger}
              className="navigator-trigger"
              aria-label="Browse database tables"
              aria-expanded={explorerVisible}
              aria-controls={`database-explorer-${connection.id}`}
              onClick={() => setExplorerVisible((visible) => !visible)}
            >
              <PanelsTopLeft size={18} />
              <span>Browse tables</span>
              <ChevronDown size={13} />
            </button>
          }
          dirtyTableIds={dirtyTableIds}
          tabs={workspace.tabs.tabs}
          activeTabId={workspace.tabs.activeTabId}
          runningTabId={workspace.runningTabId}
          onAddQuery={() => workspace.tabs.addQueryTab()}
          onClose={(id) =>
            safety.request(() => workspace.tabs.closeTab(id), {
              sessionId: connection.id,
              tabId: id,
            })
          }
          onRenameQuery={workspace.tabs.renameQueryTab}
          onSelect={(id) => {
            workspace.tabs.setActiveTabId(id);
            workspace.setActiveResultIndex(0);
          }}
          endAction={
            <>
              {workspace.tabs.canRestore && (
                <button
                  className="icon-button subtle"
                  aria-label="Reopen closed query"
                  title="Reopen closed query"
                  onClick={workspace.tabs.restoreClosedTab}
                >
                  <RotateCcw size={16} />
                </button>
              )}
              <button
                className="icon-button"
                title={`Commands · ${primaryModifierLabel} ⇧ P`}
                aria-label="Open command palette"
                onClick={() => setCommandsOpen(true)}
              >
                <Command size={17} />
              </button>
              <EnvironmentBadge
                environment={connection.environment}
                readOnly={connection.readOnly}
              />
              <ActionMenu
                label="Connection actions"
                actions={[
                  {
                    label: "New table…",
                    icon: Database,
                    disabled: connection.readOnly,
                    onSelect: () => workspace.tabs.openSchema(),
                  },
                  {
                    label: "Database diagram",
                    icon: Network,
                    onSelect: () => workspace.tabs.openDiagram(),
                  },
                  {
                    label: "Switch connection",
                    icon: Database,
                    onSelect: onSwitchConnection,
                  },
                  {
                    label: "Connection library",
                    icon: Database,
                    onSelect: onManageConnections,
                  },
                  {
                    label: "Bookmarks",
                    icon: BookMarked,
                    onSelect: () => setLibraryOpen(true),
                  },
                  {
                    label: "Query history",
                    icon: Clock3,
                    onSelect: () => togglePanel("history"),
                  },
                  {
                    label: "Backup / Restore",
                    icon: HardDriveDownload,
                    onSelect: () => setBackupOpen(true),
                    separator: true,
                  },
                  {
                    label: "Preferences",
                    icon: Settings2,
                    onSelect: () => togglePanel("settings"),
                  },
                  {
                    label: "Help",
                    icon: CircleHelp,
                    onSelect: () => setHelpOpen(true),
                  },
                  {
                    label: "Disconnect",
                    icon: Unplug,
                    disabled: workspace.runningTabId !== null,
                    separator: true,
                    onSelect: onDisconnect,
                  },
                ]}
              />
            </>
          }
        />
        <div className="workspace-content">
          <div className="workspace-notices">
            {workspace.tabs.notice && (
              <div className="workspace-notice" role="status">
                <span>{workspace.tabs.notice}</span>
                <button
                  className="button ghost"
                  onClick={workspace.tabs.dismissNotice}
                >
                  Dismiss
                </button>
              </div>
            )}
            {documents.message && (
              <div className="workspace-notice" role="status">
                <span>{documents.message}</span>
                <button className="button ghost" onClick={documents.dismiss}>
                  Dismiss
                </button>
              </div>
            )}
            {completions.error && (
              <div className="workspace-notice" role="status">
                <span>{completions.error}</span>
                <button className="button ghost" onClick={completions.refresh}>
                  Retry suggestions
                </button>
              </div>
            )}
            {workspace.cancellationError && (
              <div className="workspace-notice" role="alert">
                <span>{workspace.cancellationError}</span>
              </div>
            )}
            {(status === "lost" || status === "unknown") && (
              <div className="workspace-notice" role="alert">
                <span>
                  {status === "lost"
                    ? "Connection lost. Displayed data may be stale. Drafts are retained; SQL is never retried automatically."
                    : "Connection status unavailable. Displayed data may be stale."}
                </span>
                {status === "lost" && (
                  <button className="button ghost" onClick={onReconnect}>
                    Reconnect
                  </button>
                )}
              </div>
            )}
          </div>
          {!activeTab && (
            <section className="workspace-empty" aria-label="No open tabs">
              <div className="workspace-empty-content">
                <PanelsTopLeft size={28} strokeWidth={1.3} aria-hidden="true" />
                <h1>Your workspace is clear</h1>
                <p>No open tabs. Your connection stays here.</p>
                <div className="workspace-empty-actions">
                  <button
                    autoFocus={active}
                    className="button primary"
                    onClick={() => workspace.tabs.addQueryTab()}
                  >
                    <SquareTerminal size={16} />
                    New query
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setExplorerVisible(true)}
                  >
                    <Database size={16} />
                    Browse tables
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => workspace.tabs.openDiagram()}
                  >
                    <Network size={16} />
                    Database diagram
                  </button>
                </div>
                {workspace.tabs.canRestore && (
                  <button
                    className="button ghost"
                    onClick={workspace.tabs.restoreClosedTab}
                  >
                    <RotateCcw size={15} />
                    Reopen closed query
                  </button>
                )}
              </div>
            </section>
          )}
          {activeTab?.kind === "query" ? (
            <div
              className="sql-workbench"
              ref={querySplitRef}
              style={splitStyle}
            >
              <section className="editor-pane" aria-label="SQL editor">
                <div className="editor-toolbar">
                  <div className="query-path">
                    <SquareTerminal size={14} />
                    <span>{activeQueryTab?.title}</span>
                    <span
                      className="sql-document-state"
                      title={activeQueryTab?.file?.path}
                    >
                      {activeQueryTab?.file
                        ? activeQueryTab.sql === activeQueryTab.file.savedSql
                          ? "File saved"
                          : "Unsaved file changes"
                        : "Local draft"}
                    </span>
                    {dirty && (
                      <span
                        className="unsaved"
                        title="Different from the last whole-document execution"
                      >
                        Not executed
                      </span>
                    )}
                  </div>
                  <div className="editor-actions">
                    <QueryExecutionControl
                      key={`${connection.id}:${activeTab.id}`}
                      mode={activeTab.executionMode ?? "atomic"}
                      target={`${workspaceName ?? "Workspace"} / ${connection.name} · ${connection.environment} · ${connection.host}:${connection.port} / ${connection.database}`}
                      readOnly={connection.readOnly}
                      busy={
                        workspace.runningTabId !== null || status !== "active"
                      }
                      onChange={(executionMode) =>
                        workspace.tabs.updateQueryTab(activeTab.id, (tab) => ({
                          ...tab,
                          executionMode,
                        }))
                      }
                    />
                    <button
                      className="toolbar-button"
                      disabled={documents.busy}
                      onClick={() => void documents.format()}
                      title="Format SQL · Undo restores the original"
                    >
                      <Wand2 size={15} />
                      Format
                    </button>
                    <ActionMenu
                      label="Query actions"
                      actions={[
                        {
                          label: "Open SQL file…",
                          icon: FolderOpen,
                          disabled: documents.busy,
                          onSelect: () => void documents.open(),
                        },
                        {
                          label: "Save SQL file…",
                          icon: Save,
                          disabled: documents.busy,
                          onSelect: () => void documents.save(),
                        },
                        {
                          label: workspace.copied ? "Copied" : "Copy SQL",
                          icon: workspace.copied ? Check : Copy,
                          separator: true,
                          onSelect: () => void workspace.copyQuery(),
                        },
                      ]}
                    />
                    {workspace.runningTabId ? (
                      <button
                        className="cancel-button"
                        disabled={workspace.cancelling}
                        onClick={() => void workspace.cancelQuery()}
                      >
                        {workspace.cancelling ? (
                          <Loader2 className="spin" size={15} />
                        ) : (
                          <Square size={13} fill="currentColor" />
                        )}
                        {workspace.cancelling ? "Cancelling" : "Cancel"}
                      </button>
                    ) : (
                      <button
                        className="run-button"
                        disabled={status === "lost" || status === "unknown"}
                        title="Run selected SQL, or the entire editor when nothing is selected"
                        onClick={() =>
                          void workspace.runQuery(
                            editorRef.current?.getSubmission(),
                          )
                        }
                      >
                        <Play size={14} fill="currentColor" />
                        Run <kbd>{primaryModifierLabel}↵</kbd>
                      </button>
                    )}
                  </div>
                </div>
                <div className="code-editor">
                  <SqlEditor
                    key={activeTab.id}
                    ref={editorRef}
                    value={activeTab.sql}
                    schema={completions.schema}
                    errorPosition={activeTab.error?.position ?? null}
                    onChange={(sql) =>
                      workspace.tabs.updateSql(activeTab.id, sql)
                    }
                    onRun={(submission) => {
                      if (active && status !== "lost" && status !== "unknown")
                        void workspace.runQuery(submission);
                    }}
                  />
                </div>
              </section>
              <ResizeHandle
                className="sql-resize-handle"
                label="Resize SQL editor and results"
                minimum={25}
                maximum={75}
                orientation="horizontal"
                value={layout.editorRatio}
                onResize={resizeEditor}
                onReset={layout.resetEditor}
              />
              <section className="results-pane" aria-label="Query results">
                <div className="results-header">
                  <div className="results-tabs">
                    <button className="active">
                      Results {activeSet && <span>{resultCount}</span>}
                    </button>
                  </div>
                  {activeResult && activeResult.resultSets.length > 1 && (
                    <div
                      className="result-set-switcher"
                      aria-label="Result sets"
                    >
                      {activeResult.resultSets.map((_, index) => (
                        <button
                          key={index}
                          className={
                            index === workspace.activeResultIndex
                              ? "active"
                              : ""
                          }
                          onClick={() => workspace.setActiveResultIndex(index)}
                        >
                          {index + 1}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="result-meta">
                    {activeResult && (
                      <>
                        <span>
                          {resultCount} {resultCount === 1 ? "row" : "rows"}
                        </span>
                        <span>{activeResult.durationMs} ms</span>
                      </>
                    )}
                    {activeSet?.truncated && (
                      <span
                        className="truncated"
                        title="The row or 8 MiB result budget was reached. Narrow your query to retrieve more data."
                      >
                        Limited preview · {resultCount} rows
                      </span>
                    )}
                  </div>
                </div>
                <ResultsGrid
                  resultSet={activeSet}
                  busy={queryBusy}
                  error={activeTab.error}
                />
              </section>
            </div>
          ) : null}
          {workspace.tabs.tabs
            .filter((tab) => tab.kind === "schema")
            .map((tab) => (
              <div
                className="retained-table-workspace"
                key={tab.id}
                hidden={tab.id !== activeTab?.id}
              >
                <SchemaEditor
                  onApplyingChange={setSchemaApplying}
                  key={connection.id}
                  tab={tab}
                  online={status === "active"}
                  onDirtyChange={onTableDirtyChange}
                  canApply={() =>
                    !safety.hasRisks({
                      sessionId: connection.id,
                      excludeTabId: tab.id,
                    })
                  }
                  onApplied={(input) => {
                    workspace.tabs.schemaApplied(
                      tab.id,
                      input.schema,
                      input.original,
                      input.table,
                      input.dropTable,
                    );
                    setSchemaRevision((value) => value + 1);
                    workspace.clearSelection();
                    completions.refresh();
                    void workspace.refreshObjects();
                  }}
                />
              </div>
            ))}
          {workspace.tabs.tabs
            .filter((tab) => tab.kind === "diagram")
            .map((tab) => (
              <div
                className="retained-table-workspace"
                key={tab.id}
                hidden={tab.id !== activeTab?.id}
              >
                <Suspense
                  fallback={
                    <div className="tree-empty" role="status">
                      Loading diagram…
                    </div>
                  }
                >
                  <DiagramWorkspace
                    schemaRevision={schemaRevision}
                    onCreateTable={() => workspace.tabs.openSchema()}
                    onEditTable={(object, drop) =>
                      workspace.tabs.openSchema(
                        object.schema,
                        object.name,
                        drop,
                      )
                    }
                    key={connection.id}
                    tab={tab}
                    active={active && tab.id === activeTab?.id}
                    status={status}
                    onOpenTable={workspace.selectObject}
                  />
                </Suspense>
              </div>
            ))}
          {workspace.tabs.tabs
            .filter((tab) => tab.kind === "table")
            .map((tab) => (
              <div
                className="retained-table-workspace"
                inert={schemaApplying}
                key={tab.id}
                hidden={tab.id !== activeTab?.id}
              >
                <TableWorkspace
                  key={schemaRevision}
                  onEditStructure={() =>
                    workspace.tabs.openSchema(tab.schema, tab.table)
                  }
                  onOpenRelated={workspace.tabs.openRelatedTable}
                  active={active && tab.id === activeTab?.id && !schemaApplying}
                  onDirtyChange={onTableDirtyChange}
                  tab={tab}
                  onOpenQuery={(sql, title) =>
                    workspace.tabs.addQueryTab(sql, title)
                  }
                  onOpenTable={(schema, table) =>
                    workspace.selectObject({
                      schema,
                      name: table,
                      objectType: "table",
                      estimatedRows: 0,
                    })
                  }
                />
              </div>
            ))}
        </div>
        <footer className="status-bar" data-session-status={status}>
          <span>
            <i />{" "}
            {status === "active"
              ? "Connected"
              : status === "busy"
                ? "Busy"
                : status === "lost"
                  ? "Disconnected"
                  : "Status unavailable"}
          </span>
          <span
            className="session-destination"
            title={`${workspaceName ?? "Workspace"} / ${connection.name} · ${connection.username}@${connection.host}:${connection.port}/${connection.database}`}
          >
            {connection.host}:{connection.port} / {connection.database}
          </span>
          <span className={"session-access env-" + connection.environment}>
            {connection.environment === "production" ? "PRODUCTION · " : ""}
            {connection.readOnly ? "Read-only" : "Read & write"}
          </span>
          <span className="status-spacer" />
          <span>
            {activeTab?.kind === "query"
              ? `${workspace.queryPreferences.preferences.maxRows} row limit`
              : activeTab?.kind === "diagram"
                ? "Schema diagram"
                : activeTab?.kind === "schema"
                  ? "Structure draft"
                  : activeTab
                    ? "Table browse mode"
                    : "No open tabs"}
          </span>
          <span>UTF-8</span>
          {(activeTab?.kind === "table" || activeTab?.kind === "query") && (
            <span
              className={
                activeTab?.kind === "query" &&
                activeTab.executionMode === "autocommit"
                  ? "autocommit-status"
                  : ""
              }
              title={
                activeTab?.kind === "query" &&
                activeTab.executionMode === "autocommit"
                  ? "One statement per Run. Saves immediately; no application rollback."
                  : "Each Run commits on success or rolls back on error. Manual transaction controls are not supported."
              }
            >
              {activeTab?.kind === "query" &&
              activeTab.executionMode === "autocommit"
                ? "Autocommit · saves immediately"
                : "Atomic run"}
            </span>
          )}
        </footer>
      </main>
      {openPanel === "history" && (
        <QueryHistoryPanel
          onOpenEarlierQuery={(sql, title) => {
            workspace.tabs.addQueryTab(sql, title);
            setOpenPanel(null);
          }}
          entries={workspace.history.entries}
          onClear={workspace.history.clearHistory}
          onClose={() => setOpenPanel(null)}
          onOpen={(entry) => {
            workspace.tabs.addQueryTab(entry.sql, entry.title);
            setOpenPanel(null);
          }}
        />
      )}
      {openPanel === "settings" && (
        <QueryPreferencesPanel
          preferences={workspace.queryPreferences.preferences}
          onUpdate={workspace.queryPreferences.updatePreference}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {libraryOpen && (
        <QueryLibrary
          sql={activeQueryTab?.sql ?? ""}
          title={activeQueryTab?.title ?? ""}
          onClose={() => setLibraryOpen(false)}
          onOpen={(sql, title) => {
            workspace.tabs.addQueryTab(sql, title);
          }}
        />
      )}
      {commandsOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setCommandsOpen(false)}
        />
      )}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {backupOpen && (
        <BackupDialog
          objects={workspace.objects}
          workspaceName={workspaceName ?? connection.workspaceId}
          onClose={() => setBackupOpen(false)}
        />
      )}
    </div>
  );
}
