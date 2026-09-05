import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { ConnectionDialog } from "./ConnectionDialog";
import { EnvironmentBadge } from "./EnvironmentBadge";
import type { ConnectionProfile } from "./connection-types";

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
  return (
    <ConnectionDialog
      title={profile.name}
      subtitle={workspaceName + " · Connect"}
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
          <EnvironmentBadge
            environment={profile.environment}
            readOnly={profile.readOnly}
          />
          <p className="connect-destination">
            {profile.username}@{profile.host}:{profile.port} /{" "}
            {profile.database}
          </p>
          <label>
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
            <div className="connection-notice production-notice">
              <strong>
                <TriangleAlert size={18} /> You are connecting to production
              </strong>
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
        <footer className="connection-dialog-footer">
          <span>Password stays out of local configuration</span>
          <button
            type="submit"
            className={
              "button " + (productionWrite ? "production-button" : "primary")
            }
            disabled={busy || (productionWrite && !confirmed)}
          >
            {busy && <Loader2 size={16} className="spin" />}
            {busy
              ? "Connecting…"
              : productionWrite
                ? "Connect to production"
                : "Connect"}
          </button>
        </footer>
      </form>
    </ConnectionDialog>
  );
}
