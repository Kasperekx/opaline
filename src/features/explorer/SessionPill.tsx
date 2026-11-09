import {
  ArrowLeftRight,
  ChevronsUpDown,
  Database,
  LibraryBig,
  Unplug,
} from "lucide-react";
import {
  ActionMenu,
  type MenuAction,
} from "../../shared/components/ActionMenu";
import type { ConnectionInfo } from "../../shared/types/database";
import {
  environmentLabels,
  type Environment,
  type SessionInfo,
} from "../connections/connection-types";
import { useShellSessions } from "../connections/ShellSessions";

const environmentColor: Record<Environment, string> = {
  local: "var(--env-local)",
  staging: "var(--env-staging)",
  production: "var(--env-production)",
};

const isSession = (value: ConnectionInfo): value is SessionInfo =>
  "id" in value && "environment" in value;

/** The sidebar's connection pill: which database this window is working in,
 * and the one place to switch, disconnect or return to the library. */
export function SessionPill({
  connection,
  onSwitchConnection,
}: {
  connection: ConnectionInfo;
  onSwitchConnection: () => void;
}) {
  const shell = useShellSessions();
  const session = isSession(connection) ? connection : null;
  const title = connection.name || connection.database;
  const workspace = session
    ? shell?.workspaces.find((item) => item.id === session.workspaceId)?.name
    : undefined;
  const subtitle = session
    ? [
        workspace,
        environmentLabels[session.environment],
        session.readOnly ? "Read-only" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : connection.database;
  const content = (
    <>
      <span className="session-pill-icon">
        <Database size={16} aria-hidden="true" />
        {session && (
          <i
            className={"session-pill-dot env-" + session.environment}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="session-pill-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
      <ChevronsUpDown size={14} aria-hidden="true" />
    </>
  );

  if (!shell || !session)
    return (
      <button
        className="session-pill"
        aria-label={`Switch connection: ${title}`}
        aria-haspopup="dialog"
        onClick={onSwitchConnection}
      >
        {content}
      </button>
    );

  const actions: MenuAction[] = [
    ...shell.sessions.map((item, index) => ({
      key: "session-" + item.id,
      heading: index === 0 ? "Open sessions" : undefined,
      label: item.name || item.database,
      detail:
        environmentLabels[item.environment] +
        (item.readOnly ? " · Read-only" : "") +
        " · " +
        item.host +
        ":" +
        item.port,
      icon: Database,
      iconColor: environmentColor[item.environment],
      checked: item.id === session.id,
      onSelect: () => shell.select(item.id),
    })),
    {
      key: "switch",
      label: "Open another connection…",
      icon: ArrowLeftRight,
      separator: true,
      onSelect: onSwitchConnection,
    },
    {
      key: "library",
      label: "Connection library",
      icon: LibraryBig,
      onSelect: () => shell.select(null),
    },
    {
      key: "disconnect",
      label: `Disconnect ${title}`,
      icon: Unplug,
      danger: true,
      separator: true,
      disabled: shell.busy,
      onSelect: () => shell.close(session.id),
    },
  ];

  return (
    <ActionMenu
      label={`Switch connection: ${title}`}
      actions={actions}
      align="start"
      triggerClassName="session-pill"
      trigger={content}
    />
  );
}
