import {
  Database,
  Pencil,
  Plus,
  Search,
  X,
  ArrowDownUp,
  Trash2,
} from "lucide-react";
import { ActionMenu } from "../../shared/components/ActionMenu";
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
  selectedId,
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
  selectedId?: string;
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
          <p className="workspace-description">
            {workspace
              ? "Connection library"
              : "Organize your connections by project."}
          </p>
        </div>
        {workspace && profileCount > 0 && (
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
            {environments.map((env) => {
              const group = visible.filter(
                (profile) => profile.environment === env,
              );
              if (!group.length) return null;
              return (
                <section
                  className={`connection-environment-group env-${env}`}
                  key={env}
                  aria-label={`${environmentLabels[env]} connections`}
                >
                  <header className="environment-group-heading">
                    <i aria-hidden="true" />
                    <h2>{environmentLabels[env]}</h2>
                    <span>{group.length}</span>
                    {env === "production" && (
                      <small>Live data · use with care</small>
                    )}
                  </header>
                  <ul className="connection-list">
                    {group.map((profile) => (
                      <ConnectionRow
                        key={profile.id}
                        profile={profile}
                        active={activeProfileIds.has(profile.id)}
                        selected={selectedId === profile.id}
                        available={available}
                        onDetails={() => onSelect(profile.id)}
                        onConnect={() => onConnect(profile)}
                        onEdit={() => onEdit(profile)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
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
          <ActionMenu
            label="Workspace actions"
            disabled={!available}
            actions={[
              { label: "Rename workspace", icon: Pencil, onSelect: onRename },
              ...(onTransfer
                ? [
                    {
                      label: "Import / export profiles",
                      icon: ArrowDownUp,
                      onSelect: onTransfer,
                    },
                  ]
                : []),
              ...(onRemoveWorkspace
                ? [
                    {
                      label: "Remove workspace",
                      icon: Trash2,
                      danger: true,
                      separator: true,
                      onSelect: onRemoveWorkspace,
                    },
                  ]
                : []),
            ]}
          />
        )}
        <span>
          <Database size={14} />
          PostgreSQL
        </span>
        <span>Connection details stay on this device</span>
      </footer>
    </section>
  );
}
