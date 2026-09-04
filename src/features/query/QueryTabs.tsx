import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { QueryTab } from "./query-types";

type QueryTabsProps = {
  tabs: QueryTab[];
  activeTabId: string;
  runningTabId: string | null;
  endAction: ReactNode;
  onAdd: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
};

export function QueryTabs({
  tabs,
  activeTabId,
  runningTabId,
  endAction,
  onAdd,
  onClose,
  onRename,
  onSelect,
}: QueryTabsProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.select(), [editingTabId]);

  const startRenaming = (tab: QueryTab) => {
    setEditingTabId(tab.id);
    setDraftTitle(tab.title);
  };

  const finishRenaming = () => {
    if (editingTabId) onRename(editingTabId, draftTitle);
    setEditingTabId(null);
  };

  return (
    <div className="tab-bar">
      <div
        className="query-tabs-scroll"
        role="tablist"
        aria-label="SQL query tabs"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const running = tab.id === runningTabId;
          const dirty = tab.sql !== tab.lastExecutedSql;
          return (
            <div className={`editor-tab ${active ? "active" : ""}`} key={tab.id}>
              {editingTabId === tab.id ? (
                <div
                  className="tab-select editing"
                  role="tab"
                  aria-selected={active}
                >
                  <span className={`tab-dot ${dirty ? "dirty" : ""}`} />
                  <input
                    ref={inputRef}
                    value={draftTitle}
                    aria-label="Query tab name"
                    onBlur={finishRenaming}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") finishRenaming();
                      if (event.key === "Escape") setEditingTabId(null);
                    }}
                  />
                </div>
              ) : (
                <button
                  className="tab-select"
                  role="tab"
                  aria-selected={active}
                  title="Double-click to rename"
                  onClick={() => onSelect(tab.id)}
                  onDoubleClick={() => startRenaming(tab)}
                >
                  {running ? (
                    <Loader2 className="spin" size={13} />
                  ) : (
                    <span className={`tab-dot ${dirty ? "dirty" : ""}`} />
                  )}
                  <span>{tab.title}</span>
                </button>
              )}
              <button
                className="tab-close"
                aria-label={`Close ${tab.title}`}
                disabled={tabs.length === 1 || running}
                onClick={() => onClose(tab.id)}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="new-tab" aria-label="New query" onClick={onAdd}>
        <Plus size={17} />
      </button>
      <div className="tab-spacer" />
      {endAction}
    </div>
  );
}
