import { FolderPlus, X } from "lucide-react";
import { handleWindowDrag } from "../../shared/lib/window-drag";
import { WorkspaceGlyph } from "../../shared/components/WorkspaceGlyph";
import { useShellSessions } from "./ShellSessions";
import {
  environmentLabels,
  type ProductWorkspace,
  type ConnectionProfile,
} from "./connection-types";

/** The library's source list: open sessions to jump back into, then the
 * product workspaces. Same inset sidebar material as a session window. */
export function WorkspaceShelf({
  workspaces,
  profiles,
  workspace,
  available,
  onSelect,
  onCreate,
}: {
  workspaces: ProductWorkspace[];
  profiles: ConnectionProfile[];
  workspace?: ProductWorkspace;
  available: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const shell = useShellSessions();
  const sessions = shell?.sessions ?? [];
  return (
    <aside
      className="workspace-shelf"
      aria-label="Product workspaces"
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
    >
      <div className="library-titlebar-space" data-tauri-drag-region />
      <div className="workspace-shelf-scroll">
        {shell && sessions.length > 0 && (
          <section className="library-sessions" aria-label="Open sessions">
            <div className="library-sidebar-label">Open sessions</div>
            <ul>
              {sessions.map((session) => {
                const name = session.name || session.database;
                const caption = [
                  shell.workspaces.find(
                    (item) => item.id === session.workspaceId,
                  )?.name,
                  environmentLabels[session.environment],
                  session.readOnly ? "Read-only" : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={session.id}
                    className={"library-session env-" + session.environment}
                  >
                    <button
                      className="library-session-open"
                      title={`Show ${name}`}
                      onClick={() => shell.select(session.id)}
                    >
                      <i aria-hidden="true" />
                      <span>
                        <strong>{name}</strong>
                        <small>{caption}</small>
                      </span>
                    </button>
                    <button
                      className="library-session-close"
                      aria-label={`Disconnect ${name}`}
                      title={`Disconnect ${name}`}
                      disabled={shell.busy}
                      onClick={() => shell.close(session.id)}
                    >
                      <X size={11} strokeWidth={2.2} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div className="library-sidebar-label">Workspaces</div>
        <nav
          className="workspace-list"
          aria-label="Workspaces"
          onKeyDown={(event) => {
            // Source-list arrows: move and select, like a Finder sidebar.
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const direction =
              event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
            if (!direction || !workspaces.length) return;
            event.preventDefault();
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button",
              ),
            ];
            const from = buttons.indexOf(event.target as HTMLButtonElement);
            const next = Math.min(
              buttons.length - 1,
              Math.max(0, (from < 0 ? 0 : from) + direction),
            );
            buttons[next]?.focus();
            const id = workspaces[next]?.id;
            if (id && id !== workspace?.id) onSelect(id);
          }}
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              aria-current={w.id === workspace?.id ? "page" : undefined}
              className={w.id === workspace?.id ? "selected" : ""}
              title={w.name}
              onClick={() => onSelect(w.id)}
            >
              <WorkspaceGlyph name={w.name} />
              <span>{w.name}</span>
              <small>
                {profiles.filter((p) => p.workspaceId === w.id).length}
              </small>
            </button>
          ))}
        </nav>
      </div>
      <button
        className="new-workspace-button"
        disabled={!available}
        onClick={onCreate}
      >
        <FolderPlus size={15} />
        New workspace
      </button>
    </aside>
  );
}
