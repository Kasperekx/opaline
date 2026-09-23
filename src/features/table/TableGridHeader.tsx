import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  KeyRound,
  LockKeyhole,
  Pin,
  PinOff,
  MoveHorizontal,
} from "lucide-react";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { GridColumnResize } from "../../shared/components/GridInteractions";
import { SelectionCheckbox } from "./TableCells";
import type { TableDataController } from "./useTableData";

export function TableGridHeader({
  table,
  widths,
  onWidth,
  locked,
  pinnedThrough,
  leftOffsets,
  onPin,
  onFit,
}: {
  table: TableDataController;
  widths: Record<string, number>;
  onWidth: (column: string, width: number) => void;
  locked: boolean;
  pinnedThrough: number;
  leftOffsets: number[];
  onPin: (index: number) => void;
  onFit: (index: number) => void;
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
        {table.data?.columns.map((column, index) => {
          const active = table.sort?.column === column.name;
          const SortIcon = !active
            ? ArrowUpDown
            : table.sort?.direction === "asc"
              ? ArrowUp
              : ArrowDown;
          return (
            <th
              key={column.name}
              className={index <= pinnedThrough ? "pinned-column" : undefined}
              aria-sort={
                active
                  ? table.sort?.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
              }
              style={{
                width: widths[column.name],
                left: index <= pinnedThrough ? leftOffsets[index] : undefined,
              }}
            >
              <GridColumnResize
                name={column.name}
                width={widths[column.name]}
                onChange={(width) => onWidth(column.name, width)}
                onFit={() => onFit(index)}
              />
              <button
                aria-label={`Sort by ${column.name}`}
                className="column-sort"
                title={`${column.name} · ${column.dataType}${column.primaryKey ? " · Primary key" : ""}${column.nullable ? " · Nullable" : " · Required"}`}
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
                  <small aria-hidden="true">{column.dataType}</small>
                </span>
                <SortIcon size={13} />
              </button>
              <ActionMenu
                label={`Column options for ${column.name}`}
                actions={[
                  {
                    label: "Fit to visible values",
                    icon: MoveHorizontal,
                    onSelect: () => onFit(index),
                  },
                  {
                    label: `Pin columns through ${column.name}`,
                    icon: Pin,
                    onSelect: () => onPin(index),
                  },
                  {
                    label: "Unpin all columns",
                    icon: PinOff,
                    disabled: pinnedThrough < 0,
                    onSelect: () => onPin(-1),
                  },
                ]}
              />
            </th>
          );
        })}
        <th className="table-grid-fill" aria-hidden="true" />
      </tr>
    </thead>
  );
}
