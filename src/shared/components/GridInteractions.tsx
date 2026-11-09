import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Copy, ScanText } from "lucide-react";
import { GridFeedback } from "./GridFeedback";
import { ResizeHandle } from "./ResizeHandle";
import { useHud } from "./Hud";
export type GridPoint = { row: number; column: number };
type Point = GridPoint;
type Selection = { anchor: Point; focus: Point };
const includesCell = (
  selection: Selection | null,
  row: number,
  column: number,
) =>
  Boolean(
    selection &&
    row >= Math.min(selection.anchor.row, selection.focus.row) &&
    row <= Math.max(selection.anchor.row, selection.focus.row) &&
    column >= Math.min(selection.anchor.column, selection.focus.column) &&
    column <= Math.max(selection.anchor.column, selection.focus.column),
  );
export function selectedValues(
  rows: (string | null)[][],
  selection: Selection,
) {
  const firstRow = Math.min(selection.anchor.row, selection.focus.row),
    lastRow = Math.max(selection.anchor.row, selection.focus.row);
  const firstColumn = Math.min(selection.anchor.column, selection.focus.column),
    lastColumn = Math.max(selection.anchor.column, selection.focus.column);
  return rows
    .slice(firstRow, lastRow + 1)
    .map((row) => row.slice(firstColumn, lastColumn + 1));
}
export function gridTsv(rows: (string | null)[][]) {
  return rows
    .map((row) =>
      row
        .map((value) =>
          value === null
            ? "\\N"
            : value
                .replace(/\\/g, "\\\\")
                .replace(/\t/g, "\\t")
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n"),
        )
        .join("\t"),
    )
    .join("\n");
}
export type GridInteractionOptions = {
  /** The focused cell moved (click or arrow keys). */
  onFocusCell?: (point: GridPoint) => void;
  /** Space on a cell that is not being edited, e.g. Quick Look. */
  onSpace?: (point: GridPoint) => void;
  /** Escape on a cell; return true when it closed something. */
  onEscape?: () => boolean;
  /** Hidden columns are skipped by arrow keys and left out of copied ranges. */
  columnVisible?: (column: number) => boolean;
};
export function useGridInteractions(
  rows: (string | null)[][],
  identity: unknown,
  onEditCell?: (row: number, column: number) => boolean,
  columnLabels?: string[],
  options: GridInteractionOptions = {},
) {
  const hud = useHud();
  const [stored, setStored] = useState<{
    identity: unknown;
    selection: Selection;
  } | null>(null);
  const [inspecting, setInspecting] = useState<{
    value: string | null;
    label?: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    if (!message || copyFailed) return;
    const timeout = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [message, copyFailed]);
  const selection =
    stored && stored.identity === identity ? stored.selection : null;
  const select = (point: Point, extend: boolean) => {
    setStored({
      identity,
      selection: {
        anchor: extend && selection ? selection.anchor : point,
        focus: point,
      },
    });
    options.onFocusCell?.(point);
  };
  const copyValues = async (
    values: (string | null)[][],
    json = false,
    unit: "cell" | "row" = "cell",
  ) => {
    try {
      await navigator.clipboard.writeText(
        json ? JSON.stringify(values) : gridTsv(values),
      );
      setCopyFailed(false);
      if (hud.available) {
        // The HUD is the announcement; an inline status would repeat it.
        const count =
          unit === "row"
            ? values.length
            : values.reduce((sum, row) => sum + row.length, 0);
        setMessage(null);
        hud.show({
          title: `Copied ${count === 1 ? unit : `${count.toLocaleString()} ${unit}s`}`,
          detail: json ? "As JSON" : "Tab-separated · NULL as \\N",
          tone: "success",
        });
      } else
        setMessage(
          json
            ? "Copied as JSON. NULL and text are distinct."
            : "Copied escaped TSV. NULL is \\N; backslashes, tabs and newlines are escaped.",
        );
    } catch {
      setCopyFailed(true);
      setMessage(
        "Clipboard unavailable. Open the value inspector to select and copy the text.",
      );
    }
  };
  const visible = options.columnVisible ?? (() => true);
  const copy = async (json = false, range = selection) => {
    if (!range) return;
    const first = Math.min(range.anchor.column, range.focus.column);
    await copyValues(
      selectedValues(rows, range).map((row) =>
        row.filter((_, offset) => visible(first + offset)),
      ),
      json,
    );
  };
  const inspect = () => {
    if (selection)
      setInspecting({
        value: rows[selection.focus.row]?.[selection.focus.column] ?? null,
        label: columnLabels?.[selection.focus.column],
      });
  };
  return {
    selection,
    inspecting,
    message,
    copyFailed,
    dismissMessage: () => setMessage(null),
    selectForContext: (row: number, column: number) => {
      const range = includesCell(selection, row, column)
        ? selection!
        : { anchor: { row, column }, focus: { row, column } };
      setStored({ identity, selection: range });
      options.onFocusCell?.(range.focus);
      return range;
    },
    copy,
    /** Copies arbitrary rows (e.g. checkbox-selected rows) with the same
     * escaping, feedback and failure handling as a cell range. */
    copyValues,
    inspect,
    inspectValue: (value: string | null, label?: string) =>
      setInspecting({ value, label }),
    closeInspector: () => setInspecting(null),
    /** Drop the cell selection; keyboard focus stays where it is. */
    clearSelection: () => setStored(null),
    cell: (row: number, column: number) => {
      const selected = includesCell(selection, row, column);
      const focused =
        selection?.focus.row === row && selection.focus.column === column;
      return {
        role: "gridcell",
        "data-grid-row": row,
        "data-grid-column": column,
        "aria-selected": Boolean(selected),
        "data-cell-selected": selected ? "true" : undefined,
        // The clicked cell, marked even while focus is in another panel.
        "data-cell-focus": focused ? "true" : undefined,
        tabIndex: selection
          ? selection.focus.row === row && selection.focus.column === column
            ? 0
            : -1
          : row === 0 && column === 0
            ? 0
            : -1,
        onClick: (event: { shiftKey: boolean }) =>
          select({ row, column }, event.shiftKey),
        onDoubleClick: () => {
          if (!onEditCell?.(row, column))
            setInspecting({
              value: rows[row]?.[column] ?? null,
              label: columnLabels?.[column],
            });
        },
        onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
          if (event.target !== event.currentTarget) return;
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "c"
          ) {
            event.preventDefault();
            void copy(
              false,
              selection ?? { anchor: { row, column }, focus: { row, column } },
            );
          }
          if (
            event.key === " " &&
            options.onSpace &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.shiftKey
          ) {
            event.preventDefault();
            options.onSpace({ row, column });
            return;
          }
          if (event.key === "Escape" && options.onEscape?.()) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (event.key === "Enter" || event.key === "F2") {
            event.preventDefault();
            if (!onEditCell?.(row, column) && event.key === "Enter")
              setInspecting({
                value: rows[row]?.[column] ?? null,
                label: columnLabels?.[column],
              });
          }
          const delta: Record<string, Point> = {
            ArrowLeft: { row: 0, column: -1 },
            ArrowRight: { row: 0, column: 1 },
            ArrowUp: { row: -1, column: 0 },
            ArrowDown: { row: 1, column: 0 },
          };
          if (delta[event.key]) {
            event.preventDefault();
            const d = delta[event.key];
            const lastColumn = (rows[row]?.length ?? 1) - 1;
            let nextColumn = column + d.column;
            while (
              d.column !== 0 &&
              nextColumn >= 0 &&
              nextColumn <= lastColumn &&
              !visible(nextColumn)
            )
              nextColumn += d.column;
            const point = {
              row: Math.max(0, Math.min(rows.length - 1, row + d.row)),
              column:
                nextColumn < 0 || nextColumn > lastColumn ? column : nextColumn,
            };
            const table = event.currentTarget.closest("table");
            const cell = table?.querySelector<HTMLElement>(
              `[data-grid-row="${point.row}"][data-grid-column="${point.column}"]`,
            );
            if (cell) {
              select(point, event.shiftKey);
              cell.focus();
            }
          }
        },
      };
    },
  };
}
export function GridTools({
  grid,
  readOnly = true,
}: {
  grid: ReturnType<typeof useGridInteractions>;
  readOnly?: boolean;
}) {
  return (
    <>
      <div className="grid-tools">
        <span>
          {readOnly
            ? "Read-only result"
            : "Double-click or F2 to edit · Enter stages changes"}
        </span>
        <button
          className="toolbar-button"
          disabled={!grid.selection}
          onClick={() => void grid.copy()}
        >
          <Copy size={14} />
          Copy cells
        </button>
        <button
          className="toolbar-button"
          disabled={!grid.selection}
          onClick={() => void grid.copy(true)}
        >
          Copy JSON
        </button>
        <button
          className="toolbar-button"
          disabled={!grid.selection}
          onClick={grid.inspect}
        >
          <ScanText size={14} />
          Inspect value
        </button>
        <small>Shift-click / Shift-arrows for a range</small>
      </div>
      <GridFeedback grid={grid} />
    </>
  );
}
export function GridColumnResize({
  name,
  width,
  onChange,
  onFit,
}: {
  name: string;
  width: number;
  onChange: (width: number) => void;
  onFit?: () => void;
}) {
  const current = useRef(width);
  current.current = width;
  return (
    <ResizeHandle
      className="grid-column-resize"
      label={`Resize ${name} column`}
      minimum={100}
      maximum={1000}
      orientation="vertical"
      value={width}
      onResize={(delta) => {
        current.current = Math.max(
          100,
          Math.min(1000, current.current + delta),
        );
        onChange(current.current);
      }}
      onReset={onFit ?? (() => onChange(200))}
    />
  );
}
