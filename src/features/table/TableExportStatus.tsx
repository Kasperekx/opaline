import { HardDriveDownload } from "lucide-react";
import type { useTableExport } from "./useTableExport";
import { formatExportSize } from "./table-export";
/** `notice` renders in the flow above the grid; `progress` is the floating
 * capsule that joins the table's bottom stack. */
export function TableExportStatus({
  exporter,
  part,
}: {
  exporter: ReturnType<typeof useTableExport>;
  part: "notice" | "progress";
}) {
  const message = exporter.error
    ? `Could not export rows: ${exporter.error}`
    : exporter.savedFilename
      ? `Saved ${exporter.savedFilename}`
      : exporter.statusMessage;
  return (
    <>
      {part === "notice" && message && (
        <div
          className={`table-notice ${exporter.error ? "error" : ""}`}
          role={exporter.error ? "alert" : "status"}
        >
          <span>{message}</span>
          <button onClick={exporter.clearStatus}>Dismiss</button>
        </div>
      )}
      {part === "progress" && exporter.fullExport && (
        <div className="table-export-progress" role="status" data-hud-avoid="">
          <HardDriveDownload size={16} />
          <span>
            <strong>Exporting all matching rows</strong>
            {exporter.fullExport.rowsExported.toLocaleString()} rows ·{" "}
            {formatExportSize(exporter.fullExport.bytesWritten)}
          </span>
          <span className="table-export-progress-track" aria-hidden="true">
            <i />
          </span>
          <button
            disabled={exporter.fullExport.cancelling}
            onClick={() => void exporter.cancelFullExport()}
          >
            {exporter.fullExport.cancelling ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      )}
    </>
  );
}
