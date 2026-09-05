import { FileCode2, Loader2, Plus, Table2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { QueryTab, WorkspaceTab } from "./query-types";

type WorkspaceTabsProps = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  runningTabId: string | null;
  dirtyTableIds?: ReadonlySet<string>;
  endAction: ReactNode;
  onAddQuery: () => void;
  onClose: (id: string) => void;
  onRenameQuery: (id: string, title: string) => void;
  onSelect: (id: string) => void;
};

export function WorkspaceTabs({
  tabs,
  activeTabId,
  runningTabId,
  dirtyTableIds,
  endAction,
  onAddQuery,
  onClose,
  onRenameQuery,
  onSelect,
}: WorkspaceTabsProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const renameFocusId = useRef<string | null>(null);

  useEffect(() => {
    if (editingTabId) inputRef.current?.select();
    else if (renameFocusId.current) {
      const id = renameFocusId.current;
      const buttons =
        listRef.current?.querySelectorAll<HTMLButtonElement>(
          'button[role="tab"]',
        );
      Array.from(buttons ?? [])
        .find((button) => button.dataset.tabId === id)
        ?.focus();
      renameFocusId.current = null;
    }
  }, [editingTabId]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  const startRenaming = (tab: QueryTab) => {
    setEditingTabId(tab.id);
    setDraftTitle(tab.title);
  };

  const finishRenaming = () => {
    if (editingTabId) onRenameQuery(editingTabId, draftTitle);
    setEditingTabId(null);
  };

  return (
    <div className="tab-bar">
      <div
        className="query-tabs-scroll"
        role="tablist"
        aria-label="Workspace tabs"
        ref={listRef}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const running = tab.id === runningTabId;
          const dirty =
            tab.kind === "query"
              ? tab.sql !== tab.lastExecutedSql
              : dirtyTableIds?.has(tab.id);
          return (
            <div
              className={`editor-tab ${tab.kind} ${active ? "active" : ""}`}
              key={tab.id}
            >
              {tab.kind === "query" && editingTabId === tab.id ? (
                <div
                  className="tab-select editing"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                >
                  <FileCode2 size={14} />
                  <input
                    ref={inputRef}
                    value={draftTitle}
                    aria-label="Query tab name"
                    onBlur={finishRenaming}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        renameFocusId.current = tab.id;
                        if (event.key === "Enter") finishRenaming();
                        else setEditingTabId(null);
                      }
                    }}
                  />
                </div>
              ) : (
                <button
                  className="tab-select"
                  role="tab"
                  data-tab-id={tab.id}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  title={
                    tab.kind === "query"
                      ? `${tab.title} · Double-click or F2 to rename`
                      : `${tab.schema}.${tab.table}`
                  }
                  onClick={() => onSelect(tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === "F2" && tab.kind === "query") {
                      event.preventDefault();
                      startRenaming(tab);
                      return;
                    }
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const index = tabs.findIndex((item) => item.id === tab.id);
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : (index +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              tabs.length) %
                            tabs.length;
                    onSelect(tabs[next].id);
                    listRef.current
                      ?.querySelectorAll<HTMLElement>('button[role="tab"]')
                      [next]?.focus();
                  }}
                  onDoubleClick={() => {
                    if (tab.kind === "query") startRenaming(tab);
                  }}
                >
                  {running ? (
                    <Loader2 className="spin" size={14} />
                  ) : tab.kind === "table" ? (
                    <Table2 size={14} />
                  ) : (
                    <FileCode2 size={14} />
                  )}
                  {dirty && (
                    <span
                      className={`tab-dot dirty ${tab.kind === "table" ? "table-tab-dirty" : ""}`}
                      aria-label={
                        tab.kind === "table"
                          ? "Unsaved table changes"
                          : "Modified"
                      }
                    />
                  )}
                  <span>{tab.title}</span>
                </button>
              )}
              <button
                className="tab-close"
                aria-label={`Close ${tab.title}`}
                disabled={tabs.length === 1 || running}
                tabIndex={active ? 0 : -1}
                onClick={() => onClose(tab.id)}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="new-tab"
        aria-label="New SQL query"
        title="New SQL query"
        onClick={onAddQuery}
      >
        <Plus size={17} />
      </button>
      <div className="tab-spacer" />
      <div className="workspace-tab-actions">{endAction}</div>
    </div>
  );
}
