import { Database, LayoutGrid, LockKeyhole, X } from "lucide-react";
import { handleWindowDrag } from "../../shared/lib/window-drag";
import {
  environmentLabels,
  type ProductWorkspace,
  type SessionInfo,
} from "./connection-types";

export function SessionStrip({
  sessions,
  workspaces,
  activeId,
  busy,
  onSelect,
  onClose,
}: {
  sessions: SessionInfo[];
  workspaces: ProductWorkspace[];
  activeId: string | null;
  busy: boolean;
  onSelect: (id: string | null) => void;
  onClose: (id: string) => void;
}) {
  return (
    <nav
      className="session-strip"
      aria-label="Active connections"
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
    >
      <button
        className={
          "session-manager-button " + (activeId === null ? "selected" : "")
        }
        aria-pressed={activeId === null}
        onClick={() => onSelect(null)}
      >
        <LayoutGrid size={16} />
        Connections
      </button>
      <div className="session-tabs">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={
              "session-tab env-" +
              session.environment +
              (activeId === session.id ? " selected" : "")
            }
          >
            <button
              aria-pressed={activeId === session.id}
              onClick={() => onSelect(session.id)}
              title={
                session.host + ":" + session.port + " / " + session.database
              }
            >
              <Database size={15} />
              <span>
                {workspaces.find((w) => w.id === session.workspaceId)?.name} /{" "}
                <strong>{session.name}</strong>
              </span>
              <small>{environmentLabels[session.environment]}</small>
              {session.readOnly && (
                <LockKeyhole size={13} aria-label="Read-only" />
              )}
            </button>
            <button
              className="close-session-button"
              aria-label={"Disconnect " + session.name}
              disabled={busy}
              onClick={() => onClose(session.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </nav>
  );
}
