import { HardDriveDownload } from "lucide-react";
import type { useTableExport } from "./useTableExport";
import { formatExportSize } from "./table-export";
export function TableExportStatus({
  exporter,
}: {
  exporter: ReturnType<typeof useTableExport>;
}) {
  const message = exporter.error
    ? `Could not export rows: ${exporter.error}`
    : exporter.savedFilename
      ? `Saved ${exporter.savedFilename}`
      : exporter.statusMessage;
  return (
    <>
      {message && (
        <div
          className={`table-notice ${exporter.error ? "error" : ""}`}
          role={exporter.error ? "alert" : "status"}
        >
          <span>{message}</span>
          <button onClick={exporter.clearStatus}>Dismiss</button>
        </div>
      )}
      {exporter.fullExport && (
        <div className="table-export-progress" role="status">
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
