import { useRef, useState } from "react";
import { useDatabaseSession } from "../connections/SessionContext";
import { errorMessage } from "../../shared/lib/database-api";
import type { ColumnInfo, TableRowSnapshot } from "../../shared/types/database";
import type { TableTab } from "../query/query-types";
import { primaryKey, type RowChange } from "./table-change-set";
import type { InsertCellValue } from "./table-types";

const printable = (value: InsertCellValue) =>
  value === undefined
    ? "DEFAULT"
    : value === null
      ? "NULL"
      : value === ""
        ? '"" (empty text)'
        : value;

export function TableRowDiff({
  row,
  columns,
  tab,
  index,
  canCompare,
}: {
  row: RowChange;
  columns: ColumnInfo[];
  tab: TableTab;
  index: number;
  canCompare: boolean;
}) {
  const { api } = useDatabaseSession();
  const [current, setCurrent] = useState<TableRowSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const compare = async () => {
    if (!row.original || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const snapshot = await api.loadTableRow({
        schema: tab.schema,
        table: tab.table,
        key: primaryKey(columns, row.original),
      });
      if (
        !snapshot ||
        snapshot.columns.length !== columns.length ||
        snapshot.columns.some((name, i) => name !== columns[i].name)
      ) {
        throw new Error(
          "The table structure changed. Inspect it in a new tab; this draft has not been replaced.",
        );
      }
      setCurrent(snapshot);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="table-row-diff">
      <h3>
        {row.deleted ? "Delete" : row.original ? "Update" : "Insert"} ·{" "}
        {row.original
          ? primaryKey(columns, row.original)
              .map((key) => `${key.column} = ${printable(key.value)}`)
              .join(", ")
          : `New row ${index + 1}`}
      </h3>
      {canCompare && row.original && (
        <div className="table-diff-compare">
          <button
            className="button ghost"
            disabled={busy}
            onClick={() => void compare()}
          >
            {busy ? "Checking…" : "Check current database values"}
          </button>
          <small>
            Read-only comparison by original primary key. It never replaces your
            draft or enables an automatic retry.
          </small>
          {error && <p role="alert">{error}</p>}
          {current && (
            <p role="status">
              {current.row
                ? "Snapshot fetched. Values may change again before you save."
                : "No visible row at the original key: it may have been deleted, moved to a different key, or hidden by permissions."}
            </p>
          )}
        </div>
      )}
      {columns.map((column, i) => {
        if (
          row.original &&
          !row.deleted &&
          row.values[i] === row.original.values[i] &&
          (!current?.row || current.row.values[i] === row.original.values[i])
        )
          return null;
        return (
          <div
            className={`table-field-diff ${current?.row ? "with-current" : ""}`}
            key={column.name}
          >
            <strong>{column.name}</strong>
            <div>
              <small>Original</small>
              <pre aria-label={`Original ${column.name}`}>
                {row.original ? printable(row.original.values[i]) : "—"}
              </pre>
            </div>
            {current?.row && (
              <div>
                <small>Database now</small>
                <pre aria-label={`Database now ${column.name}`}>
                  {printable(current.row.values[i])}
                </pre>
              </div>
            )}
            <div className="table-pending-value">
              <small>Pending</small>
              <pre aria-label={`Pending ${column.name}`}>
                {row.deleted ? "DELETE" : printable(row.values[i])}
              </pre>
            </div>
          </div>
        );
      })}
    </section>
  );
}
