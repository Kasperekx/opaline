import { Database, Pencil } from "lucide-react";
import { useId } from "react";
import { environmentLabels, type ConnectionProfile } from "./connection-types";

export function ConnectionRow({
  profile,
  active,
  available,
  onDetails,
  onConnect,
  onEdit,
  onFocusRow,
  selected = false,
  current = false,
  connecting = false,
}: {
  profile: ConnectionProfile;
  active: boolean;
  available: boolean;
  onDetails: () => void;
  onConnect: () => void;
  onEdit: () => void;
  /** Focus anywhere in the row makes it the keyboard selection. */
  onFocusRow?: () => void;
  /** Details sheet open for this profile. */
  selected?: boolean;
  /** Keyboard selection (roving tab stop): Return connects, Space opens details. */
  current?: boolean;
  connecting?: boolean;
}) {
  const descriptionId = useId();
  const target = `${profile.username}@${profile.host}:${profile.port}/${profile.database}`;
  const note = profile.readOnly
    ? "Read-only"
    : profile.environment === "production"
      ? "Confirm to open"
      : null;
  return (
    <li
      className={
        "connection-row env-" +
        profile.environment +
        (active ? " is-connected" : "") +
        (selected ? " is-inspected" : "") +
        (current ? " is-current" : "")
      }
      data-row-id={profile.id}
      onFocus={onFocusRow}
    >
      <button
        className="connection-row-main"
        aria-label={`View details for ${profile.name}`}
        aria-pressed={selected}
        tabIndex={current ? 0 : -1}
        aria-describedby={`${descriptionId}-status ${descriptionId}-destination ${descriptionId}-environment`}
        onClick={onDetails}
      >
        <span className="connection-row-tile" aria-hidden="true">
          <Database size={16} strokeWidth={1.6} />
        </span>
        <span className="connection-row-name">
          <strong title={profile.name}>{profile.name}</strong>
          <span
            className="connection-row-target"
            id={`${descriptionId}-destination`}
            title={target}
          >
            {target}
          </span>
        </span>
        <span
          className="connection-row-note"
          id={`${descriptionId}-environment`}
        >
          <span className="sr-only">
            {environmentLabels[profile.environment]}
            {note ? ", " : ""}
          </span>
          {note}
        </span>
        <span
          id={`${descriptionId}-status`}
          className={
            active ? "connection-status connected" : "connection-status"
          }
        >
          {active ? (
            <>
              <i aria-hidden="true" />
              Connected
            </>
          ) : (
            <span className="sr-only">Not connected</span>
          )}
        </span>
      </button>
      <div className="connection-row-actions">
        <button
          className="icon-button subtle connection-row-edit"
          aria-label={`Edit ${profile.name}`}
          title={active ? "Disconnect before editing" : "Edit connection"}
          disabled={!available || active}
          tabIndex={current ? undefined : -1}
          onClick={onEdit}
        >
          <Pencil size={13} />
        </button>
        <button
          className={
            "button compact secondary connection-row-connect" +
            (active ? " open-connection-button" : "") +
            (connecting ? " is-connecting" : "")
          }
          aria-label={
            connecting
              ? `Connecting to ${profile.name}`
              : `${active ? "Open" : "Connect to"} ${profile.name}`
          }
          aria-describedby={`${descriptionId}-environment`}
          aria-busy={connecting || undefined}
          disabled={!available}
          tabIndex={current ? undefined : -1}
          onClick={onConnect}
        >
          {connecting ? (
            <>
              <span className="connect-spinner" aria-hidden="true" />
              Connecting…
            </>
          ) : active ? (
            "Open"
          ) : (
            "Connect"
          )}
        </button>
      </div>
    </li>
  );
}
