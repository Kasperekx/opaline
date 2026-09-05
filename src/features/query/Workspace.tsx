import {
  Check,
  Copy,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
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
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Explorer } from "../explorer/Explorer";
import { AppRail, type RailItem } from "../../shared/components/AppRail";
import { ResizeHandle } from "../../shared/components/ResizeHandle";
import { TopBar } from "../../shared/components/TopBar";
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

type WorkspacePanel = Extract<RailItem, "history" | "settings">;

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
  const compactLayout = useMediaQuery("(max-width: 980px)");
  const editorRef = useRef<SqlEditorHandle>(null);
  const documents = useSqlDocuments(workspace.tabs, connection.id, editorRef);
  const completions = useSqlCompletions(workspace.objects);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
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
  const [explorerVisible, setExplorerVisible] = useState(() => !compactLayout);
  const [openPanel, setOpenPanel] = useState<WorkspacePanel | null>(null);
  const activeTab = workspace.tabs.activeTab;
  const activeQueryTab = activeTab.kind === "query" ? activeTab : null;
  const activeResult = activeQueryTab?.result ?? null;
  const activeSet =
    activeResult?.resultSets[workspace.activeResultIndex] ?? null;
  const resultCount = activeSet?.rows.length ?? 0;
  const queryBusy = workspace.runningTabId === activeQueryTab?.id;
  const dirty =
    activeQueryTab !== null &&
    activeQueryTab.sql !== activeQueryTab.lastExecutedSql;

  const commands = useWorkspaceCommands({
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
  useEffect(() => setExplorerVisible(!compactLayout), [compactLayout]);

  const togglePanel = (panel: WorkspacePanel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const resizeEditor = useCallback(
    (delta: number) => {
      const height = querySplitRef.current?.clientHeight ?? 0;
      if (height > 0) layout.resizeEditor((delta / height) * 100);
    },
    [layout],
  );

  const shellStyle = {
    "--explorer-width": `${layout.explorerWidth}px`,
  } as CSSProperties;
  const splitStyle = {
    "--editor-ratio": `${layout.editorRatio}fr`,
    "--results-ratio": `${100 - layout.editorRatio}fr`,
  } as CSSProperties;

  return (
    <div
      className={`workspace-shell ${explorerVisible ? "" : "explorer-hidden"}`}
      style={shellStyle}
    >
      {workspace.tabs.tabs
        .filter((tab) => tab.kind === "query")
        .map((tab) => (
          <FileWorkRisk key={tab.id} tab={tab} sessionId={connection.id} />
        ))}
      <AppRail
        connected={status === "active" || status === "busy"}
        activeItem={openPanel ?? "connections"}
        onConnections={onManageConnections}
        onHistory={() => togglePanel("history")}
        onSettings={() => togglePanel("settings")}
      />
      <Explorer
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
          if (compactLayout) setExplorerVisible(false);
        }}
        onToggle={workspace.toggleObject}
      />
      <ResizeHandle
        className="explorer-resize-handle"
        label="Resize database explorer"
        minimum={240}
        maximum={440}
        orientation="vertical"
        value={layout.explorerWidth}
        onResize={layout.resizeExplorer}
        onReset={layout.resetExplorer}
      />
      {compactLayout && explorerVisible && (
        <button
          className="explorer-backdrop"
          aria-label="Close database explorer"
          onClick={() => setExplorerVisible(false)}
        />
      )}
      <main className="query-workspace">
        <TopBar
          title={connection.database}
          subtitle={`${connection.username}@${connection.host}`}
          action={
            <div className="workspace-actions" data-no-drag>
              <button
                className="toolbar-button"
                title="Backup / Restore database"
                onClick={() => setBackupOpen(true)}
              >
                <HardDriveDownload size={17} />
                Backup / Restore
              </button>
              <button
                className="icon-button"
                title={`Commands · ${primaryModifierLabel} ⇧ P`}
                aria-label="Open command palette"
                onClick={() => setCommandsOpen(true)}
              >
                <Command size={17} />
              </button>
              <button
                className="icon-button"
                title="Query library"
                aria-label="Query library"
                onClick={() => setLibraryOpen(true)}
              >
                <BookMarked size={17} />
              </button>
              <EnvironmentBadge
                environment={connection.environment}
                readOnly={connection.readOnly}
              />
              <button
                className="icon-button"
                title={
                  workspace.runningTabId
                    ? "Wait for the query to finish"
                    : "Disconnect"
                }
                aria-label="Disconnect"
                disabled={workspace.runningTabId !== null}
                onClick={onDisconnect}
              >
                <Unplug size={17} />
              </button>
            </div>
          }
        />
        <WorkspaceTabs
          dirtyTableIds={dirtyTableIds}
          tabs={workspace.tabs.tabs}
          activeTabId={activeTab.id}
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
                className="icon-button subtle explorer-toggle"
                aria-label={`${explorerVisible ? "Hide" : "Show"} database explorer`}
                aria-controls={`database-explorer-${connection.id}`}
                aria-pressed={explorerVisible}
                title={`${explorerVisible ? "Hide" : "Show"} database explorer`}
                onClick={() => setExplorerVisible((visible) => !visible)}
              >
                {explorerVisible ? (
                  <PanelLeftClose size={17} />
                ) : (
                  <PanelLeftOpen size={17} />
                )}
              </button>
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
          {activeTab.kind === "query" ? (
            <div className="query-split" ref={querySplitRef} style={splitStyle}>
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
                      onClick={() => void documents.open()}
                      title="Open .sql file"
                    >
                      <FolderOpen size={15} />
                      Open
                    </button>
                    <button
                      className="toolbar-button"
                      disabled={documents.busy}
                      onClick={() => void documents.save()}
                      title="Save .sql file"
                    >
                      <Save size={15} />
                      Save
                    </button>
                    <button
                      className="toolbar-button"
                      disabled={documents.busy}
                      onClick={() => void documents.format()}
                      title="Format SQL · Undo restores the original"
                    >
                      <Wand2 size={15} />
                      Format
                    </button>
                    <button
                      className="toolbar-button"
                      onClick={() => void workspace.copyQuery()}
                    >
                      {workspace.copied ? (
                        <Check size={15} />
                      ) : (
                        <Copy size={15} />
                      )}
                      {workspace.copied ? "Copied" : "Copy"}
                    </button>
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
                className="query-resize-handle"
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
            .filter((tab) => tab.kind === "table")
            .map((tab) => (
              <div
                className="retained-table-workspace"
                key={tab.id}
                hidden={tab.id !== activeTab.id}
              >
                <TableWorkspace
                  active={active && tab.id === activeTab.id}
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
        <footer className="status-bar">
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
          <span>{connection.database}</span>
          <span className={"session-access env-" + connection.environment}>
            {connection.environment === "production" ? "PRODUCTION · " : ""}
            {connection.readOnly ? "Read-only" : "Read & write"}
          </span>
          <span className="status-spacer" />
          <span>
            {activeTab.kind === "query"
              ? `${workspace.queryPreferences.preferences.maxRows} row limit`
              : "Table browse mode"}
          </span>
          <span>UTF-8</span>
          <span
            className={
              activeTab.kind === "query" &&
              activeTab.executionMode === "autocommit"
                ? "autocommit-status"
                : ""
            }
            title={
              activeTab.kind === "query" &&
              activeTab.executionMode === "autocommit"
                ? "One statement per Run. Saves immediately; no application rollback."
                : "Each Run commits on success or rolls back on error. Manual transaction controls are not supported."
            }
          >
            {activeTab.kind === "query" &&
            activeTab.executionMode === "autocommit"
              ? "Autocommit · saves immediately"
              : "Atomic run"}
          </span>
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
