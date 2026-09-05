import { ArrowUpRight, Database, Pencil, Plug } from "lucide-react";
import { useId } from "react";
import { EnvironmentBadge } from "./EnvironmentBadge";
import type { ConnectionProfile } from "./connection-types";

export function ConnectionRow({
  profile,
  active,
  available,
  onDetails,
  onConnect,
  onEdit,
}: {
  profile: ConnectionProfile;
  active: boolean;
  available: boolean;
  onDetails: () => void;
  onConnect: () => void;
  onEdit: () => void;
}) {
  const descriptionId = useId();
  return (
    <li
      className={
        "connection-row env-" +
        profile.environment +
        (active ? " is-connected" : "")
      }
    >
      <button
        className="connection-row-main"
        aria-label={`View details for ${profile.name}`}
        aria-describedby={`${descriptionId}-status ${descriptionId}-destination ${descriptionId}-environment`}
        onClick={onDetails}
      >
        <span className="connection-row-identity">
          <span className="connection-row-icon">
            <Database size={21} strokeWidth={1.5} />
          </span>
          <span className="connection-row-name">
            <strong title={profile.name}>{profile.name}</strong>
            <span
              id={`${descriptionId}-status`}
              className={
                active ? "connection-status connected" : "connection-status"
              }
            >
              <i />
              {active ? "Session open" : "Not connected"}
            </span>
          </span>
        </span>
        <span
          className="connection-row-destination"
          id={`${descriptionId}-destination`}
        >
          <strong title={profile.database}>{profile.database}</strong>
          <span title={`${profile.host}:${profile.port}`}>
            {profile.host}
            <span className="connection-port">:{profile.port}</span>
          </span>
        </span>
        <span
          className="connection-row-environment"
          id={`${descriptionId}-environment`}
        >
          <EnvironmentBadge
            environment={profile.environment}
            readOnly={profile.readOnly}
          />
        </span>
      </button>
      <div className="connection-row-actions">
        <button
          className={
            "button secondary" + (active ? " open-connection-button" : "")
          }
          aria-label={`${active ? "Open" : "Connect to"} ${profile.name}`}
          aria-describedby={`${descriptionId}-environment`}
          disabled={!available}
          onClick={onConnect}
        >
          {active ? <ArrowUpRight size={16} /> : <Plug size={16} />}
          {active ? "Open" : "Connect"}
        </button>
        <button
          className="icon-button"
          aria-label={`Edit ${profile.name}`}
          title={active ? "Disconnect before editing" : "Edit connection"}
          disabled={!available || active}
          onClick={onEdit}
        >
          <Pencil size={16} />
        </button>
      </div>
    </li>
  );
}
