import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ColumnInfo } from "../../shared/types/database";
import { writableColumns } from "./column-editor";
import { EditableCell } from "./TableCells";

type BulkUpdateDialogProps = {
  open: boolean;
  /** The "Set value…" button; the popover opens above it. */
  anchor: HTMLElement | null;
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

const GAP = 10;
const MARGIN = 8;

/** Stage one value on every selected row. A non-modal popover anchored
 * above its button in the table's floating bar; portalled to the body so
 * no container clips it. Nothing is written until the table is saved. */
export function BulkUpdateDialog({
  open,
  anchor,
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
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [position, setPosition] = useState<{
    left: number;
    bottom: number;
    origin: string;
  } | null>(null);
  const visible = open && Boolean(column);
  useLayoutEffect(() => {
    if (!visible || !panel.current) return;
    const place = () => {
      if (!panel.current) return;
      const width = panel.current.offsetWidth;
      const rect = anchor?.getBoundingClientRect();
      const centre = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const left = Math.max(
        MARGIN,
        Math.min(centre - width / 2, window.innerWidth - width - MARGIN),
      );
      setPosition({
        left,
        bottom: rect ? window.innerHeight - rect.top + GAP : 120,
        origin: `${Math.round(centre - left)}px 100%`,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [visible, anchor]);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (panel.current?.contains(event.target) ||
          anchor?.contains(event.target))
      )
        return;
      if (!busy) cancel.current();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [visible, anchor, busy]);
  if (!visible) return null;
  return createPortal(
    <div
      ref={panel}
      className="table-bulk-popover"
      role="dialog"
      aria-labelledby={titleId}
      data-placed={position ? "" : undefined}
      style={
        position
          ? {
              left: position.left,
              bottom: position.bottom,
              transformOrigin: position.origin,
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <header>
        <strong
          id={titleId}
        >{`Update ${rowCount} selected ${rowCount === 1 ? "row" : "rows"}`}</strong>
        <span>
          Stage this value on the selected rows. Nothing is written until you
          save the table changes.
        </span>
      </header>
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
      {(mutationError ?? error) && (
        <div className="table-mutation-error" role="alert">
          {mutationError ?? error}
        </div>
      )}
      <footer>
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || Boolean(error)}
          onClick={onConfirm}
        >
          {busy && <Loader2 className="spin" size={14} />}
          {`Stage ${rowCount === 1 ? "1 row" : `${rowCount} rows`}`}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
