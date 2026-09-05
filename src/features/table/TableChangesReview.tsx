import { ConnectionDialog } from "../connections/ConnectionDialog";
import { useDatabaseSession } from "../connections/SessionContext";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import type { TableTab } from "../query/query-types";
import type { TableDataController } from "./useTableData";
import { TableRowDiff } from "./TableRowDiff";

export function TableChangesReview({
  table,
  tab,
}: {
  table: TableDataController;
  tab: TableTab;
}) {
  const { session } = useDatabaseSession();
  const { changes, data } = table;
  if (!changes.review || !data) return null;
  const confirming = changes.review === "confirm";
  const deletedRows = `${changes.summary.deleted} ${changes.summary.deleted === 1 ? "row" : "rows"}`;
  return (
    <ConnectionDialog
      title={
        confirming
          ? `Save changes and delete ${deletedRows}?`
          : "Review pending changes"
      }
      subtitle={`${session.name} · ${session.host}:${session.port} / ${session.database} / ${tab.schema}.${tab.table}`}
      className="table-changes-dialog"
      onClose={changes.closeReview}
      busy={changes.busy}
    >
      <div className="table-changes-review">
        <EnvironmentBadge
          environment={session.environment}
          readOnly={session.readOnly}
        />
        <p>
          {confirming
            ? "This saves the entire change set in one transaction. Deleted records cannot be restored by discarding the draft after saving."
            : changes.error?.kind === "unknown"
              ? "The save was not confirmed. Some or all of these values may already be in PostgreSQL. Do not retry blindly."
              : "These values are local drafts. PostgreSQL has not saved them."}
        </p>
        {changes.error && <p role="alert">{changes.error.message}</p>}
        {changes.summary.rows.map((row, index) => (
          <TableRowDiff
            key={row.id}
            row={row}
            columns={data.columns}
            tab={tab}
            index={index}
            canCompare={!confirming}
          />
        ))}
      </div>
      <footer className="dialog-actions">
        <button
          className="button ghost"
          data-initial-focus="true"
          onClick={changes.closeReview}
        >
          {confirming ? "Cancel" : "Close"}
        </button>
        {confirming && (
          <button className="button danger" onClick={changes.confirmReview}>
            Save and delete {deletedRows}
          </button>
        )}
      </footer>
    </ConnectionDialog>
  );
}
