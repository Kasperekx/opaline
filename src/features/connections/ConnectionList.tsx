import { Database, Folder, Pencil, Plus, Search, X } from "lucide-react";
import { ConnectionRow } from "./ConnectionRow";
import { handleWindowDrag } from "../../shared/lib/window-drag";
import {
  environments,
  environmentLabels,
  type ConnectionProfile,
  type ProductWorkspace,
  type SessionInfo,
} from "./connection-types";

export function ConnectionList({
  workspace,
  visible,
  profileCount,
  sessions,
  loading,
  available,
  search,
  environment,
  onSearch,
  onEnvironment,
  onSelect,
  onConnect,
  onEdit,
  onRename,
  onCreate,
  onTransfer,
  onRemoveWorkspace,
}: {
  workspace?: ProductWorkspace;
  visible: ConnectionProfile[];
  profileCount: number;
  sessions: SessionInfo[];
  loading: boolean;
  available: boolean;
  search: string;
  environment: string;
  onSearch: (value: string) => void;
  onEnvironment: (value: string) => void;
  onSelect: (id: string) => void;
  onConnect: (profile: ConnectionProfile) => void;
  onEdit: (profile: ConnectionProfile) => void;
  onRename: () => void;
  onCreate: () => void;
  onTransfer?: () => void;
  onRemoveWorkspace?: () => void;
}) {
  const filtered = search.length > 0 || environment !== "all";
  const activeProfileIds = new Set(
    sessions.map((session) => session.profileId),
  );
  const resetFilters = () => {
    onSearch("");
    onEnvironment("all");
  };
  return (
    <section
      className={"connection-list-panel" + (profileCount ? "" : " is-empty")}
      aria-label="Saved connections"
    >
      <header
        className="connection-workspace-header"
        onMouseDown={handleWindowDrag}
        data-tauri-drag-region
      >
        <div className="workspace-heading">
          {workspace && (
            <div className="workspace-context">
              <Folder size={15} />
              <span>Workspace</span>
              <span>/</span>
              <span>Connections</span>
            </div>
          )}
          <div className="workspace-heading-title">
            <h1>{workspace?.name ?? "Connections"}</h1>
            {workspace && (
              <button
                className="icon-button"
                aria-label="Rename workspace"
                title="Rename workspace"
                disabled={!available}
                onClick={onRename}
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>
        {workspace && (
          <button
            className="button primary"
            disabled={!available}
            onClick={onCreate}
          >
            <Plus size={17} />
            New connection
          </button>
        )}
      </header>
      {profileCount > 0 && (
        <div className="connection-list-tools">
          <label className="connection-search">
            <Search size={17} />
            <input
              aria-label="Search connections"
              placeholder="Search connections…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
            {search && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => onSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <label className="environment-filter">
            <span className="sr-only">Environment</span>
            <select
              value={environment}
              onChange={(e) => onEnvironment(e.target.value)}
            >
              <option value="all">All environments</option>
              {environments.map((env) => (
                <option key={env} value={env}>
                  {environmentLabels[env]}
                </option>
              ))}
            </select>
          </label>
          <span className="connection-count" role="status">
            {loading
              ? "Loading…"
              : `${filtered ? `${visible.length} of ` : ""}${profileCount} ${profileCount === 1 ? "connection" : "connections"}`}
          </span>
        </div>
      )}
      <div className="connection-list-content" aria-busy={loading}>
        {visible.length > 0 ? (
          <>
            <div className="connection-list-columns" aria-hidden="true">
              <span>Connection</span>
              <span>Destination</span>
              <span>Environment</span>
              <span />
            </div>
            <ul className="connection-list">
              {visible.map((profile) => (
                <ConnectionRow
                  key={profile.id}
                  profile={profile}
                  active={activeProfileIds.has(profile.id)}
                  available={available}
                  onDetails={() => onSelect(profile.id)}
                  onConnect={() => onConnect(profile)}
                  onEdit={() => onEdit(profile)}
                />
              ))}
            </ul>
            {!filtered && (
              <button
                className="connection-add-row"
                disabled={!available}
                onClick={onCreate}
              >
                <Plus size={16} />
                Add connection to {workspace?.name}
              </button>
            )}
          </>
        ) : (
          <div className="connection-list-empty">
            <span className="empty-connection-icon">
              {filtered ? <Search size={23} /> : <Database size={23} />}
            </span>
            <h2>
              {loading
                ? "Loading connections…"
                : filtered
                  ? "No matching connections"
                  : workspace
                    ? "Add your first connection"
                    : "Create your first workspace"}
            </h2>
            <p>
              {loading
                ? "Reading profiles from this device."
                : filtered
                  ? "Try another name, database or environment."
                  : workspace
                    ? `Keep the local, staging and production databases for ${workspace.name} together.`
                    : "Group connections by product. Start with a workspace, then add a PostgreSQL database."}
            </p>
            {!loading && (
              <button
                className="button secondary"
                disabled={!available}
                onClick={filtered ? resetFilters : onCreate}
              >
                {filtered ? <X size={16} /> : <Plus size={16} />}
                {filtered
                  ? "Clear filters"
                  : workspace
                    ? "Add PostgreSQL connection"
                    : "Create workspace"}
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="connection-list-footer">
        {workspace && (
          <div className="p1-inline">
            <button
              className="toolbar-button"
              disabled={!available}
              onClick={onTransfer}
            >
              Import / export profiles
            </button>
            <button
              className="toolbar-button"
              disabled={!available}
              onClick={onRemoveWorkspace}
            >
              Remove workspace
            </button>
          </div>
        )}
        <span>
          <Database size={14} />
          PostgreSQL
        </span>
        <span>
          Select a connection for details · Connect to open the SQL editor
        </span>
      </footer>
    </section>
  );
}
