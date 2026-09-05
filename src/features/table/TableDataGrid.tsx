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

export function TableDataGrid({
  table,
  locked,
}: {
  table: TableDataController;
  locked: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const data = table.data,
    changes = table.changes;
  const [widths, setWidths] = useState<Record<string, number>>({});
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
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }, [data?.page, table.filter, table.pageSize, table.sort]);
  return (
    <>
      <div ref={viewportRef} className="table-data-grid-wrap">
        <GridFeedback grid={grid} quiet />
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
              width:
                44 +
                data.columns.reduce(
                  (sum, column) => sum + (widths[column.name] ?? 200),
                  0,
                ),
            }}
          >
            <TableGridHeader
              table={table}
              widths={widths}
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
                      onMove={move}
                      onMenu={(x, y, actions, returnFocus) =>
                        setMenu({ x, y, actions, returnFocus })
                      }
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : data ? (
          <div className="table-data-state">
            <Search size={20} />
            <strong>
              {table.filter ? "No matching rows" : "This table is empty"}
            </strong>
            {table.filter ? (
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
