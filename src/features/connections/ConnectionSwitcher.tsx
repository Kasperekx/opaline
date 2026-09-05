import { Database, Plus, Search, Settings2 } from "lucide-react";
import { useState } from "react";
import { ConnectionDialog } from "./ConnectionDialog";
import { EnvironmentBadge } from "./EnvironmentBadge";
import type {
  ConnectionProfile,
  ProductWorkspace,
  SessionInfo,
} from "./connection-types";
import "./connection-switcher.css";

type Props = {
  current: SessionInfo;
  workspace?: ProductWorkspace;
  profiles: ConnectionProfile[];
  sessions: SessionInfo[];
  busy: boolean;
  onSelect: (profile: ConnectionProfile) => void;
  onManage: (create: boolean) => void;
  onClose: () => void;
};

export function ConnectionSwitcher({
  current,
  workspace,
  profiles,
  sessions,
  busy,
  onSelect,
  onManage,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const visible = profiles.filter(
    (profile) =>
      profile.workspaceId === current.workspaceId &&
      [profile.name, profile.host, profile.database, profile.environment].some(
        (value) => value.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  return (
    <ConnectionDialog
      title="Switch connection"
      subtitle={workspace?.name ?? "Workspace"}
      className="connection-switcher-dialog"
      onClose={onClose}
    >
      <div className="connection-switcher">
        <label className="switcher-search">
          <Search size={17} />
          <input
            data-initial-focus="true"
            aria-label="Find a workspace connection"
            placeholder="Search name, database or environment…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="switcher-list" aria-label="Workspace connections">
          {visible.map((profile) => {
            const isCurrent = profile.id === current.profileId;
            const connected = sessions.some(
              (session) => session.profileId === profile.id,
            );
            const destination = `${profile.database} · ${profile.host}:${profile.port}`;
            return (
              <button
                key={profile.id}
                className="switcher-row"
                aria-current={isCurrent || undefined}
                disabled={busy}
                onClick={() => onSelect(profile)}
              >
                <span className="switcher-icon" aria-hidden="true">
                  <Database size={19} />
                </span>
                <span className="switcher-identity">
                  <strong title={profile.name}>{profile.name}</strong>
                  <small title={destination}>{destination}</small>
                </span>
                <span className="switcher-state">
                  <EnvironmentBadge
                    environment={profile.environment}
                    readOnly={profile.readOnly}
                  />
                  <small className="switcher-status">
                    {isCurrent
                      ? "Current"
                      : connected
                        ? "Open session"
                        : "Not connected"}
                  </small>
                </span>
              </button>
            );
          })}
          {!visible.length && (
            <p className="switcher-empty">
              No matching connections in this workspace.
            </p>
          )}
        </div>
        <footer className="switcher-footer">
          <button
            className="button ghost"
            disabled={busy}
            onClick={() => onManage(true)}
          >
            <Plus size={16} />
            New connection
          </button>
          <button
            className="button ghost"
            disabled={busy}
            onClick={() => onManage(false)}
          >
            <Settings2 size={16} />
            Manage workspaces
          </button>
        </footer>
      </div>
    </ConnectionDialog>
  );
}
