import {
  Ban,
  CheckCircle2,
  Clock3,
  TimerOff,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { QueryHistoryEntry } from "./query-types";

type QueryHistoryPanelProps = {
  entries: QueryHistoryEntry[];
  onClear: () => void;
  onClose: () => void;
  onOpen: (entry: QueryHistoryEntry) => void;
};

const statusIcon = {
  success: CheckCircle2,
  error: XCircle,
  cancelled: Ban,
  timeout: TimerOff,
};

const formatDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function QueryHistoryPanel({
  entries,
  onClear,
  onClose,
  onOpen,
}: QueryHistoryPanelProps) {
  return (
    <aside className="workspace-drawer" aria-label="Query history">
      <header className="drawer-header">
        <div>
          <span className="section-kicker">Workspace</span>
          <h2>Query history</h2>
        </div>
        <button className="icon-button" aria-label="Close history" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      <div className="drawer-toolbar">
        <span>{entries.length} recent queries</span>
        <button onClick={onClear} disabled={entries.length === 0}>
          <Trash2 size={14} /> Clear
        </button>
      </div>

      <div className="history-list">
        {entries.length === 0 ? (
          <div className="drawer-empty">
            <Clock3 size={24} />
            <strong>No query history yet</strong>
            <span>Executed queries will appear here.</span>
          </div>
        ) : (
          entries.map((entry) => {
            const StatusIcon = statusIcon[entry.status];
            const summary = entry.sql.trim().split(/\r?\n/)[0] || "Empty query";
            return (
              <button
                className={`history-entry ${entry.status}`}
                key={entry.id}
                onClick={() => onOpen(entry)}
              >
                <StatusIcon size={15} />
                <span className="history-entry-copy">
                  <strong>{summary}</strong>
                  <small>
                    {entry.database} · {formatDate.format(new Date(entry.executedAt))}
                  </small>
                </span>
                <span className="history-entry-meta">
                  {entry.durationMs} ms
                  {entry.status === "success" && ` · ${entry.rowCount} rows`}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
