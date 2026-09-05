import {
  Check,
  Copy,
  Ellipsis,
  LayoutGrid,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Square,
  SquareTerminal,
  Unplug,
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
import type { ConnectionInfo } from "../../shared/types/database";
import { TableWorkspace } from "../table/TableWorkspace";
import { QueryHistoryPanel } from "./QueryHistoryPanel";
import { QueryPreferencesPanel } from "./QueryPreferencesPanel";
import { ResultsGrid } from "./ResultsGrid";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
import { useWorkspace } from "./useWorkspace";
import { useWorkspaceLayout } from "./useWorkspaceLayout";
import { WorkspaceTabs } from "./WorkspaceTabs";

type WorkspaceProps = {
  connection: ConnectionInfo;
  onDisconnect: () => void;
};

type WorkspacePanel = Extract<RailItem, "history" | "settings">;

export function Workspace({ connection, onDisconnect }: WorkspaceProps) {
  const workspace = useWorkspace(connection.database);
  const layout = useWorkspaceLayout();
  const compactLayout = useMediaQuery("(max-width: 980px)");
  const editorRef = useRef<SqlEditorHandle>(null);
  const querySplitRef = useRef<HTMLDivElement>(null);
  const [explorerVisible, setExplorerVisible] = useState(() => !compactLayout);
  const [openPanel, setOpenPanel] = useState<WorkspacePanel | null>(null);
  const activeTab = workspace.tabs.activeTab;
  const activeQueryTab = activeTab.kind === "query" ? activeTab : null;
  const activeResult = activeQueryTab?.result ?? null;
  const activeSet = activeResult?.resultSets[workspace.activeResultIndex] ?? null;
  const resultCount = activeSet?.rows.length ?? 0;
  const queryBusy = workspace.runningTabId === activeQueryTab?.id;
  const dirty =
    activeQueryTab !== null && activeQueryTab.sql !== activeQueryTab.lastExecutedSql;

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
      <AppRail
        connected
        activeItem={openPanel ?? "connections"}
        onConnections={() => setExplorerVisible((visible) => !visible)}
        onHistory={() => togglePanel("history")}
        onSettings={() => togglePanel("settings")}
      />
      <Explorer
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
        onRefresh={() => void workspace.refreshObjects()}
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
              <span className="version-pill">{connection.serverVersion}</span>
              <button
                className="icon-button"
                title={workspace.runningTabId ? "Wait for the query to finish" : "Disconnect"}
                aria-label="Disconnect"
                disabled={workspace.runningTabId !== null}
                onClick={onDisconnect}
              >
                <Unplug size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="More options"
                title="Coming soon"
                disabled
              >
                <Ellipsis size={18} />
              </button>
            </div>
          }
        />
        <WorkspaceTabs
          tabs={workspace.tabs.tabs}
          activeTabId={activeTab.id}
          runningTabId={workspace.runningTabId}
          onAddQuery={() => workspace.tabs.addQueryTab()}
          onClose={workspace.tabs.closeTab}
          onRenameQuery={workspace.tabs.renameQueryTab}
          onSelect={(id) => {
            workspace.tabs.setActiveTabId(id);
            workspace.setActiveResultIndex(0);
          }}
          endAction={
            <button
              className="icon-button subtle explorer-toggle"
              aria-label={`${explorerVisible ? "Hide" : "Show"} database explorer`}
              aria-controls="database-explorer"
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
          }
        />
        {activeTab.kind === "query" ? (
        <div className="query-split" ref={querySplitRef} style={splitStyle}>
          <section className="editor-pane" aria-label="SQL editor">
            <div className="editor-toolbar">
              <div className="query-path">
                <SquareTerminal size={14} />
                <span>{activeQueryTab?.title}</span>
                {dirty && <span className="unsaved">Modified</span>}
              </div>
              <div className="editor-actions">
                <button
                  className="toolbar-button"
                  onClick={() => void workspace.copyQuery()}
                >
                  {workspace.copied ? <Check size={15} /> : <Copy size={15} />}
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
                    title="Run selected SQL, or the entire editor when nothing is selected"
                    onClick={() => void workspace.runQuery(editorRef.current?.getSubmission())}
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
                errorPosition={activeTab.error?.position ?? null}
                onChange={(sql) => workspace.tabs.updateSql(activeTab.id, sql)}
                onRun={(submission) => void workspace.runQuery(submission)}
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
                <button disabled>
                  Messages {activeTab.error && <i />}
                </button>
              </div>
              {activeResult && activeResult.resultSets.length > 1 && (
                <div className="result-set-switcher" aria-label="Result sets">
                  {activeResult.resultSets.map((_, index) => (
                    <button
                      key={index}
                      className={index === workspace.activeResultIndex ? "active" : ""}
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
                  <span className="truncated">Limited to {resultCount}</span>
                )}
                <button
                  className="icon-button subtle"
                  aria-label="Result view options"
                  title="Coming soon"
                  disabled
                >
                  <LayoutGrid size={15} />
                </button>
              </div>
            </div>
            <ResultsGrid
              resultSet={activeSet}
              busy={queryBusy}
              error={activeTab.error}
            />
          </section>
        </div>
        ) : (
          <TableWorkspace
            key={activeTab.id}
            tab={activeTab}
            onOpenQuery={(sql, title) => workspace.tabs.addQueryTab(sql, title)}
            onOpenTable={(schema, table) => workspace.selectObject({
              schema, name: table, objectType: "table", estimatedRows: 0,
            })}
          />
        )}
        <footer className="status-bar">
          <span>
            <i /> Connected
          </span>
          <span>{connection.database}</span>
          <span className="status-spacer" />
          <span>
            {activeTab.kind === "query"
              ? `${workspace.queryPreferences.preferences.maxRows} row limit`
              : "Table browse mode"}
          </span>
          <span>UTF-8</span>
        </footer>
      </main>
      {openPanel === "history" && (
        <QueryHistoryPanel
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
    </div>
  );
}
