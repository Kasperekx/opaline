import { useRef } from "react";
import type { ColumnInfo, TableDataRow } from "../../shared/types/database";
import type { useGridInteractions } from "../../shared/components/GridInteractions";
import { CellValue } from "./TableCells";
import { InlineCellEditor } from "./InlineCellEditor";
import { rowErrors, type RowChange } from "./table-change-set";
import type { TableDataController } from "./useTableData";
import type { CellMenuAction } from "./TableCellMenu";
import type { InsertCellValue } from "./table-types";
import { primaryModifierLabel } from "../../shared/lib/platform";

export type DisplayRow = {
  key: string;
  original: TableDataRow | null;
  change?: RowChange;
  values: InsertCellValue[];
  index: number;
};
type Props = {
  row: DisplayRow;
  rowIndex: number;
  column: ColumnInfo;
  columnIndex: number;
  table: TableDataController;
  grid: ReturnType<typeof useGridInteractions>;
  locked: boolean;
  onMove: (row: number, column: number, direction: number) => boolean;
  onMenu: (
    x: number,
    y: number,
    actions: CellMenuAction[],
    returnFocus: () => void,
  ) => void;
};
export function TableGridCell({
  row,
  rowIndex,
  column,
  columnIndex,
  table,
  grid,
  locked,
  onMove,
  onMenu,
}: Props) {
  const ref = useRef<HTMLTableCellElement>(null);
  const changes = table.changes;
  const value = row.values[columnIndex];
  const active =
    changes.activeCell?.key === row.key &&
    changes.activeCell.column === columnIndex;
  const changed = Boolean(
    row.original && value !== row.original.values[columnIndex],
  );
  const error = row.change
    ? rowErrors(table.data!.columns, row.change)[columnIndex]
    : null;
  const rowError = Boolean(
    changes.error?.rowId && row.change?.id === changes.error.rowId,
  );
  const editable =
    !locked &&
    !row.change?.deleted &&
    !column.identity &&
    !column.generated &&
    Boolean(row.original ? table.data?.editable : table.data?.insertable);
  const focus = () => {
    requestAnimationFrame(() => {
      if (!document.activeElement?.closest(".inline-cell-editor"))
        ref.current?.focus();
    });
  };
  const handlers = grid.cell(rowIndex, columnIndex);
  const menu = (x: number, y: number) => {
    const range = grid.selectForContext(rowIndex, columnIndex);
    onMenu(
      x,
      y,
      [
        {
          label: "Edit value",
          disabled: !editable,
          run: () =>
            changes.start(row.key, columnIndex, row.original ?? undefined),
        },
        {
          label: "Copy",
          shortcut: `${primaryModifierLabel} C`,
          run: () => void grid.copy(false, range),
        },
        {
          label: "Copy as JSON",
          run: () => void grid.copy(true, range),
        },
        {
          label: "Inspect value",
          run: () =>
            grid.inspectValue(
              value === undefined
                ? "DEFAULT (evaluated by PostgreSQL when saved)"
                : value,
            ),
        },
        {
          label: "Revert cell change",
          groupStart: true,
          disabled: !changed || locked,
          run: () => changes.revertCell(row.key, columnIndex),
        },
        {
          label: "Set to NULL",
          disabled: !editable || !column.nullable,
          run: () =>
            changes.update(
              row.key,
              columnIndex,
              null,
              row.original ?? undefined,
            ),
        },
        {
          label: "Duplicate row",
          groupStart: true,
          disabled: locked || !table.data?.insertable || row.change?.deleted,
          run: () => changes.duplicate(row.key, row.original ?? undefined),
        },
        {
          label: row.original
            ? row.change?.deleted
              ? "Undo row deletion"
              : "Mark row for deletion"
            : "Discard new row",
          danger: !row.change?.deleted,
          disabled: locked || Boolean(row.original && !table.data?.editable),
          run: () => changes.remove(row.key, row.original ?? undefined),
        },
      ],
      focus,
    );
  };
  return (
    <td
      ref={ref}
      {...handlers}
      className={`${column.primaryKey ? "primary-key-cell" : ""} ${changed ? "pending-cell" : ""} ${active ? "active-cell" : ""} ${error || rowError ? "invalid-cell" : ""}`}
      aria-readonly={!editable}
      aria-invalid={Boolean(error || rowError) || undefined}
      title={
        error ??
        (changed
          ? "Unsaved change · Save changes to write to PostgreSQL"
          : column.identity || column.generated
            ? "Managed by PostgreSQL"
            : undefined)
      }
      onContextMenu={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest(".inline-cell-editor")
        )
          return;
        event.preventDefault();
        menu(event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10"))
        ) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          menu(rect.left, rect.bottom);
        } else handlers.onKeyDown(event);
      }}
    >
      {value === undefined ? (
        <span className="table-default">
          {column.identity || column.generated ? "AUTO" : "DEFAULT"}
        </span>
      ) : (
        <CellValue value={value} />
      )}
      {changed && (
        <span className="cell-change-marker" aria-label="Unsaved change" />
      )}
      {error && (
        <span className="cell-error-marker" aria-label={error}>
          !
        </span>
      )}
      {active && (
        <InlineCellEditor
          column={column}
          value={value}
          error={error}
          anchor={ref.current}
          isNew={!row.original}
          onChange={(next) =>
            changes.update(
              row.key,
              columnIndex,
              next,
              row.original ?? undefined,
            )
          }
          onCommit={() => {
            changes.commitCell();
            focus();
          }}
          onBlur={changes.commitCell}
          onCancel={() => {
            changes.cancelCell();
            focus();
          }}
          onMove={(direction) => onMove(rowIndex, columnIndex, direction)}
        />
      )}
    </td>
  );
}
