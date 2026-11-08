import { Check, Loader2, Play, SquareTerminal } from "lucide-react";
import type {
  QueryExecutionError,
  QueryResultSet,
} from "../../shared/types/database";
import { primaryModifierLabel } from "../../shared/lib/platform";
import { useEntrance } from "../../shared/hooks/useEntrance";
import {
  useEffect,
  useMemo,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";
import {
  GridColumnResize,
  GridTools,
  useGridInteractions,
} from "../../shared/components/GridInteractions";

type ResultsGridProps = {
  resultSet: QueryResultSet | null;
  busy: boolean;
  error: QueryExecutionError | null;
  /** Where the error sits in the editor, shown as a link back to it. */
  errorLocation?: { line: number; column: number } | null;
  onRevealError?: () => void;
  /** Changes when a run delivers a new outcome; that outcome slides in once.
   * Undefined for outcomes that were already on screen (tab switches). */
  revealKey?: number;
};

const numberFormat = new Intl.NumberFormat("en-US");
export const formatCount = (value: number) => numberFormat.format(value);
export const formatDuration = (ms: number) =>
  ms < 1000
    ? `${formatCount(Math.round(ms))} ms`
    : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;

/**
 * Tracks the outcome (result or error) of the active query tab. An outcome
 * that replaces another in the same tab is "fresh" — a run just finished —
 * while switching tabs only shows what was already there.
 */
export function useRunOutcome(tabId: string | undefined, outcome: unknown) {
  const [seen, setSeen] = useState({
    tabId,
    outcome,
    generation: 0,
    fresh: false,
  });
  if (seen.tabId !== tabId || seen.outcome !== outcome) {
    const next = {
      tabId,
      outcome,
      generation: seen.generation + 1,
      fresh: seen.tabId === tabId && outcome != null,
    };
    setSeen(next);
    return next;
  }
  return seen;
}

/** Plays `[data-entering]` once per new revealKey. */
function useReveal(revealKey: number | undefined) {
  const [settled, setSettled] = useState<number | undefined>(undefined);
  const entering = revealKey !== undefined && settled !== revealKey;
  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => setSettled(revealKey), 400);
    return () => window.clearTimeout(timer);
  }, [entering, revealKey]);
  return {
    "data-entering": entering ? "" : undefined,
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) setSettled(revealKey);
    },
  };
}

/** Run duration in the results header: "Done in 38 ms" right after a run,
 * settling to the plain timing. Key it by run so each run starts fresh. */
export function RunDuration({
  durationMs,
  fresh,
}: {
  durationMs: number;
  fresh: boolean;
}) {
  const [done, setDone] = useState(fresh);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 1800);
    return () => window.clearTimeout(timer);
  }, [done]);
  const time = formatDuration(durationMs);
  if (done)
    return (
      <FadeIn key="done" className="result-done">
        <Check size={12} strokeWidth={2.5} aria-hidden="true" />
        Done in {time}
      </FadeIn>
    );
  return fresh ? (
    <FadeIn key="time" className="result-duration">
      {time}
    </FadeIn>
  ) : (
    <span className="result-duration">{time}</span>
  );
}

function FadeIn({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const entrance = useEntrance(400);
  return (
    <span className={`${className} fade-in`} {...entrance}>
      {children}
    </span>
  );
}

/** First run in a tab: the spinner fades in late, so fast queries go
 * straight from the empty state to their result. */
function RunningState() {
  const entrance = useEntrance(800);
  return (
    <div
      className="results-state results-running"
      aria-live="polite"
      {...entrance}
    >
      <span className="results-state-icon">
        <Loader2 className="spin" size={20} />
      </span>
      <span>Running query…</span>
    </div>
  );
}

const errorTitle: Record<QueryExecutionError["kind"], string> = {
  busy: "Database is busy",
  cancelled: "Query cancelled",
  database: "Query failed",
  timeout: "Query timed out",
  validation: "Cannot run query",
};

export function ResultsGrid({
  resultSet,
  busy,
  error,
  errorLocation,
  onRevealError,
  revealKey,
}: ResultsGridProps) {
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
  const reveal = useReveal(revealKey);
  // A re-run keeps the previous outcome on screen, dimmed (after a short
  // delay, so fast queries never flicker), instead of blanking the pane.
  const stale = busy && (resultSet !== null || error !== null);
  // One stable fragment, so dimming never remounts (and rescrolls) the grid.
  return (
    <>
      {renderOutcome()}
      {stale && (
        <span className="sr-only" role="status">
          Running query…
        </span>
      )}
    </>
  );

  function renderOutcome() {
    if (busy && !stale) {
      return <RunningState />;
    }
    if (error) {
      return (
        <div
          className="results-state error-state"
          role="alert"
          aria-busy={stale || undefined}
          {...reveal}
        >
          <span className="results-state-icon">
            <SquareTerminal size={20} />
          </span>
          <strong>{errorTitle[error.kind]}</strong>
          <span>{error.message}</span>
          {error.detail && <span className="error-detail">{error.detail}</span>}
          {error.hint && <span className="error-hint">Hint: {error.hint}</span>}
          {(error.code || error.position !== null) && (
            <small className="error-meta">
              {error.code && `SQLSTATE ${error.code}`}
              {error.code && error.position !== null && " · "}
              {error.position !== null &&
                (errorLocation && onRevealError ? (
                  <button
                    type="button"
                    className="error-location"
                    title="Show in editor"
                    onClick={onRevealError}
                  >
                    Line {errorLocation.line}, column {errorLocation.column}
                  </button>
                ) : (
                  `Character ${error.position + 1}`
                ))}
            </small>
          )}
        </div>
      );
    }
    if (!resultSet) {
      return (
        <div className="results-state">
          <span className="results-state-icon">
            <Play size={20} />
          </span>
          <strong>Run the query to see results</strong>
          <kbd>{primaryModifierLabel}↩</kbd>
        </div>
      );
    }
    if (resultSet.columns.length === 0) {
      return (
        <div
          className="results-state"
          aria-busy={stale || undefined}
          {...reveal}
        >
          <span className="results-state-icon">
            <Check size={20} />
          </span>
          <strong>Query completed</strong>
          <span className="results-state-count">
            {formatCount(resultSet.affectedRows)}{" "}
            {resultSet.affectedRows === 1 ? "row" : "rows"} affected
          </span>
        </div>
      );
    }

    return (
      <div className="paged-results" aria-busy={stale || undefined} {...reveal}>
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
          {resultSet.rows.length === 0 && (
            <div className="results-empty" role="status">
              No rows
            </div>
          )}
        </div>
        {resultSet.rows.length > pageSize && (
          <nav className="result-pagination" aria-label="Result pagination">
            <span>
              {formatCount(offset + 1)}–
              {formatCount(Math.min(offset + pageSize, resultSet.rows.length))}{" "}
              of {formatCount(resultSet.rows.length)} loaded rows
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
}
