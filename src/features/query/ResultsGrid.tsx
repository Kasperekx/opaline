import { Check, Loader2, Play, SquareTerminal } from "lucide-react";
import type {
  QueryExecutionError,
  QueryResultSet,
} from "../../shared/types/database";
import { primaryModifierLabel } from "../../shared/lib/platform";
import { useMemo, useState } from "react";
import {
  GridColumnResize,
  GridTools,
  useGridInteractions,
} from "../../shared/components/GridInteractions";

type ResultsGridProps = {
  resultSet: QueryResultSet | null;
  busy: boolean;
  error: QueryExecutionError | null;
};

const errorTitle: Record<QueryExecutionError["kind"], string> = {
  busy: "Database is busy",
  cancelled: "Query cancelled",
  database: "Query failed",
  timeout: "Query timed out",
  validation: "Cannot run query",
};

export function ResultsGrid({ resultSet, busy, error }: ResultsGridProps) {
  const [pagination, setPagination] = useState({ resultSet, page: 0 });
  const page = pagination.resultSet === resultSet ? pagination.page : 0;
  const pageSize = Math.max(
    1,
    Math.min(
      100,
      Math.floor(4000 / Math.max(1, resultSet?.columns.length ?? 1)),
    ),
  );
  const offset = page * pageSize;
  const rows = resultSet?.rows.slice(offset, offset + pageSize) ?? [];
  const identity = useMemo(() => ({ resultSet, page }), [resultSet, page]);
  const grid = useGridInteractions(rows, identity);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  if (busy) {
    return (
      <div className="results-state" aria-live="polite">
        <Loader2 className="spin" size={21} />
        <span>Running query…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="results-state error-state" role="alert">
        <SquareTerminal size={21} />
        <strong>{errorTitle[error.kind]}</strong>
        <span>{error.message}</span>
        {error.detail && <span className="error-detail">{error.detail}</span>}
        {error.hint && <span className="error-hint">Hint: {error.hint}</span>}
        {(error.code || error.position !== null) && (
          <small>
            {error.code && `SQLSTATE ${error.code}`}
            {error.code && error.position !== null && " · "}
            {error.position !== null && `Character ${error.position + 1}`}
          </small>
        )}
      </div>
    );
  }
  if (!resultSet) {
    return (
      <div className="results-state">
        <Play size={20} />
        <span>Run the query to see results</span>
        <kbd>{primaryModifierLabel} ↵</kbd>
      </div>
    );
  }
  if (resultSet.columns.length === 0) {
    return (
      <div className="results-state">
        <Check size={21} />
        <strong>Query completed</strong>
        <span>{resultSet.affectedRows} rows affected</span>
      </div>
    );
  }

  return (
    <div className="paged-results">
      <GridTools grid={grid} />
      <div className="result-table-wrap">
        <table
          className="result-table interactive-grid"
          role="grid"
          aria-label="SQL results"
          aria-readonly="true"
          style={{
            tableLayout: "fixed",
            width:
              48 +
              resultSet.columns.reduce(
                (sum, _, i) => sum + (columnWidths[i] ?? 200),
                0,
              ),
          }}
        >
          <thead>
            <tr>
              <th className="row-number">#</th>
              {resultSet.columns.map((column, index) => (
                <th
                  key={`${column}-${index}`}
                  style={{
                    width: columnWidths[index] ?? 200,
                    minWidth: columnWidths[index] ?? 200,
                    maxWidth: columnWidths[index] ?? 200,
                  }}
                >
                  {column}
                  <GridColumnResize
                    name={column}
                    width={columnWidths[index] ?? 200}
                    onChange={(width) =>
                      setColumnWidths((current) => ({
                        ...current,
                        [index]: width,
                      }))
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="row-number" style={{ width: 48 }}>
                  {offset + rowIndex + 1}
                </td>
                {row.map((cell, cellIndex) => (
                  <td
                    {...grid.cell(rowIndex, cellIndex)}
                    key={cellIndex}
                    className={cell === null ? "null-cell" : ""}
                    title={cell ?? "NULL"}
                  >
                    {cell ?? "NULL"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resultSet.rows.length > pageSize && (
        <nav className="result-pagination" aria-label="Result pagination">
          <span>
            {offset + 1}–{Math.min(offset + pageSize, resultSet.rows.length)} of{" "}
            {resultSet.rows.length} loaded rows
          </span>
          <button
            className="button ghost"
            disabled={page === 0}
            onClick={() => setPagination({ resultSet, page: page - 1 })}
          >
            Previous rows
          </button>
          <button
            className="button ghost"
            disabled={offset + pageSize >= resultSet.rows.length}
            onClick={() => setPagination({ resultSet, page: page + 1 })}
          >
            Next rows
          </button>
        </nav>
      )}
    </div>
  );
}
