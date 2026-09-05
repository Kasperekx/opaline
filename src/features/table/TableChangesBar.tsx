import { Check, Loader2, PencilLine } from "lucide-react";
import { useDatabaseSession } from "../connections/SessionContext";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useWorkSafety } from "../../shared/safety/WorkSafety";
import { primaryModifierLabel } from "../../shared/lib/platform";
import type { TableTab } from "../query/query-types";
import type { TableDataController } from "./useTableData";

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
  if (!summary.rows.length && !changes.saved && !changes.error) return null;
  return (
    <div className={`table-changes-bar ${changes.error ? "has-error" : ""}`}>
      <div className="table-change-summary" role="status">
        {changes.busy ? (
          <Loader2 size={17} className="spin" />
        ) : changes.saved ? (
          <Check size={17} />
        ) : (
          <PencilLine size={17} />
        )}
        <span>
          <strong>
            {changes.busy
              ? "Saving changes…"
              : changes.saved
                ? "Changes saved"
                : [
                    summary.updated &&
                      `${summary.fields} changed ${summary.fields === 1 ? "field" : "fields"} in ${summary.updated} ${summary.updated === 1 ? "row" : "rows"}`,
                    summary.inserted && `${summary.inserted} new`,
                    summary.deleted && `${summary.deleted} to delete`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
          </strong>
          <small>
            {changes.saved
              ? "Confirmed by PostgreSQL"
              : `${session.name} / ${tab.schema}.${tab.table} · ${changes.error?.kind === "unknown" ? "Save not confirmed — verify database" : "Not saved to the database"}`}
          </small>
          {summary.inserted > 0 && !changes.saved && (
            <small>
              New rows: review primary and unique keys before saving.
            </small>
          )}
        </span>
      </div>
      {!changes.saved && (
        <>
          <EnvironmentBadge
            environment={session.environment}
            readOnly={session.readOnly}
          />
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
              Save changes <kbd>{primaryModifierLabel} S</kbd>
            </button>
          </div>
        </>
      )}
      {changes.error && (
        <p className="table-save-error" role="alert">
          <strong>
            {changes.error.kind === "unknown"
              ? "Save outcome unknown. "
              : changes.saved
                ? "View refresh failed. "
                : "Could not save. "}
          </strong>
          {changes.error.message}
        </p>
      )}
    </div>
  );
}
