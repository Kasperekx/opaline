import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ConnectionDialog } from "./ConnectionDialog";
import { errorMessage } from "../../shared/lib/database-api";
import { useOperationLock } from "../../shared/hooks/useOperationLock";
import { useWorkRisk } from "../../shared/safety/WorkSafety";
import type {
  ConnectionCatalog,
  ConnectionSettings,
  ProductWorkspace,
} from "./connection-types";
type Transfer = {
  version: 1;
  profiles: (Omit<ConnectionSettings, "caPath"> & { requiresCa: boolean })[];
};
export function ProfileTransferDialog({
  workspace,
  onSaved,
  onClose,
}: {
  workspace: ProductWorkspace;
  onSaved: (catalog: ConnectionCatalog) => void;
  onClose: () => void;
}) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const lock = useOperationLock();
  useWorkRisk({ label: "Transferring connection profiles", busy });
  const act = (fn: () => Promise<void>) =>
    lock(async () => {
      setBusy(true);
      setMessage(null);
      try {
        await fn();
      } catch (error) {
        setMessage(errorMessage(error));
      } finally {
        setBusy(false);
      }
    });
  const filters = [{ name: "Opaline profiles", extensions: ["json"] }];
  return (
    <ConnectionDialog
      title="Import / export profiles"
      subtitle={workspace.name}
      busy={busy}
      onClose={onClose}
    >
      <div className="p1-panel">
        <p className="p1-muted">
          Exports contain server addresses and usernames, but no passwords,
          Keychain identifiers or local CA paths. Treat topology information as
          private.
        </p>
        <div className="p1-inline">
          <button
            className="button secondary"
            disabled={busy}
            data-initial-focus="true"
            onClick={() =>
              void act(async () => {
                const path = await open({ multiple: false, filters });
                if (typeof path !== "string") return;
                setTransfer(null);
                setConfirmed(false);
                setTransfer(
                  await invoke<Transfer>("preview_profile_import", { path }),
                );
              })
            }
          >
            Choose import file
          </button>
          <button
            className="button ghost"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const path = await save({
                  defaultPath: "opaline-profiles.json",
                  filters,
                });
                if (!path) return;
                await invoke("export_profiles", {
                  workspaceId: workspace.id,
                  path,
                });
                setMessage("Profiles exported without credentials.");
              })
            }
          >
            Export this workspace
          </button>
        </div>
        {transfer && (
          <>
            <p>
              Import {transfer.profiles.length} profiles into{" "}
              <strong>{workspace.name}</strong>
            </p>
            <div className="p1-list">
              {transfer.profiles.map((profile, index) => (
                <div className="p1-context" key={index}>
                  <strong>{profile.name}</strong>
                  <span>
                    {profile.database} @ {profile.host}:{profile.port} ·{" "}
                    {profile.environment}
                  </span>
                  {profile.requiresCa && (
                    <span className="p1-error">
                      Custom CA must be selected before connecting
                    </span>
                  )}
                </div>
              ))}
            </div>
            <label className="p1-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Create new profiles only. Conflicting names receive an “import”
              suffix; existing profiles are never overwritten. Imported profiles
              are not tested or connected automatically.
            </label>
            <button
              className="button primary"
              disabled={busy || !confirmed}
              onClick={() =>
                void act(async () => {
                  const next = await invoke<ConnectionCatalog>(
                    "import_profiles",
                    { workspaceId: workspace.id, transfer },
                  );
                  onSaved(next);
                  onClose();
                })
              }
            >
              Import as new profiles
            </button>
          </>
        )}
        {message && (
          <p role="status" className="p1-muted">
            {message}
          </p>
        )}
      </div>
    </ConnectionDialog>
  );
}
