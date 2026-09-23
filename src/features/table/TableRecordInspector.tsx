import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ColumnInfo } from "../../shared/types/database";
import type { DisplayRow } from "./TableGridCell";

export function TableRecordInspector({
  row,
  columns,
  index,
  count,
  onMove,
  onClose,
}: {
  row: DisplayRow;
  columns: ColumnInfo[];
  index: number;
  count: number;
  onMove: (offset: number) => void;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <aside
      className="grid-value-panel record-inspector"
      aria-label="Record inspector"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <span>RECORD INSPECTOR</span>
          <h3>
            Row {index + 1} of {count}
          </h3>
        </div>
        <button
          ref={close}
          className="icon-button"
          aria-label="Close record inspector"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <nav aria-label="Records on this page">
        <button
          className="icon-button"
          aria-label="Previous record"
          disabled={index === 0}
          onClick={() => {
            if (index === 1) close.current?.focus();
            onMove(-1);
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {row.change?.deleted
            ? "Marked for deletion · not saved"
            : row.change
              ? "Local changes · not saved"
              : "Loaded from PostgreSQL"}
        </span>
        <button
          className="icon-button"
          aria-label="Next record"
          disabled={index === count - 1}
          onClick={() => {
            if (index === count - 2) close.current?.focus();
            onMove(1);
          }}
        >
          <ChevronRight size={16} />
        </button>
      </nav>
      <dl>
        {columns.map((column, position) => {
          const value = row.values[position];
          const changed = Boolean(
            row.original && value !== row.original.values[position],
          );
          return (
            <div
              key={column.name}
              className={changed ? "record-field changed" : "record-field"}
            >
              <dt>
                {column.name}
                <small>
                  {column.dataType}
                  {column.primaryKey ? " · Primary key" : ""}
                </small>
              </dt>
              <dd>
                <pre
                  tabIndex={0}
                  aria-label={`Record value for ${column.name}`}
                >
                  {value === undefined
                    ? "DEFAULT (evaluated on save)"
                    : value === null
                      ? "NULL"
                      : value === ""
                        ? "Empty string"
                        : value}
                </pre>
                {changed && (
                  <small>
                    Unsaved · previous value:{" "}
                    <span>
                      {row.original!.values[position] === null
                        ? "NULL"
                        : row.original!.values[position] === ""
                          ? "Empty string"
                          : row.original!.values[position]}
                    </span>
                  </small>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <footer>
        Read-only · edit cells in the table. Numbers are shown without
        conversion.
      </footer>
    </aside>
  );
}
