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
import { columnEditorKind } from "./column-editor";
import { ArrowUpRight, Braces } from "lucide-react";
import type { StructureForeignKey } from "../../shared/types/structure";
import { relatedFilters, type OpenRelatedTable } from "./table-relations";

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
  pinnedLeft?: number;
  relations?: StructureForeignKey[];
  onOpenRelated?: OpenRelatedTable;
  onInspectRecord: () => void;
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
  pinnedLeft,
  relations = [],
  onOpenRelated,
  onInspectRecord,
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
    const previousFocus = document.activeElement;
    requestAnimationFrame(() => {
      if (
        (document.activeElement === previousFocus ||
          document.activeElement === document.body) &&
        !document.activeElement?.closest(
          ".inline-cell-editor, .grid-value-panel",
        )
      )
        ref.current?.focus();
    });
  };
  const handlers = grid.cell(rowIndex, columnIndex);
  const links = onOpenRelated
    ? relations.map((relation) => ({
        relation,
        filters:
          row.original && !row.change && !locked
            ? relatedFilters(relation, table.data!.columns, row.original.values)
            : null,
      }))
    : [];
  const menu = (x: number, y: number) => {
    const range = grid.selectForContext(rowIndex, columnIndex);
    onMenu(
      x,
      y,
      [
        ...links.map(({ relation, filters }) => ({
          label: `Open ${relation.targetSchema}.${relation.targetTable} · ${relation.name}`,
          disabled: !filters,
          run: () => {
            if (filters)
              onOpenRelated?.(
                relation.targetSchema,
                relation.targetTable,
                filters,
              );
          },
        })),
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
              `${column.name} · ${column.dataType}`,
            ),
        },
        {
          label: "Inspect record",
          run: onInspectRecord,
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
      style={pinnedLeft === undefined ? undefined : { left: pinnedLeft }}
      data-value-kind={columnEditorKind(column)}
      className={`${pinnedLeft !== undefined ? "pinned-column" : ""} ${column.primaryKey ? "primary-key-cell" : ""} ${changed ? "pending-cell" : ""} ${active ? "active-cell" : ""} ${error || rowError ? "invalid-cell" : ""}`}
      aria-readonly={!editable}
      aria-label={
        columnEditorKind(column) === "json" && typeof value === "string"
          ? value.slice(0, 512) + (value.length > 512 ? "…" : "")
          : undefined
      }
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
        <CellValue value={value} dataType={column.dataType} />
      )}
      {changed && (
        <span className="cell-change-marker" aria-label="Unsaved change" />
      )}
      {!active &&
        (links.length > 0 ||
          (columnEditorKind(column) === "json" &&
            typeof value === "string")) && (
          <span className="cell-relation-links">
            {columnEditorKind(column) === "json" &&
              typeof value === "string" && (
                <button
                  aria-label={`Inspect JSON in ${column.name}`}
                  title="Inspect JSON · read-only"
                  onDoubleClick={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    grid.inspectValue(
                      value,
                      `${column.name} · ${column.dataType}`,
                    );
                  }}
                >
                  <Braces size={14} />
                </button>
              )}
            {links.map(({ relation, filters }) => (
              <button
                key={relation.name}
                aria-label={`Open related record via ${relation.name}`}
                title={
                  filters
                    ? `Open ${relation.targetSchema}.${relation.targetTable}`
                    : "Unavailable for NULL keys or unsaved rows"
                }
                disabled={!filters}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (filters)
                    onOpenRelated?.(
                      relation.targetSchema,
                      relation.targetTable,
                      filters,
                    );
                }}
              >
                <ArrowUpRight size={13} />
              </button>
            ))}
          </span>
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
