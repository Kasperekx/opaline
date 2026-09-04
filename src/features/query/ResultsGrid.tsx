import { Check, Loader2, Play, SquareTerminal } from "lucide-react";
import type {
  QueryExecutionError,
  QueryResultSet,
} from "../../shared/types/database";
import { primaryModifierLabel } from "../../shared/lib/platform";

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
    <div className="result-table-wrap">
      <table className="result-table">
        <thead>
          <tr>
            <th className="row-number">#</th>
            {resultSet.columns.map((column, index) => (
              <th key={`${column}-${index}`}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resultSet.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="row-number">{rowIndex + 1}</td>
              {row.map((cell, cellIndex) => (
                <td
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
  );
}
