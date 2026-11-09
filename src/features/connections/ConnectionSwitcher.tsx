import {
  ArrowLeftRight,
  Database,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { Sheet } from "../../shared/components/Sheet";
import { EnvironmentBadge } from "./EnvironmentBadge";
import type {
  ConnectionProfile,
  ProductWorkspace,
  SessionInfo,
} from "./connection-types";
import { rememberProfile } from "./last-profile";
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
    <Sheet
      title="Switch connection"
      subtitle={workspace?.name ?? "Workspace"}
      className="connection-switcher-dialog"
      icon={ArrowLeftRight}
      size={560}
      onClose={onClose}
    >
      <div
        className="connection-switcher"
        onKeyDown={(event) => {
          // Arrows walk search -> rows (and back up to search); Return on a
          // row is the button's own activation.
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const direction =
            event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
          if (!direction) return;
          const stops = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              ".switcher-search input, .switcher-row:not(:disabled)",
            ),
          ];
          const from = stops.indexOf(event.target as HTMLElement);
          if (from < 0 || stops.length < 2) return;
          event.preventDefault();
          // From search, skip the current connection when another exists.
          let next = from + direction;
          if (
            from === 0 &&
            direction === 1 &&
            stops[1]?.getAttribute("aria-current") === "true" &&
            stops.length > 2
          )
            next = 2;
          stops[Math.min(stops.length - 1, Math.max(0, next))]?.focus();
        }}
      >
        <label className="switcher-search search-capsule">
          <Search size={13} aria-hidden="true" />
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
            const destination = `${profile.username}@${profile.host}:${profile.port}/${profile.database}`;
            return (
              <button
                key={profile.id}
                className={"switcher-row env-" + profile.environment}
                aria-current={isCurrent || undefined}
                disabled={busy}
                onClick={() => {
                  rememberProfile(profile.workspaceId, profile.id);
                  onSelect(profile);
                }}
              >
                <span className="switcher-icon" aria-hidden="true">
                  <Database size={16} strokeWidth={1.6} />
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
            <Plus size={14} />
            New connection
          </button>
          <button
            className="button ghost"
            disabled={busy}
            onClick={() => onManage(false)}
          >
            <Settings2 size={14} />
            Manage workspaces
          </button>
        </footer>
      </div>
    </Sheet>
  );
}
