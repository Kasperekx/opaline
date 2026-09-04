import CodeMirror from "@uiw/react-codemirror";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import {
  Check,
  Copy,
  Ellipsis,
  LayoutGrid,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  SquareTerminal,
  Unplug,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Explorer } from "../explorer/Explorer";
import { AppRail } from "../../shared/components/AppRail";
import { TopBar } from "../../shared/components/TopBar";
import { useMediaQuery } from "../../shared/hooks/useMediaQuery";
import type { ConnectionInfo } from "../../shared/types/database";
import { editorTheme, sqlHighlighting } from "./editor-theme";
import { ResultsGrid } from "./ResultsGrid";
import { useWorkspace } from "./useWorkspace";

type WorkspaceProps = {
  connection: ConnectionInfo;
  onDisconnect: () => void;
};

export function Workspace({ connection, onDisconnect }: WorkspaceProps) {
  const workspace = useWorkspace();
  const compactLayout = useMediaQuery("(max-width: 980px)");
  const [explorerVisible, setExplorerVisible] = useState(() => !compactLayout);
  const activeSet = workspace.result?.resultSets[workspace.activeResultIndex] ?? null;
  const resultCount = activeSet?.rows.length ?? 0;

  useEffect(() => {
    setExplorerVisible(!compactLayout);
  }, [compactLayout]);

  return (
    <div
      className={`workspace-shell ${explorerVisible ? "" : "explorer-hidden"}`}
    >
      <AppRail connected />
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
        onToggle={(object) => workspace.toggleObject(object)}
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
                title="Disconnect"
                aria-label="Disconnect"
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
        <div className="tab-bar">
          <div className="editor-tab active">
            <span className="tab-dot" /> Query 1 <X size={13} />
          </div>
          <button className="new-tab" aria-label="New query" title="Coming soon" disabled>
            <Plus size={16} />
          </button>
          <div className="tab-spacer" />
          <button
            className="icon-button subtle"
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
        </div>
        <section className="editor-pane" aria-label="SQL editor">
          <div className="editor-toolbar">
            <div className="query-path">
              <SquareTerminal size={14} />
              <span>Query 1</span>
              <span className="unsaved">Unsaved</span>
            </div>
            <div className="editor-actions">
              <button className="toolbar-button" onClick={() => void workspace.copyQuery()}>
                {workspace.copied ? <Check size={15} /> : <Copy size={15} />}
                {workspace.copied ? "Copied" : "Copy"}
              </button>
              <button
                className="run-button"
                onClick={() => void workspace.runQuery()}
                disabled={workspace.queryBusy}
              >
                {workspace.queryBusy ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                Run <kbd>⌘↵</kbd>
              </button>
            </div>
          </div>
          <div className="code-editor">
            <CodeMirror
              value={workspace.query}
              height="100%"
              extensions={[
                sql({ dialect: PostgreSQL }),
                editorTheme,
                sqlHighlighting,
              ]}
              onChange={workspace.setQuery}
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
              <button className="active">
                Results {activeSet && <span>{resultCount}</span>}
              </button>
              <button disabled>
                Messages {workspace.queryError && <i />}
              </button>
            </div>
            {workspace.result && workspace.result.resultSets.length > 1 && (
              <div className="result-set-switcher" aria-label="Result sets">
                {workspace.result.resultSets.map((_, index) => (
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
              {workspace.result && (
                <>
                  <span>
                    {resultCount} {resultCount === 1 ? "row" : "rows"}
                  </span>
                  <span>{workspace.result.durationMs} ms</span>
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
            busy={workspace.queryBusy}
            error={workspace.queryError}
          />
        </section>
        <footer className="status-bar">
          <span>
            <i /> Connected
          </span>
          <span>{connection.database}</span>
          <span className="status-spacer" />
          <span>UTF-8</span>
        </footer>
      </main>
    </div>
  );
}
