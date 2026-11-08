import {
  Copy,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { SheetFooter } from "../../shared/components/Sheet";
import { EnvironmentBadge } from "./EnvironmentBadge";
import type { ConnectionProfile } from "./connection-types";

export function ConnectionDetails({
  profile,
  active,
  busy,
  onConnect,
  onEdit,
  onDuplicate,
  onDelete,
  onMove,
}: {
  profile: ConnectionProfile;
  active: boolean;
  busy: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove?: () => void;
}) {
  const properties: [label: string, value: string | number, mono?: boolean][] =
    [
      ["Host", profile.host, true],
      ["Port", profile.port, true],
      ["Database", profile.database, true],
      ["Username", profile.username, true],
      ["Access", profile.readOnly ? "Read-only" : "Read & write"],
      [
        "TLS",
        profile.sslMode === "require"
          ? "Required · verified"
          : profile.sslMode === "prefer"
            ? "Preferred · may be unencrypted"
            : "Disabled · unencrypted",
      ],
      [
        "CA certificate",
        profile.caPath
          ? (profile.caPath.split(/[\\/]/).pop() ?? profile.caPath)
          : "System trust store",
      ],
    ];
  return (
    <>
      <div className="connection-detail-body">
        {profile.requiresCa && (
          <p className="form-error">
            Imported profile: choose its custom CA in Edit before connecting.
          </p>
        )}
        <div className="connection-detail-summary">
          <EnvironmentBadge
            environment={profile.environment}
            readOnly={profile.readOnly}
          />
          <span
            className={
              "connection-status" + (active ? " connected" : " is-plain")
            }
          >
            {active && <i aria-hidden="true" />}
            {active ? "Session open" : "Not connected"}
          </span>
          <button
            className="button primary"
            disabled={busy}
            onClick={onConnect}
          >
            {active ? "Open connection" : "Connect"}
          </button>
        </div>
        {profile.environment === "production" && (
          <p className="connection-notice production-notice">
            <TriangleAlert size={13} aria-hidden="true" />
            <span>
              {profile.readOnly
                ? "Production · Read-only access. Data changes are blocked."
                : "Production · Write access requires a warning confirmation before connecting."}
            </span>
          </p>
        )}
        <dl className="connection-properties">
          {properties.map(([label, value, mono]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={mono ? "mono" : undefined} title={String(value)}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="credential-summary">
          {profile.credentialId ? (
            <ShieldCheck size={15} aria-hidden="true" />
          ) : (
            <LockKeyhole size={15} aria-hidden="true" />
          )}
          <span>
            {profile.credentialId
              ? "Password saved in system credential store"
              : "Password requested when connecting"}
            <small>
              Only connection settings are stored in local configuration.
            </small>
          </span>
        </div>
        {active && (
          <p className="form-help">
            Disconnect this profile before editing or deleting it. Other
            connections can stay open.
          </p>
        )}
      </div>
      <SheetFooter className="connection-secondary-actions">
        <button
          className="button secondary"
          disabled={active || busy}
          title={active ? "Disconnect before editing" : "Edit profile"}
          onClick={onEdit}
        >
          <Pencil size={13} aria-hidden="true" />
          Edit
        </button>
        <button
          className="button secondary"
          disabled={busy || profile.requiresCa}
          onClick={onDuplicate}
        >
          <Copy size={13} aria-hidden="true" />
          Duplicate
        </button>
        <button
          className="button secondary"
          disabled={active || busy}
          onClick={onMove}
        >
          Move to workspace
        </button>
        <button
          className="button ghost delete-profile-button"
          disabled={active || busy}
          title={active ? "Disconnect before deleting" : "Delete profile"}
          onClick={onDelete}
        >
          <Trash2 size={13} aria-hidden="true" />
          Delete
        </button>
      </SheetFooter>
    </>
  );
}
