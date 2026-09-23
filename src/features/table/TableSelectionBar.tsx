import { useState } from "react";
import { PencilLine, Trash2 } from "lucide-react";
import { BulkUpdateDialog } from "./BulkUpdateDialog";
import {
  initialColumnValue,
  validateColumnValue,
  writableColumns,
} from "./column-editor";
import type { TableDataController } from "./useTableData";
import type { TableTab } from "../query/query-types";
import { useDatabaseSession } from "../connections/SessionContext";
import { useWorkRisk } from "../../shared/safety/WorkSafety";

export function TableSelectionBar({
  table,
  tab,
  locked,
}: {
  table: TableDataController;
  tab: TableTab;
  locked: boolean;
}) {
  const { session } = useDatabaseSession();
  const [draft, setDraft] = useState<{
    column: number;
    value: string | null;
  } | null>(null);
  const columns = table.data?.columns ?? [];
  const editable = Boolean(table.data?.editable) && !locked;
  useWorkRisk({
    sessionId: session.id,
    tabId: tab.id,
    label: "Unstaged bulk value",
    dirty: draft !== null,
    discard: () => setDraft(null),
  });
  if (!table.selectedCount) return null;
  return (
    <>
      <div
        className="table-selection-bar"
        role="group"
        aria-label="Selected row actions"
      >
        <strong role="status">
          {table.selectedCount} {table.selectedCount === 1 ? "row" : "rows"}{" "}
          selected
        </strong>
        <div>
          <button
            disabled={!editable || !writableColumns(columns).length}
            onClick={() => {
              const column = writableColumns(columns)[0];
              if (column)
                setDraft({
                  column: columns.indexOf(column),
                  value: initialColumnValue(column),
                });
            }}
          >
            <PencilLine size={14} />
            Set value
          </button>
          <button
            className="danger"
            disabled={!editable}
            onClick={() => {
              if (table.changes.stageMany(table.selectedRows))
                table.clearSelection();
            }}
          >
            <Trash2 size={14} />
            Mark for deletion
          </button>
          <button disabled={locked} onClick={table.clearSelection}>
            Clear selection
          </button>
        </div>
      </div>
      {draft && (
        <BulkUpdateDialog
          open
          columns={columns}
          columnIndex={draft.column}
          value={draft.value}
          rowCount={table.selectedCount}
          error={validateColumnValue(columns[draft.column], draft.value)}
          mutationError={table.changes.error?.message ?? null}
          busy={locked}
          onColumnChange={(column) =>
            setDraft({ column, value: initialColumnValue(columns[column]) })
          }
          onValueChange={(value) => setDraft({ ...draft, value })}
          onCancel={() => setDraft(null)}
          onConfirm={() => {
            if (
              table.changes.stageMany(
                table.selectedRows,
                draft.column,
                draft.value,
              )
            ) {
              setDraft(null);
              table.clearSelection();
            }
          }}
        />
      )}
    </>
  );
}
