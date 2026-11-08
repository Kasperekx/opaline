import { Loader2, PanelRight, Plus, Search } from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { useGridInteractions } from "../../shared/components/GridInteractions";
import { GridFeedback } from "../../shared/components/GridFeedback";
import { SelectionCheckbox } from "./TableCells";
import { TableGridHeader } from "./TableGridHeader";
import { TableGridCell, type DisplayRow } from "./TableGridCell";
import { TableCellMenu, type CellMenuAction } from "./TableCellMenu";
import { tableRowKey } from "./table-change-set";
import type { TableDataController } from "./useTableData";
import { defaultColumnWidth, fitColumnWidth } from "./table-grid-layout";
import type { StructureForeignKey } from "../../shared/types/structure";
import type { OpenRelatedTable } from "./table-relations";
import { TableRecordInspector } from "./TableRecordInspector";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";

// Placeholder rows while the first page loads: widths vary like real values.
const skeletonWidths = [64, 148, 196, 96, 132, 84];
const skeletonRows = Array.from({ length: 14 }, (_, row) =>
  skeletonWidths.map((width, column) =>
    Math.round(width * (0.55 + ((row * 7 + column * 3) % 5) * 0.11)),
  ),
);

/** How the record inspector was opened decides its motion and focus:
 * keyboard (Space) is instant and leaves focus in the grid; a click or the
 * toolbar animates once; the cell menu also moves focus into the panel. */
type RecordOpener = "keyboard" | "pointer" | "menu";

/** Like TablePlus, the inspector follows the selected row unless the user
 * turned it off (toolbar, Space or its close button). Remembered per app. */
const inspectorKey = "opaline.table.record-inspector.v1";
type InspectorMode = "auto" | "off";

/** What the table's floating bar asks of the grid for selected rows. */
export type TableGridApi = {
  copySelectedRows: (json: boolean) => void;
  inspectSelectedRow: () => void;
  /** Scroll a column into view, flash its header and focus it. */
  revealColumn: (name: string) => void;
};

