import {
  Check,
  Copy,
  PanelsTopLeft,
  ChevronDown,
  CircleHelp,
  X,
  Unplug,
  BookMarked,
  FolderOpen,
  Save,
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
import type { NamespaceDialogMode } from "../explorer/NamespaceDialog";
import { ResizeHandle } from "../../shared/components/ResizeHandle";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { useMediaQuery } from "../../shared/hooks/useMediaQuery";
import { primaryModifierLabel } from "../../shared/lib/platform";
import type {
  SessionInfo,
  SessionStatus,
} from "../connections/connection-types";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useDatabaseSession } from "../connections/SessionContext";
import type { useQueryPreferences } from "./useQueryPreferences";
import { TableWorkspace } from "../table/TableWorkspace";
import {
  formatCount,
  ResultsGrid,
  RunDuration,
  useRunOutcome,
} from "./ResultsGrid";
import { lineColumnAt } from "./sql-diagnostics";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
import { useWorkspace } from "./useWorkspace";
import type { WorkspaceLayout } from "./useWorkspaceLayout";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { useWorkRisk, useWorkSafety } from "../../shared/safety/WorkSafety";
import { FileWorkRisk, useSqlDocuments } from "./useSqlDocuments";
import { useSqlCompletions } from "./useSqlCompletions";
import { useWorkspaceCommands } from "./useWorkspaceCommands";
import "./p1.css";
import { QueryExecutionControl, RunQueryButton } from "./QueryExecutionControl";
import {
  BackupDialog,
  CommandPalette,
  HelpDialog,
  NamespaceDialog,
  QueryHistoryPanel,
  QueryLibrary,
  QueryPreferencesPanel,
  SchemaEditor,
} from "./lazy-panels";

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
  layout: WorkspaceLayout;
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
  layout,
}: WorkspaceProps) {
  const { session, api: databaseApi } = useDatabaseSession();
  const workspace = useWorkspace(connection.database, queryPreferences);
  const safety = useWorkSafety();
  useWorkRisk({
    sessionId: connection.id,
    tabId: workspace.runningTabId ?? undefined,
    label: `${connection.name}: SQL query`,
    busy: workspace.runningTabId !== null,
  });
  const compactWindow = useMediaQuery("(max-width: 1080px)");
  const editorRef = useRef<SqlEditorHandle>(null);
  const documents = useSqlDocuments(workspace.tabs, connection.id, editorRef);
  const completions = useSqlCompletions(workspace.objects);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [schemaRevision, setSchemaRevision] = useState(0);
  const [schemaApplying, setSchemaApplying] = useState(false);
  const [namespaceDialog, setNamespaceDialog] = useState<{
    mode: NamespaceDialogMode;
    name: string;
  } | null>(null);
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
  const outcome = useRunOutcome(
    activeQueryTab?.id,
    activeResult ?? activeQueryTab?.error ?? null,
  );
  const errorPosition = activeQueryTab?.error?.position ?? null;
  const errorLocation =
    activeQueryTab && errorPosition !== null
      ? lineColumnAt(activeQueryTab.sql, errorPosition)
      : null;
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
    // Only a revealed overlay takes focus. A pinned sidebar stays quiet, like a
    // Finder sidebar; Cmd/Ctrl+K still focuses its search explicitly.
    const frame = compactWindow
      ? requestAnimationFrame(() =>
          document
            .getElementById(`database-explorer-${connection.id}`)
            ?.querySelector<HTMLInputElement>("input")
            ?.focus(),
        )
      : 0;
    // Escape dismisses only the floating overlay. A pinned sidebar is part of
    // the window; Escape there belongs to popovers, editors and inspectors.
    const dismiss = (event: KeyboardEvent) => {
      if (
        !compactWindow ||
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      )
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
  }, [active, explorerVisible, connection.id, compactWindow]);

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

  // The sidebar selection follows the active document, like Xcode's navigator:
  // a table or its structure draft highlights that table; SQL tabs highlight none.
  const activeTable =
    activeTab?.kind === "table"
      ? { schema: activeTab.schema, name: activeTab.table }
      : activeTab?.kind === "schema" && activeTab.table
        ? { schema: activeTab.schema, name: activeTab.table }
        : null;
  const sidebarSelection = activeTable
    ? (workspace.objects.find(
        (object) =>
          object.schema === activeTable.schema &&
          object.name === activeTable.name,
      ) ?? null)
    : null;

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
          onCreateTable={(schema) =>
            workspace.tabs.openSchema(schema ?? "public")
          }
          onCreateSchema={() =>
            setNamespaceDialog({ mode: "create", name: "" })
          }
          onRenameSchema={(schema) =>
            setNamespaceDialog({ mode: "rename", name: schema })
          }
          onDropSchema={(schema) =>
            setNamespaceDialog({ mode: "drop", name: schema })
          }
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
          schemas={workspace.schemas}
          selected={sidebarSelection}
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
        {!compactWindow && (
          <ResizeHandle
            className="navigator-resize-handle"
            label="Resize database explorer"
            minimum={240}
            maximum={440}
            orientation="vertical"
            value={layout.explorerWidth}
            onResize={layout.resizeExplorer}
            onReset={layout.resetExplorer}
          />
        )}
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
                title={`Commands · ⇧${primaryModifierLabel}P   Open Quickly · ⇧${primaryModifierLabel}O`}
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
                <span className="workspace-empty-icon" aria-hidden="true">
                  <PanelsTopLeft size={22} strokeWidth={1.4} />
                </span>
                <h1>Your workspace is clear</h1>
                <p>No open tabs. Your connection stays here.</p>
                <div className="workspace-empty-actions">
                  <button
                    autoFocus={active}
                    className="button primary"
                    onClick={() => workspace.tabs.addQueryTab()}
                  >
                    New query
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setExplorerVisible(true)}
                  >
                    Browse tables
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => workspace.tabs.openDiagram()}
                  >
                    Database diagram
                  </button>
                </div>
                {workspace.tabs.canRestore && (
                  <button
                    className="button ghost compact"
                    onClick={workspace.tabs.restoreClosedTab}
                  >
                    <RotateCcw size={14} />
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
                    <strong
                      className="query-title"
                      title={activeQueryTab?.title}
                    >
                      {activeQueryTab?.title}
                    </strong>
                    <span className="query-subtitle">
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
                    </span>
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
                    <div className="toolbar-capsule editor-capsule">
                      <button
                        className="toolbar-button"
                        disabled={documents.busy}
                        onClick={() => void documents.format()}
                        title="Format SQL · Undo restores the original"
                      >
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
                    </div>
                    <RunQueryButton
                      running={workspace.runningTabId !== null}
                      cancelling={workspace.cancelling}
                      disabled={status === "lost" || status === "unknown"}
                      onRun={() =>
                        void workspace.runQuery(
                          editorRef.current?.getSubmission(),
                        )
                      }
                      onCancel={() => void workspace.cancelQuery()}
                    />
                  </div>
                </div>
                <div className="code-editor">
                  <SqlEditor
                    key={activeTab.id}
                    ref={editorRef}
                    value={activeTab.sql}
                    schema={completions.schema}
                    error={activeTab.error}
                    running={queryBusy}
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
                  <div className="results-tabs segmented-capsule">
                    <button className="active">Results</button>
                  </div>
                  {activeResult && activeResult.resultSets.length > 1 && (
                    <div
                      className="result-set-switcher segmented-capsule"
                      role="group"
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
                  <div
                    className="result-meta"
                    aria-busy={
                      (queryBusy && activeResult !== null) || undefined
                    }
                  >
                    {activeResult && (
                      <>
                        <span>
                          {formatCount(resultCount)}{" "}
                          {resultCount === 1 ? "row" : "rows"}
                        </span>
                        <RunDuration
                          key={outcome.generation}
                          durationMs={activeResult.durationMs}
                          fresh={outcome.fresh}
                        />
                      </>
                    )}
                    {activeSet?.truncated && (
                      <span
                        className="truncated"
                        title="The row or 8 MiB result budget was reached. Narrow your query to retrieve more data."
                      >
                        Limited preview · {formatCount(resultCount)} rows
                      </span>
                    )}
                  </div>
                </div>
                <ResultsGrid
                  resultSet={activeSet}
                  busy={queryBusy}
                  error={activeTab.error}
                  errorLocation={errorLocation}
                  onRevealError={() => editorRef.current?.revealError()}
                  revealKey={outcome.fresh ? outcome.generation : undefined}
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
      {namespaceDialog && (
        <NamespaceDialog
          open
          mode={namespaceDialog.mode}
          initialName={namespaceDialog.name}
          sessionId={connection.id}
          online={status === "active"}
          readOnly={session.readOnly}
          api={databaseApi}
          onClose={() => setNamespaceDialog(null)}
          onApplied={(change) => {
            workspace.tabs.namespaceApplied(change);
            setSchemaRevision((value) => value + 1);
            workspace.clearSelection();
            completions.refresh();
            void workspace.refreshObjects();
          }}
        />
      )}
    </div>
  );
}
