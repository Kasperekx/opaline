import { ConnectionDialog } from "../../features/connections/ConnectionDialog";
import type { useGridInteractions } from "./GridInteractions";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Keep inspection and accessible clipboard feedback independent of a toolbar. */
export function GridFeedback({
  grid,
  quiet = false,
  sidePanel = false,
}: {
  grid: ReturnType<typeof useGridInteractions>;
  quiet?: boolean;
  sidePanel?: boolean;
}) {
  const valueRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (sidePanel && grid.inspecting) valueRef.current?.focus();
  }, [sidePanel, grid.inspecting]);
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
      {grid.inspecting && sidePanel && (
        <aside
          className="grid-value-panel"
          aria-label="Value inspector"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              grid.closeInspector();
            }
          }}
        >
          <header>
            <div>
              <span>VALUE INSPECTOR</span>
              <h3>
                {grid.inspecting.label ??
                  (grid.inspecting.value === null ? "SQL NULL" : "Cell value")}
              </h3>
            </div>
            <button
              className="icon-button"
              aria-label="Close value inspector"
              onClick={grid.closeInspector}
            >
              <X size={17} />
            </button>
          </header>
          <p>
            {grid.inspecting.value === null
              ? "No value. This is not an empty string."
              : `${grid.inspecting.value.length.toLocaleString()} characters · Original text`}
          </p>
          <textarea
            ref={valueRef}
            className="cell-value-inspector"
            aria-label="Full cell value"
            readOnly
            value={grid.inspecting.value ?? "NULL"}
          />
          <footer>
            Read-only snapshot. Values are never rounded or reformatted.
          </footer>
        </aside>
      )}
      {grid.inspecting && !sidePanel && (
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
