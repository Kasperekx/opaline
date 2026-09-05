import { useState } from "react";
import { connectionApi } from "./connection-api";
import { ConnectionDialog } from "./ConnectionDialog";
import { useFormSafety } from "../../shared/safety/useFormSafety";
import { errorMessage } from "../../shared/lib/database-api";
import type { ConnectionCatalog, ProductWorkspace } from "./connection-types";

export function WorkspaceEditor({
  workspace,
  onSaved,
  onClose,
}: {
  workspace: ProductWorkspace | null;
  onSaved: (catalog: ConnectionCatalog) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(workspace?.name ?? "");
  const [busy, setBusy] = useState(false);
  const closeSafely = useFormSafety(
    "Workspace settings",
    name !== (workspace?.name ?? ""),
    busy,
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <ConnectionDialog
      title={workspace ? "Rename workspace" : "New workspace"}
      subtitle="Organize connections by product"
      busy={busy}
      onClose={() => closeSafely(onClose)}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void connectionApi
            .workspace(workspace?.id ?? null, name)
            .then(onSaved)
            .catch((e) => setError(errorMessage(e)))
            .finally(() => setBusy(false));
        }}
      >
        <fieldset className="profile-fields" disabled={busy}>
          <label>
            Workspace name
            <input
              data-initial-focus={true}
              required
              maxLength={80}
              placeholder="e.g. MMO"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="form-help">
            Keep local, staging and production connections for one product
            together.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <footer className="connection-dialog-footer">
          <span>No account or cloud sync required</span>
          <button className="button primary" disabled={busy || !name.trim()}>
            {workspace ? "Save name" : "Create workspace"}
          </button>
        </footer>
      </form>
    </ConnectionDialog>
  );
}
