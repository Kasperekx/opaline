import { PencilLine } from "lucide-react";
import type { ColumnInfo } from "../../shared/types/database";
import { writableColumns } from "./column-editor";
import { EditableCell } from "./TableCells";
import { TableMutationDialog } from "./TableMutationDialog";

type BulkUpdateDialogProps = {
  open: boolean;
  columns: ColumnInfo[];
  columnIndex: number;
  value: string | null;
  rowCount: number;
  error: string | null;
  mutationError: string | null;
  busy: boolean;
  onColumnChange: (columnIndex: number) => void;
  onValueChange: (value: string | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function BulkUpdateDialog({
  open,
  columns,
  columnIndex,
  value,
  rowCount,
  error,
  mutationError,
  busy,
  onColumnChange,
  onValueChange,
  onCancel,
  onConfirm,
}: BulkUpdateDialogProps) {
  const column = columns[columnIndex];
  const candidates = writableColumns(columns);
  return (
    <TableMutationDialog
      open={open && Boolean(column)}
      title={`Update ${rowCount} selected rows`}
      description="Stage this value on the selected rows. Nothing is written until you save the table changes."
      confirmLabel={`Stage ${rowCount} rows`}
      Icon={PencilLine}
      busy={busy}
      confirmDisabled={Boolean(error)}
      error={mutationError ?? error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {column && (
        <div className="bulk-update-fields">
          <label>
            Column
            <select
              value={columnIndex}
              disabled={busy}
              onChange={(event) => onColumnChange(Number(event.target.value))}
            >
              {candidates.map((candidate) => (
                <option value={columns.indexOf(candidate)} key={candidate.name}>
                  {candidate.name} · {candidate.dataType}
                </option>
              ))}
            </select>
          </label>
          <label>
            New value
            <EditableCell
              column={column}
              value={value}
              error={error}
              autoFocus
              onChange={onValueChange}
              onCancel={onCancel}
              onCommit={onConfirm}
            />
          </label>
          <small>
            Review the highlighted cells before saving. Row versions are checked
            when the entire change set is saved.
          </small>
        </div>
      )}
    </TableMutationDialog>
  );
}
