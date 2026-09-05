import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  KeyRound,
  LockKeyhole,
} from "lucide-react";
import { GridColumnResize } from "../../shared/components/GridInteractions";
import { SelectionCheckbox } from "./TableCells";
import type { TableDataController } from "./useTableData";

export function TableGridHeader({
  table,
  widths,
  onWidth,
  locked,
}: {
  table: TableDataController;
  widths: Record<string, number>;
  onWidth: (column: string, width: number) => void;
  locked: boolean;
}) {
  return (
    <thead>
      <tr>
        <th className="table-row-selection">
          <SelectionCheckbox
            checked={table.allPageRowsSelected}
            indeterminate={table.somePageRowsSelected}
            disabled={!table.data?.rows.length || locked}
            label="Select all rows on this page"
            onChange={table.togglePageSelection}
          />
        </th>
        {table.data?.columns.map((column) => {
          const active = table.sort?.column === column.name;
          const SortIcon = !active
            ? ArrowUpDown
            : table.sort?.direction === "asc"
              ? ArrowUp
              : ArrowDown;
          return (
            <th key={column.name} style={{ width: widths[column.name] ?? 200 }}>
              <GridColumnResize
                name={column.name}
                width={widths[column.name] ?? 200}
                onChange={(width) => onWidth(column.name, width)}
              />
              <button
                aria-label={`Sort by ${column.name}`}
                disabled={locked}
                onClick={() => table.toggleSort(column.name)}
              >
                <span className="column-heading">
                  <strong>
                    {column.primaryKey && <KeyRound size={12} />}
                    {(column.identity || column.generated) && (
                      <LockKeyhole size={12} />
                    )}
                    {column.name}
                  </strong>
                  <small>{column.dataType}</small>
                </span>
                <SortIcon size={13} />
              </button>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
