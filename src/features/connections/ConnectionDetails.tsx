import {
  Copy,
  LockKeyhole,
  Pencil,
  Plug,
  ShieldCheck,
  Trash2,
} from "lucide-react";
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
          <div className="connection-primary-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={onConnect}
            >
              <Plug size={17} />
              {active ? "Open connection" : "Connect"}
            </button>
            <span>{active ? "Session open" : "Not connected"}</span>
          </div>
        </div>
        {profile.environment === "production" && (
          <p className="connection-notice production-notice">
            {profile.readOnly
              ? "Production · Read-only access. Data changes are blocked."
              : "Production · Write access requires a warning confirmation before connecting."}
          </p>
        )}
        <dl className="connection-properties">
          {[
            ["Host", profile.host],
            ["Port", profile.port],
            ["Database", profile.database],
            ["Username", profile.username],
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
                ? profile.caPath.split(/[\\/]/).pop()
                : "System trust store",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd title={String(value)}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="credential-summary">
          {profile.credentialId ? (
            <ShieldCheck size={18} />
          ) : (
            <LockKeyhole size={18} />
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
      <footer className="connection-dialog-footer connection-secondary-actions">
        <button
          className="button ghost"
          disabled={active || busy}
          title={active ? "Disconnect before editing" : "Edit profile"}
          onClick={onEdit}
        >
          <Pencil size={15} />
          Edit
        </button>
        <button
          className="button ghost"
          disabled={busy || profile.requiresCa}
          onClick={onDuplicate}
        >
          <Copy size={15} />
          Duplicate
        </button>
        <button
          className="button ghost"
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
          <Trash2 size={15} />
          Delete
        </button>
      </footer>
    </>
  );
}