export function TableDataGrid({
  table,
  locked,
  relations = [],
  onOpenRelated,
  inspectorToggleSlot,
  apiRef,
  onSearchColumn,
}: {
  table: TableDataController;
  locked: boolean;
  relations?: StructureForeignKey[];
  onOpenRelated?: OpenRelatedTable;
  /** Toolbar element that receives the record inspector toggle. */
  inspectorToggleSlot?: HTMLElement | null;
  apiRef?: Ref<TableGridApi>;
  /** Scope the row search to a column (header menu). */
  onSearchColumn?: (name: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const data = table.data,
    changes = table.changes;
  // The current row (TablePlus-style selection): set by clicking or moving
  // to any of its cells, followed by the record inspector. Kept by key so a
  // staged edit or a save does not lose it.
  const [current, setCurrent] = useState<string | null>(null);
  const [inspectorMode, setInspectorModeState] = useState<InspectorMode>(() =>
    readLocalJson<string>(inspectorKey, "auto") === "off" ? "off" : "auto",
  );
  const [opener, setOpener] = useState<RecordOpener>("pointer");
  const setInspectorMode = (mode: InspectorMode) => {
    setInspectorModeState(mode);
    writeLocalJson(inspectorKey, mode);
  };
  const { widths, setWidths } = table;
  const hidden = new Set(table.hiddenColumns);
  const isVisible = (index: number) =>
    !hidden.has(data?.columns[index]?.name ?? "");
  const [reveal, setReveal] = useState<{ name: string; nonce: number } | null>(
    null,
  );
  const pinnedThrough =
    data?.columns.findIndex((column) => column.name === table.pinnedColumn) ??
    -1;
  const columnWidths = Object.fromEntries(
    (data?.columns ?? []).map((column) => [
      column.name,
      Object.prototype.hasOwnProperty.call(widths, column.name)
        ? widths[column.name]
        : defaultColumnWidth(column),
    ]),
  );
  const leftOffsets = (data?.columns ?? []).map(
    (_, index) =>
      44 +
      (data?.columns.slice(0, index) ?? []).reduce(
        (sum, column) =>
          hidden.has(column.name) ? sum : sum + columnWidths[column.name],
        0,
      ),
  );
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    actions: CellMenuAction[];
    returnFocus: () => void;
  } | null>(null);
  const rows: DisplayRow[] = [
    ...changes.rows
      .filter((row) => !row.original)
      .map((row) => ({
        key: row.key,
        original: null,
        change: row,
        values: row.values,
        index: -1,
      })),
    ...(data?.rows.map((original, index) => {
      const key = tableRowKey(
        data.columns,
        original,
        String(data.page) + ":" + index,
      );
      const change = changes.rows.find((row) => row.key === key);
      return {
        key,
        original,
        change,
        values: change?.values ?? original.values,
        index,
      };
    }) ?? []),
  ];
  const start = (row: number, column: number) => {
    const entry = rows[row],
      info = data?.columns[column];
    if (
      !entry ||
      !info ||
      hidden.has(info.name) ||
      info.identity ||
      info.generated ||
      entry.change?.deleted ||
      locked ||
      !(entry.original ? data?.editable : data?.insertable)
    )
      return false;
    changes.start(entry.key, column, entry.original ?? undefined);
    return true;
  };
  /** Same rule as the cell: what double-click/F2 would allow. */
  const cellEditable = (entry: DisplayRow | undefined, column: number) => {
    const info = data?.columns[column];
    return Boolean(
      entry &&
      info &&
      !info.identity &&
      !info.generated &&
      !entry.change?.deleted &&
      !locked &&
      (entry.original ? data?.editable : data?.insertable),
    );
  };
  const grid = useGridInteractions(
    rows.map((row) =>
      row.values.map((value) =>
        value === undefined ? "DEFAULT (not yet evaluated)" : value,
      ),
    ),
    JSON.stringify([
      data?.page,
      rows.map((row) => [row.key, row.original?.rowVersion]),
    ]),
    start,
    data?.columns.map((column) => `${column.name} · ${column.dataType}`),
    {
      // Clicking or arrowing to a cell selects its row; the inspector follows.
      onFocusCell: ({ row }) => {
        const key = rows[row]?.key;
        if (!key) return;
        if (key !== current) setOpener("pointer");
        setCurrent(key);
      },
      onSpace: ({ row }) => {
        if (recordVisible()) setInspectorMode("off");
        else openRecord(row, "keyboard");
      },
      onEscape: () => {
        if (grid.inspecting) grid.closeInspector();
        // Checked rows clear first (the grid's own Escape handler).
        else if (table.selectedCount || currentIndex < 0) return false;
        else deselectRow();
        return true;
      },
      columnVisible: isVisible,
    },
  );
  const move = (row: number, column: number, direction: number) => {
    const count = data?.columns.length ?? 0;
    for (
      let index = row * count + column + direction;
      index >= 0 && index < rows.length * count;
      index += direction
    ) {
      const nextRow = Math.floor(index / count),
        nextColumn = index % count;
      if (start(nextRow, nextColumn)) return true;
    }
    return false;
  };
  const currentIndex =
    current === null ? -1 : rows.findIndex((row) => row.key === current);
  const recordIndex =
    inspectorMode === "auto" && !grid.inspecting ? currentIndex : -1;
  function recordVisible() {
    return recordIndex >= 0;
  }
  /** Rows inside a multi-row cell range read as selected too. */
  const rangeRows = grid.selection && {
    first: Math.min(grid.selection.anchor.row, grid.selection.focus.row),
    last: Math.max(grid.selection.anchor.row, grid.selection.focus.row),
  };
  const isCurrentRow = (index: number) =>
    index === currentIndex ||
    Boolean(rangeRows && index >= rangeRows.first && index <= rangeRows.last);
  /** Select a row as if its cell was clicked: keep the focused column. */
  function selectRow(row: number, column = grid.selection?.focus.column) {
    column ??= Math.max(
      0,
      (data?.columns ?? []).findIndex((_, index) => isVisible(index)),
    );
    grid.selectForContext(row, column);
    const key = rows[row]?.key;
    if (key) setCurrent(key);
  }
  function openRecord(row: number, how: RecordOpener, column?: number) {
    if (!rows[row]) return;
    grid.closeInspector();
    setOpener(how);
    setInspectorMode("auto");
    if (column !== undefined || row !== currentIndex || !grid.selection)
      selectRow(row, column);
  }
  /** Escape: nothing selected, so the inspector closes; focus stays put. */
  function deselectRow() {
    setCurrent(null);
    grid.clearSelection();
  }
  const selectedRowIndexes = () =>
    rows.flatMap((row, index) =>
      row.original && table.isRowSelected(row.index) ? [index] : [],
    );
  useImperativeHandle(apiRef, () => ({
    copySelectedRows: (json) =>
      void grid.copyValues(
        selectedRowIndexes().map((index) =>
          rows[index].values.map((value) =>
            value === undefined ? "DEFAULT (not yet evaluated)" : value,
          ),
        ),
        json,
        "row",
      ),
    inspectSelectedRow: () => {
      const [first] = selectedRowIndexes();
      if (first !== undefined) openRecord(first, "pointer");
    },
    revealColumn: (name) => setReveal({ name, nonce: Date.now() }),
  }));
  useEffect(() => {
    // After the column is (re)rendered: scroll it clear of pinned columns,
    // flash its header once and move focus there on the current row.
    if (!reveal || !data) return;
    const index = data.columns.findIndex(
      (column) => column.name === reveal.name,
    );
    const viewport = viewportRef.current;
    const header = viewport?.querySelector<HTMLElement>(
      `th[data-column-index="${index}"]`,
    );
    if (index < 0 || !viewport || !header) return;
    const pinned =
      pinnedThrough >= 0 && index > pinnedThrough
        ? leftOffsets[pinnedThrough] +
          columnWidths[data.columns[pinnedThrough].name]
        : 44;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    viewport.scrollTo?.({
      left: Math.max(0, header.offsetLeft - pinned - 24),
      behavior: reduced ? "auto" : "smooth",
    });
    header.removeAttribute("data-flash");
    void header.offsetWidth; // restart the flash if it is already running
    header.setAttribute("data-flash", "");
    const done = window.setTimeout(
      () => header.removeAttribute("data-flash"),
      1200,
    );
    const row = Math.min(
      grid.selection?.focus.row ?? 0,
      Math.max(rows.length - 1, 0),
    );
    const cell = viewport.querySelector<HTMLElement>(
      `[data-grid-row="${row}"][data-grid-column="${index}"]`,
    );
    cell?.click();
    cell?.focus({ preventScroll: true });
    return () => window.clearTimeout(done);
    // Runs once per reveal request; layout values are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);
  /** ⌘D: the one selected row, or the focused row when none is selected. */
  const duplicateTarget = () => {
    const selected = selectedRowIndexes();
    const index =
      selected.length === 1
        ? selected[0]
        : table.selectedCount === 0
          ? grid.selection?.focus.row
          : undefined;
    const row = index === undefined ? undefined : rows[index];
    if (!row || row.change?.deleted || locked || !data?.insertable) return null;
    return row;
  };
  /** Return focus to the selected cell (or the grid's tab stop). */
  const focusGrid = () => {
    const point = grid.selection?.focus;
    const viewport = viewportRef.current;
    (
      (point &&
        viewport?.querySelector<HTMLElement>(
          `[data-grid-row="${point.row}"][data-grid-column="${point.column}"]`,
        )) ||
      viewport?.querySelector<HTMLElement>('[tabindex="0"]')
    )?.focus();
  };
  const closeInspector = () => {
    grid.closeInspector();
    focusGrid();
  };
  /** Escape inside the record inspector: deselect, back to the grid. */
  const dismissRecord = () => {
    focusGrid();
    deselectRow();
  };
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }, [data?.page, table.filter, table.conditions, table.pageSize, table.sort]);
  const fit = (index: number) => {
    const column = data?.columns[index];
    if (!column) return;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const cell = viewportRef.current?.querySelector(
      `[data-grid-column="${index}"]`,
    );
    if (!context || !cell) return;
    context.font = getComputedStyle(cell).font;
    const width = fitColumnWidth(
      column.name,
      rows.map((row) => row.values[index]),
      (text) => context.measureText(text).width,
    );
    setWidths((current) => ({ ...current, [column.name]: width }));
  };
  return (
    <>
      <div
        className={`table-grid-region ${grid.inspecting || recordIndex >= 0 ? "with-value-inspector" : ""}`}
      >
        <div
          ref={viewportRef}
          className="table-data-grid-wrap"
          data-refreshing={table.busy && data ? "" : undefined}
          onKeyDown={(event) => {
            // Grid shortcuts for selected rows. Editors, menus and fields
            // keep their own keys; cells handle Space/Escape for Quick Look
            // first.
            if (
              event.defaultPrevented ||
              (event.target instanceof Element &&
                event.target.closest(
                  ".inline-cell-editor, [role='menu'], dialog, textarea, select, input:not([type='checkbox'])",
                ))
            )
              return;
            const command = event.metaKey || event.ctrlKey;
            if (event.key === "Escape" && table.selectedCount) {
              event.preventDefault();
              table.clearSelection();
            } else if (
              command &&
              (event.key === "Backspace" || event.key === "Delete")
            ) {
              event.preventDefault();
              if (
                table.selectedCount &&
                data?.editable &&
                !locked &&
                changes.stageMany(table.selectedRows)
              )
                table.clearSelection();
            } else if (
              command &&
              !event.shiftKey &&
              event.key.toLowerCase() === "d"
            ) {
              event.preventDefault();
              const row = duplicateTarget();
              if (row) changes.duplicate(row.key, row.original ?? undefined);
            }
          }}
        >
          {table.busy && !data ? (
            <div className="table-grid-skeleton skeleton" role="status">
              <span className="sr-only">Loading table data…</span>
              {skeletonRows.map((widths, row) => (
                <div className="skeleton-row" aria-hidden="true" key={row}>
                  {widths.map((width, column) => (
                    <i
                      key={column}
                      style={
                        { "--skeleton-width": `${width}px` } as CSSProperties
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : data && rows.length ? (
            <table
              className="table-data-grid interactive-grid inline-table-grid"
              role="grid"
              aria-label="Table data"
              aria-busy={table.busy || undefined}
              data-has-selection={table.selectedCount > 0 || undefined}
              style={{
                tableLayout: "fixed",
                width: "100%",
                minWidth:
                  44 +
                  data.columns.reduce(
                    (sum, column) =>
                      hidden.has(column.name)
                        ? sum
                        : sum + columnWidths[column.name],
                    0,
                  ),
              }}
            >
              <TableGridHeader
                table={table}
                widths={columnWidths}
                pinnedThrough={pinnedThrough}
                leftOffsets={leftOffsets}
                onPin={(index) =>
                  table.setPinnedColumn(data.columns[index]?.name ?? null)
                }
                onFit={fit}
                hidden={hidden}
                onHide={(name) => table.setColumnVisible(name, false)}
                onSearchColumn={onSearchColumn}
                locked={locked}
                onWidth={(column, width) =>
                  setWidths((current) => ({ ...current, [column]: width }))
                }
              />
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={row.key}
                    className={[
                      row.change?.deleted ? "pending-delete" : "",
                      !row.original ? "pending-insert" : "",
                      table.isRowSelected(row.index) ? "selected" : "",
                      isCurrentRow(rowIndex) ? "current" : "",
                    ].join(" ")}
                    aria-current={rowIndex === currentIndex || undefined}
                  >
                    <td className="table-row-selection">
                      {row.original ? (
                        <SelectionCheckbox
                          checked={table.isRowSelected(row.index)}
                          disabled={locked}
                          label={"Select row " + (row.index + 1)}
                          onChange={() => table.toggleRowSelection(row.index)}
                        />
                      ) : (
                        <Plus size={15} aria-label="New row — not saved" />
                      )}
                      {row.change?.deleted && (
                        <span
                          className="row-deletion-marker"
                          aria-label="Marked for deletion"
                        >
                          −
                        </span>
                      )}
                    </td>
                    {data.columns.map((column, columnIndex) =>
                      hidden.has(column.name) ? null : (
                        <TableGridCell
                          key={column.name}
                          row={row}
                          rowIndex={rowIndex}
                          column={column}
                          columnIndex={columnIndex}
                          table={table}
                          grid={grid}
                          locked={locked}
                          relations={relations.filter(
                            (relation) =>
                              relation.direction === "outgoing" &&
                              relation.sourceColumns.includes(column.name),
                          )}
                          onOpenRelated={onOpenRelated}
                          onInspectRecord={() =>
                            openRecord(rowIndex, "menu", columnIndex)
                          }
                          pinnedLeft={
                            columnIndex <= pinnedThrough
                              ? leftOffsets[columnIndex]
                              : undefined
                          }
                          onMove={move}
                          onMenu={(x, y, actions, returnFocus) =>
                            setMenu({ x, y, actions, returnFocus })
                          }
                        />
                      ),
                    )}
                    <td className="table-grid-fill" aria-hidden="true" />
                  </tr>
                ))}
              </tbody>
            </table>
          ) : data ? (
            <div className="table-data-state">
              <Search size={20} aria-hidden="true" />
              <strong>
                {table.filter || table.conditions.length
                  ? "No matching rows"
                  : "This table is empty"}
              </strong>
              {table.filter || table.conditions.length ? (
                <button
                  className="button secondary compact"
                  onClick={table.clearFilter}
                >
                  Clear filter
                </button>
              ) : (
                data.insertable && (
                  <button
                    className="button secondary compact"
                    disabled={locked}
                    onClick={changes.insert}
                  >
                    <Plus size={14} />
                    Add first row
                  </button>
                )
              )}
            </div>
          ) : null}
          {table.busy && data && (
            <div className="table-loading-overlay" role="status">
              <Loader2 className="spin" size={18} aria-hidden="true" />
              <span className="sr-only">Refreshing table data</span>
            </div>
          )}
        </div>
        <GridFeedback
          grid={{
            ...grid,
            closeInspector,
          }}
          quiet
          sidePanel
        />
        {recordIndex >= 0 && data && (
          <TableRecordInspector
            row={rows[recordIndex]}
            columns={data.columns}
            index={recordIndex}
            count={rows.length}
            animate={opener !== "keyboard"}
            focusOnOpen={opener === "menu"}
            canEdit={(column) => cellEditable(rows[recordIndex], column)}
            canEditInGrid={isVisible}
            onStage={(column, value) => {
              const row = rows[recordIndex];
              changes.update(row.key, column, value, row.original ?? undefined);
              changes.commitCell();
            }}
            onRevert={(column) => {
              changes.revertCell(rows[recordIndex].key, column);
              changes.commitCell();
            }}
            onEditInGrid={(column) => {
              // The full cell editor (NULL/DEFAULT, JSON, expanded text).
              const viewport = viewportRef.current;
              viewport
                ?.querySelector<HTMLElement>(
                  `[data-grid-row="${recordIndex}"][data-grid-column="${column}"]`,
                )
                ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
              grid.selectForContext(recordIndex, column);
              start(recordIndex, column);
            }}
            onInspectValue={(column) => {
              const value = rows[recordIndex].values[column];
              const info = data.columns[column];
              grid.inspectValue(
                value === undefined
                  ? "DEFAULT (evaluated by PostgreSQL when saved)"
                  : value,
                `${info.name} · ${info.dataType}`,
              );
            }}
            onCopyValue={(column) => {
              const value = rows[recordIndex].values[column];
              void grid.copyValues([
                [value === undefined ? "DEFAULT (not yet evaluated)" : value],
              ]);
            }}
            onClose={() => {
              setInspectorMode("off");
              focusGrid();
            }}
            onDismiss={dismissRecord}
            onMove={(offset) => selectRow(recordIndex + offset)}
          />
        )}
      </div>
      {inspectorToggleSlot &&
        createPortal(
          <button
            type="button"
            className="table-inspector-toggle"
            aria-label={
              recordIndex >= 0
                ? "Hide record inspector"
                : "Show record inspector"
            }
            aria-pressed={recordIndex >= 0}
            title="Record inspector (Space)"
            disabled={!data || !rows.length}
            onClick={() => {
              if (recordIndex >= 0) setInspectorMode("off");
              else
                openRecord(
                  currentIndex >= 0
                    ? currentIndex
                    : (grid.selection?.focus.row ?? 0),
                  "pointer",
                );
            }}
          >
            <PanelRight size={16} aria-hidden="true" />
          </button>,
          inspectorToggleSlot,
        )}
      {menu && (
        <TableCellMenu
          {...menu}
          onClose={() => {
            menu.returnFocus();
            setMenu(null);
          }}
        />
      )}
    </>
  );
}
