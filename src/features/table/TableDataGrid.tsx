import { Loader2, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

export function TableDataGrid({
  table,
  locked,
  relations = [],
  onOpenRelated,
}: {
  table: TableDataController;
  locked: boolean;
  relations?: StructureForeignKey[];
  onOpenRelated?: OpenRelatedTable;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const data = table.data,
    changes = table.changes;
  const [record, setRecord] = useState<{
    key: string;
    data: typeof data;
  } | null>(null);
  const { widths, setWidths } = table;
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
        (sum, column) => sum + columnWidths[column.name],
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
  const recordIndex =
    record?.data === data && !grid.inspecting
      ? rows.findIndex((row) => row.key === record?.key)
      : -1;
  const closeInspector = () => {
    setRecord(null);
    grid.closeInspector();
    viewportRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
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
        <div ref={viewportRef} className="table-data-grid-wrap">
          {table.busy && !data ? (
            <div className="table-data-state" role="status">
              <Loader2 className="spin" size={21} />
              Loading table data…
            </div>
          ) : data && rows.length ? (
            <table
              className="table-data-grid interactive-grid inline-table-grid"
              role="grid"
              aria-label="Table data"
              style={{
                tableLayout: "fixed",
                width: "100%",
                minWidth:
                  44 +
                  data.columns.reduce(
                    (sum, column) => sum + columnWidths[column.name],
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
                    ].join(" ")}
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
                    {data.columns.map((column, columnIndex) => (
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
                        onInspectRecord={() => {
                          grid.closeInspector();
                          setRecord({ key: row.key, data });
                        }}
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
                    ))}
                    <td className="table-grid-fill" aria-hidden="true" />
                  </tr>
                ))}
              </tbody>
            </table>
          ) : data ? (
            <div className="table-data-state">
              <Search size={20} />
              <strong>
                {table.filter || table.conditions.length
                  ? "No matching rows"
                  : "This table is empty"}
              </strong>
              {table.filter || table.conditions.length ? (
                <button onClick={table.clearFilter}>Clear filter</button>
              ) : (
                data.insertable && (
                  <button disabled={locked} onClick={changes.insert}>
                    <Plus size={14} />
                    Add first row
                  </button>
                )
              )}
            </div>
          ) : null}
          {table.busy && data && (
            <div
              className="table-loading-overlay"
              aria-label="Refreshing table data"
            >
              <Loader2 className="spin" size={20} />
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
            onClose={closeInspector}
            onMove={(offset) =>
              setRecord({ key: rows[recordIndex + offset].key, data })
            }
          />
        )}
      </div>
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
