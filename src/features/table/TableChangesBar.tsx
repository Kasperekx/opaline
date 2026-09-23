import { Check, Loader2 } from "lucide-react";
import { useDatabaseSession } from "../connections/SessionContext";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useWorkSafety } from "../../shared/safety/WorkSafety";
import { primaryModifierLabel } from "../../shared/lib/platform";
import type { TableTab } from "../query/query-types";
import type { TableDataController } from "./useTableData";
import { TableErrorNotice } from "./TableErrorNotice";

export function TableChangesBar({
  table,
  tab,
}: {
  table: TableDataController;
  tab: TableTab;
}) {
  const { session } = useDatabaseSession();
  const safety = useWorkSafety();
  const { changes } = table;
  const { summary } = changes;
  const count = summary.fields + summary.inserted + summary.deleted;
  const target = `${session.name} · ${session.host}:${session.port}/${session.database} · ${tab.schema}.${tab.table}`;
  if (!summary.rows.length && !changes.saved && !changes.error) return null;
  return (
    <div className={`table-changes-bar ${changes.error ? "has-error" : ""}`}>
      <div className="table-change-summary" role="status" title={target}>
        {changes.busy ? (
          <Loader2 size={17} className="spin" />
        ) : changes.saved ? (
          <Check size={17} />
        ) : (
          <span className="table-change-dot" aria-hidden="true" />
        )}
        <span>
          <strong>
            {changes.busy
              ? "Saving changes…"
              : changes.saved
                ? "Changes saved"
                : changes.error?.kind === "unknown"
                  ? "Save not confirmed"
                  : `${count} unsaved ${count === 1 ? "change" : "changes"}`}
          </strong>
          <small>· {tab.table}</small>
        </span>
      </div>
      {!changes.saved && (
        <>
          {session.environment === "production" && (
            <EnvironmentBadge
              environment={session.environment}
              readOnly={session.readOnly}
            />
          )}
          <div className="table-change-actions">
            <button
              className="button ghost"
              disabled={changes.busy}
              onClick={changes.showReview}
            >
              Review
            </button>
            <button
              className="button ghost"
              disabled={changes.busy}
              onClick={() =>
                safety.request(
                  changes.clear,
                  {
                    sessionId: session.id,
                    tabId: tab.id,
                  },
                  { allowSave: false },
                )
              }
            >
              Discard…
            </button>
            <button
              className="button primary"
              disabled={
                changes.disabled ||
                summary.invalid ||
                table.busy ||
                !summary.rows.length
              }
              onClick={() => void changes.save()}
            >
              {session.environment === "production"
                ? "Save changes to production"
                : "Save changes"}{" "}
              <kbd>{primaryModifierLabel} S</kbd>
            </button>
          </div>
        </>
      )}
      {session.environment === "production" && !changes.saved && (
        <small className="table-change-context">{target}</small>
      )}
      {summary.inserted > 0 && !changes.saved && (
        <small className="table-change-context">
          New rows: review primary and unique keys before saving.
        </small>
      )}
      {changes.error && (
        <TableErrorNotice
          title={
            changes.error.kind === "unknown"
              ? "Save outcome unknown. "
              : changes.saved
                ? "View refresh failed. "
                : "Could not save. "
          }
          hint={
            changes.error.kind === "unknown"
              ? "Do not retry the write. Verify the database state first; your local changes are preserved."
              : changes.saved
                ? "The save was confirmed. Refresh the table without repeating the write."
                : "Your local changes are preserved. Review the details and correct the affected values before saving again."
          }
          message={changes.error.message}
        />
      )}
    </div>
  );
}
