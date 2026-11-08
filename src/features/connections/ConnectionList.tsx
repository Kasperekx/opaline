import {
  Database,
  Pencil,
  Plus,
  Search,
  X,
  ArrowDownUp,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { WorkspaceGlyph } from "../../shared/components/WorkspaceGlyph";
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
  currentId,
  onCurrent,
  connectingId,
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
  /** Preferred keyboard selection (last used); falls back to the first row. */
  currentId?: string | null;
  onCurrent?: (id: string) => void;
  connectingId?: string | null;
}) {
  // Display order: grouped by environment, as rendered below.
  const ordered = environments.flatMap((env) =>
    visible.filter((profile) => profile.environment === env),
  );
  const current =
    ordered.find((profile) => profile.id === currentId) ?? ordered[0];
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const caretToEnd = useRef(false);
  const focusRow = (id: string) => {
    onCurrent?.(id);
    const row = [
      ...(listRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ??
        []),
    ].find((element) => element.dataset.rowId === id);
    row?.querySelector<HTMLElement>(".connection-row-main")?.focus();
  };
  const connect = (profile: ConnectionProfile) => {
    if (available) onConnect(profile);
  };
  // Cmd/Ctrl+F or +K focuses search while the library is on screen.
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey)
        return;
      const key = event.key.toLowerCase();
      if (key !== "f" && key !== "k") return;
      const input = searchRef.current;
      if (
        !input ||
        panelRef.current?.closest("[hidden]") ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  // Type-to-search leaves the caret after the typed character.
  useLayoutEffect(() => {
    if (!caretToEnd.current) return;
    caretToEnd.current = false;
    const input = searchRef.current;
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [search]);
  // On first paint with rows, take focus if nothing else has it, so Return
  // reopens the preselected (last used) connection straight away.
  const autoFocused = useRef(false);
  const firstId = current?.id;
  useEffect(() => {
    if (autoFocused.current || !firstId) return;
    autoFocused.current = true;
    const focused = document.activeElement;
    if (
      (!focused || focused === document.body) &&
      !panelRef.current?.closest("[hidden]")
    ) {
      const row = listRef.current?.querySelector<HTMLElement>(
        ".is-current .connection-row-main",
      );
      row?.focus({ preventScroll: true });
    }
  }, [firstId]);
  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    const rowId = target.closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
    if (!rowId || !ordered.length) return;
    const modified = event.metaKey || event.ctrlKey || event.altKey;
    const at = Math.max(
      0,
      ordered.findIndex((profile) => profile.id === rowId),
    );
    const step =
      event.key === "ArrowDown"
        ? at + 1
        : event.key === "ArrowUp"
          ? at - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? ordered.length - 1
              : null;
    if (step !== null && !modified) {
      event.preventDefault();
      const next = ordered[Math.min(ordered.length - 1, Math.max(0, step))]!;
      focusRow(next.id);
      return;
    }
    if (
      event.key === "Enter" &&
      !modified &&
      target.classList.contains("connection-row-main")
    ) {
      // Return connects (or opens) the selected profile; Space, the native
      // button activation, opens its details.
      event.preventDefault();
      const profile = ordered.find((item) => item.id === rowId);
      if (profile) connect(profile);
      return;
    }
    if (!modified && event.key.length === 1 && event.key !== " ") {
      event.preventDefault();
      caretToEnd.current = true;
      onSearch(search + event.key);
      searchRef.current?.focus();
    }
  };
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
      ref={panelRef}
      className={"connection-list-panel" + (profileCount ? "" : " is-empty")}
      aria-label="Saved connections"
    >
      <header
        className="connection-workspace-header"
        onMouseDown={handleWindowDrag}
        data-tauri-drag-region
      >
        <div className="workspace-heading">
          {workspace && <WorkspaceGlyph name={workspace.name} />}
          <h1>{workspace?.name ?? "Connections"}</h1>
          {workspace && (
            <button
              className="icon-button subtle"
              aria-label="Rename workspace"
              title="Rename workspace"
              disabled={!available}
              onClick={onRename}
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
        {profileCount > 0 && (
          <div className="connection-list-tools">
            <label className="connection-search search-capsule">
              <Search size={13} aria-hidden="true" />
              <input
                ref={searchRef}
                aria-label="Search connections"
                placeholder="Search connections"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    if (search) onSearch("");
                    else if (current) focusRow(current.id);
                    else event.currentTarget.blur();
                  } else if (event.key === "ArrowDown" && current) {
                    event.preventDefault();
                    focusRow(current.id);
                  } else if (event.key === "Enter" && current) {
                    event.preventDefault();
                    connect(current);
                  }
                }}
              />
              {search && (
                <button
                  className="connection-search-clear"
                  aria-label="Clear search"
                  onClick={() => onSearch("")}
                >
                  <X size={10} strokeWidth={2.4} />
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
            {workspace && (
              <button
                className="icon-button"
                aria-label="New connection"
                title="New connection"
                disabled={!available}
                onClick={onCreate}
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        )}
      </header>
      <div
        ref={listRef}
        className="connection-list-content"
        aria-busy={loading}
        onKeyDown={onListKeyDown}
      >
        {visible.length > 0 ? (
          environments.map((env) => {
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
                      current={current?.id === profile.id}
                      connecting={connectingId === profile.id}
                      available={available}
                      onFocusRow={() => onCurrent?.(profile.id)}
                      onDetails={() => onSelect(profile.id)}
                      onConnect={() => onConnect(profile)}
                      onEdit={() => onEdit(profile)}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        ) : (
          <div className="connection-list-empty">
            <span className="empty-connection-icon" aria-hidden="true">
              {filtered ? <Search size={22} /> : <Database size={22} />}
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
                className={"button " + (filtered ? "secondary" : "primary")}
                disabled={!available}
                onClick={filtered ? resetFilters : onCreate}
              >
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
        {profileCount > 0 && (
          <span className="connection-count" role="status">
            {loading
              ? "Loading…"
              : `${filtered ? `${visible.length} of ` : ""}${profileCount} ${profileCount === 1 ? "connection" : "connections"}`}
          </span>
        )}
        <span className="connection-list-engine">
          <Database size={12} aria-hidden="true" />
          PostgreSQL
        </span>
      </footer>
    </section>
  );
}
