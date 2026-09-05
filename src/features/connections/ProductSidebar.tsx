import { Folder, FolderPlus, Plus, ShieldCheck } from "lucide-react";
import { BrandMark } from "../../shared/components/BrandMark";
import type { ProductWorkspace, ConnectionProfile } from "./connection-types";

export function ProductSidebar({
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
    <aside className="product-sidebar" aria-label="Product workspaces">
      <div className="connection-brand">
        <BrandMark />
        <strong>Opaline</strong>
      </div>
      <div className="product-sidebar-heading">
        <span>Workspaces</span>
        {workspaces.length > 0 && (
          <button
            className="icon-button"
            aria-label="Add workspace"
            disabled={!available}
            onClick={onCreate}
          >
            <Plus size={17} />
          </button>
        )}
      </div>
      <label className="compact-workspace-picker">
        <span>Workspace</span>
        <select
          aria-label="Workspace"
          value={workspace?.id ?? ""}
          onChange={(e) => onSelect(e.target.value)}
        >
          {!workspace && <option value="">No workspaces</option>}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <nav className="workspace-list" aria-label="Workspaces">
        {workspaces.map((w) => (
          <button
            key={w.id}
            aria-current={w.id === workspace?.id ? "page" : undefined}
            className={w.id === workspace?.id ? "selected" : ""}
            onClick={() => onSelect(w.id)}
          >
            <Folder size={18} />
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
      <div className="local-first-note">
        <ShieldCheck size={18} />
        <span>
          Stored on this device<small>Credentials in your system vault</small>
        </span>
      </div>
    </aside>
  );
}
