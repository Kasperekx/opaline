import { useState } from "react";
import { ConnectionDialog } from "../connections/ConnectionDialog";
import type { QueryExecutionMode } from "../../shared/types/database";

export function QueryExecutionControl({
  mode,
  target,
  readOnly,
  busy,
  onChange,
}: {
  mode: QueryExecutionMode;
  target: string;
  readOnly: boolean;
  busy: boolean;
  onChange: (mode: QueryExecutionMode) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <label
        className={`query-execution-control ${mode}`}
        title={
          readOnly
            ? "Read-only sessions always use a protected atomic transaction"
            : "Atomic rolls back a failed script. Autocommit saves a single statement immediately."
        }
      >
        <span className="sr-only">SQL execution mode</span>
        <select
          aria-label="SQL execution mode"
          value={mode}
          disabled={busy || readOnly}
          onChange={(event) => {
            if (event.target.value === "autocommit") setConfirming(true);
            else onChange("atomic");
          }}
        >
          <option value="atomic">Atomic</option>
          <option value="autocommit">Autocommit</option>
        </select>
      </label>
      {confirming && (
        <ConnectionDialog
          title="Enable autocommit for this tab?"
          subtitle={target}
          onClose={() => setConfirming(false)}
        >
          <div className="safety-content">
            <p>
              Each Run executes one statement and saves it immediately. There is
              no application rollback. Use this for commands such as VACUUM or
              CREATE DATABASE.
            </p>
            <p>
              Select one statement before running a script. Manual BEGIN/COMMIT
              are not supported. After an error or lost response, inspect the
              database before retrying.
            </p>
            <p>
              This choice applies only to this tab and is not restored after
              restarting the application.
            </p>
          </div>
          <footer className="dialog-actions">
            <button
              className="button secondary"
              data-initial-focus="true"
              onClick={() => setConfirming(false)}
            >
              Keep atomic
            </button>
            <button
              className="button danger"
              onClick={() => {
                onChange("autocommit");
                setConfirming(false);
              }}
            >
              Enable autocommit
            </button>
          </footer>
        </ConnectionDialog>
      )}
    </>
  );
}
