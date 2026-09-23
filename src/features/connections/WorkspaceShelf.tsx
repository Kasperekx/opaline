import { FolderPlus } from "lucide-react";
import { handleWindowDrag } from "../../shared/lib/window-drag";
import { WorkspaceGlyph } from "../../shared/components/WorkspaceGlyph";
import type { ProductWorkspace, ConnectionProfile } from "./connection-types";

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
  return (
    <aside
      className="workspace-shelf"
      aria-label="Product workspaces"
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
    >
      <div className="workspace-shelf-heading">Workspaces</div>
      <nav className="workspace-list" aria-label="Workspaces">
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
      <button
        className="new-workspace-button"
        disabled={!available}
        onClick={onCreate}
      >
        <FolderPlus size={17} />
        New workspace
      </button>
    </aside>
  );
}
