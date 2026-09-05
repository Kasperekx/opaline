import { useState } from "react";
import { ConnectionDialog } from "./ConnectionDialog";
import { connectionApi } from "./connection-api";
import { errorMessage } from "../../shared/lib/database-api";
import { useWorkRisk } from "../../shared/safety/WorkSafety";
import { useOperationLock } from "../../shared/hooks/useOperationLock";
import { loadSavedQueries, writeSavedQueries } from "../query/useSavedQueries";
import type {
  ConnectionCatalog,
  ConnectionProfile,
  ProductWorkspace,
  SessionInfo,
} from "./connection-types";

export function ProfileOrganization({
  catalog,
  workspace,
  profile,
  sessions,
  onSaved,
  onClose,
}: {
  catalog: ConnectionCatalog;
  workspace: ProductWorkspace;
  profile?: ConnectionProfile;
  sessions: SessionInfo[];
  onSaved: (catalog: ConnectionCatalog) => void;
  onClose: () => void;
}) {
  const [destination, setDestination] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useOperationLock();
  useWorkRisk({ label: "Organizing profiles", busy });
  const profiles = profile
    ? [profile]
    : catalog.profiles.filter((p) => p.workspaceId === workspace.id);
  const active = sessions.some((s) =>
    profiles.some((p) => p.id === s.profileId),
  );
  const library = loadSavedQueries(workspace.id);
  const needsDestination = Boolean(
    profile || profiles.length || library.length,
  );
  const move = () =>
    lock(async () => {
      setBusy(true);
      setError(null);
      try {
        if (!profile && destination && library.length) {
          const target = loadSavedQueries(destination);
          writeSavedQueries(destination, [
            ...target,
            ...library.filter(
              (item) => !target.some((existing) => existing.id === item.id),
            ),
          ]);
        }
        const next = profile
          ? await connectionApi.move(profile.id, destination)
          : await connectionApi.removeWorkspace(
              workspace.id,
              destination || null,
            );
        onSaved(next);
        onClose();
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setBusy(false);
      }
    });
  return (
    <ConnectionDialog
      title={profile ? "Move connection" : "Remove workspace"}
      subtitle={profile?.name ?? workspace.name}
      busy={busy}
      onClose={onClose}
    >
      <div className="p1-panel">
        <p className="p1-muted">
          {profile
            ? "Only the workspace changes. The database destination, password, SQL drafts and history stay with this profile."
            : `${profiles.length} profiles and ${library.length} saved queries. Profiles will be moved, not deleted. SQL drafts, history and credentials are retained; the source query library is kept locally as a recovery copy.`}
        </p>
        {active && (
          <p role="alert" className="p1-error">
            Disconnect the affected sessions first. Their SQL drafts are
            retained.
          </p>
        )}
        <label>
          Destination workspace
          <select
            value={destination}
            disabled={busy}
            onChange={(event) => setDestination(event.target.value)}
            data-initial-focus="true"
          >
            <option value="">
              {needsDestination
                ? "Choose a workspace…"
                : "No profiles or saved queries to move"}
            </option>
            {catalog.workspaces
              .filter((w) => w.id !== workspace.id)
              .map((w) => (
                <option value={w.id} key={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </label>
        {!catalog.workspaces.some((w) => w.id !== workspace.id) &&
          needsDestination && (
            <p className="p1-muted">
              Create another workspace first. Nothing will be deleted
              automatically.
            </p>
          )}
        <label className="p1-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={busy}
          />
          {profile
            ? "Move this profile without changing its database"
            : "Remove this workspace and preserve its work as described above"}
        </label>
        {error && (
          <p role="alert" className="p1-error">
            {error}
          </p>
        )}
      </div>
      <footer className="dialog-actions">
        <button className="button ghost" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className={`button ${profile ? "primary" : "danger"}`}
          disabled={
            busy || active || !confirmed || (needsDestination && !destination)
          }
          onClick={() => void move()}
        >
          {busy ? "Saving…" : profile ? "Move connection" : "Remove workspace"}
        </button>
      </footer>
    </ConnectionDialog>
  );
}
