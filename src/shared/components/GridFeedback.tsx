import { ConnectionDialog } from "../../features/connections/ConnectionDialog";
import type { useGridInteractions } from "./GridInteractions";

/** Keep inspection and accessible clipboard feedback independent of a toolbar. */
export function GridFeedback({
  grid,
  quiet = false,
}: {
  grid: ReturnType<typeof useGridInteractions>;
  quiet?: boolean;
}) {
  return (
    <>
      {grid.message && (
        <div
          className={
            quiet
              ? grid.copyFailed
                ? "table-grid-feedback"
                : "sr-only"
              : "grid-copy-status"
          }
          role={grid.copyFailed ? "alert" : "status"}
        >
          {grid.message}
          {grid.copyFailed && (
            <button
              aria-label="Dismiss clipboard error"
              onClick={grid.dismissMessage}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      {grid.inspecting && (
        <ConnectionDialog
          title={grid.inspecting.value === null ? "NULL value" : "Cell value"}
          subtitle="Read-only · full text, no numeric conversion"
          onClose={grid.closeInspector}
        >
          <div className="p1-panel">
            <p className="p1-muted">
              {grid.inspecting.value === null
                ? "SQL NULL is not an empty string."
                : `${grid.inspecting.value.length.toLocaleString()} characters. Values are shown without reformatting.`}
            </p>
            <textarea
              className="cell-value-inspector"
              aria-label="Full cell value"
              data-initial-focus="true"
              readOnly
              value={grid.inspecting.value ?? "NULL"}
            />
          </div>
        </ConnectionDialog>
      )}
    </>
  );
}
