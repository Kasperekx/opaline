import { useState } from "react";
import { Database, Loader2, LockKeyhole, TriangleAlert } from "lucide-react";
import { Sheet, SheetFooter } from "../../shared/components/Sheet";
import { EnvironmentBadge } from "./EnvironmentBadge";
import { environmentLabels, type ConnectionProfile } from "./connection-types";

export function ConnectProfileDialog({
  profile,
  workspaceName,
  busy,
  error,
  onConnect,
  onClose,
}: {
  profile: ConnectionProfile;
  workspaceName: string;
  busy: boolean;
  error: string | null;
  onConnect: (password: string | null, confirmed: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const productionWrite =
    profile.environment === "production" && !profile.readOnly;
  const access = profile.readOnly ? "read-only" : "read and write";
  return (
    <Sheet
      title={`Connect to ${profile.name}?`}
      subtitle={`Opens a ${environmentLabels[profile.environment]} session${
        workspaceName ? ` in ${workspaceName}` : ""
      } with ${access} access.`}
      icon={productionWrite ? TriangleAlert : Database}
      tone={
        profile.environment === "production" ? "danger" : profile.environment
      }
      size={540}
      className={`connect-profile-dialog env-${profile.environment}`}
      busy={busy}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onConnect(password, confirmed).then((connected) => {
            if (connected) onClose();
          });
        }}
      >
        <fieldset disabled={busy} className="profile-fields">
          <dl className="connect-summary">
            <div>
              <dt>Environment</dt>
              <dd>
                <EnvironmentBadge
                  environment={profile.environment}
                  readOnly={profile.readOnly}
                />
              </dd>
            </div>
            <div>
              <dt>Server</dt>
              <dd className="connect-destination">
                {profile.username}@{profile.host}:{profile.port} /{" "}
                {profile.database}
              </dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{profile.readOnly ? "Read-only" : "Read & write"}</dd>
            </div>
            <div>
              <dt>TLS</dt>
              <dd>
                {profile.sslMode === "require"
                  ? "Required · verified"
                  : profile.sslMode === "prefer"
                    ? "Preferred · may be unencrypted"
                    : "Disabled · unencrypted"}
              </dd>
            </div>
          </dl>
          <label className="connect-password">
            Password
            <input
              data-initial-focus={!productionWrite}
              type="password"
              value={password ?? ""}
              autoComplete="off"
              placeholder={
                profile.credentialId
                  ? "Use password saved in system vault"
                  : "Optional · kept only for this connection"
              }
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {productionWrite && (
            <div className="connection-notice production-notice production-acknowledgment">
              <strong>You are connecting to production</strong>
              <p>
                Queries and edits can change live data. Check the database and
                workspace before continuing.
              </p>
              <label className="check-field">
                <input
                  data-initial-focus={productionWrite}
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  I understand — enable write access for this connection
                </span>
              </label>
            </div>
          )}
          {profile.readOnly && (
            <p className="form-help">
              Read-only is enforced for this session. Reconnect after changing
              the profile to enable writes.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <SheetFooter
          start={
            <>
              <LockKeyhole size={11} aria-hidden="true" />
              Password stays out of local configuration
            </>
          }
        >
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={"button " + (productionWrite ? "danger" : "primary")}
            disabled={busy || (productionWrite && !confirmed)}
            title={
              productionWrite && !confirmed
                ? "Confirm write access first"
                : undefined
            }
          >
            {busy && <Loader2 size={14} className="spin" />}
            {busy
              ? "Connecting…"
              : productionWrite
                ? "Connect to production"
                : "Connect"}
          </button>
        </SheetFooter>
      </form>
    </Sheet>
  );
}
