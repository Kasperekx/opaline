import { useDatabaseSession } from "../connections/SessionContext";
import { useCallback, useState } from "react";
import { errorMessage } from "../../shared/lib/database-api";
import { useWorkRisk } from "../../shared/safety/WorkSafety";
import { databaseObjectKey } from "../../shared/lib/database-object";
import type {
  ColumnInfo,
  TableDataRow,
  TableExportProgress,
  TableSort,
  TableFilter,
} from "../../shared/types/database";
import {
  chooseTableExportPath,
  formatExportSize,
  saveTableExport,
  type TableExportFormat,
} from "./table-export";
import { useHud } from "../../shared/components/Hud";

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

type UseTableExportOptions = {
  schema: string;
  table: string;
  columns: ColumnInfo[];
  visibleRows: TableDataRow[];
  selectedRows: TableDataRow[];
  filter: string;
  sort: TableSort | null;
  conditions?: TableFilter[];
};

export type FullTableExport = TableExportProgress & {
  format: TableExportFormat;
  cancelling: boolean;
};

export function useTableExport({
  schema,
  table,
  columns,
  visibleRows,
  selectedRows,
  filter,
  sort,
  conditions,
}: UseTableExportOptions) {
  const { session, api: databaseApi } = useDatabaseSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFilename, setSavedFilename] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fullExport, setFullExport] = useState<FullTableExport | null>(null);
  const hud = useHud();
  // A finished export is a confirmation: the HUD shows it when present,
  // otherwise the inline notice keeps the file name on screen.
  const finished = useCallback(
    (path: string, rows: number | null, bytes: number | null) => {
      if (!hud.available) {
        setSavedFilename(fileName(path));
        return;
      }
      hud.show({
        title:
          rows === null
            ? "Export finished"
            : `Exported ${rows.toLocaleString()} ${rows === 1 ? "row" : "rows"}`,
        detail:
          bytes === null
            ? fileName(path)
            : `${fileName(path)} · ${formatExportSize(bytes)}`,
        tone: "success",
      });
    },
    [hud],
  );
  useWorkRisk({
    sessionId: session.id,
    tabId: `table:${databaseObjectKey({ schema, name: table })}`,
    label: `${session.name}: exporting ${schema}.${table}`,
    busy,
  });

  const exportRows = useCallback(
    async (format: TableExportFormat) => {
      const rows = selectedRows.length > 0 ? selectedRows : visibleRows;
      if (rows.length === 0 || busy) return false;
      setBusy(true);
      setError(null);
      setSavedFilename(null);
      setStatusMessage(null);
      try {
        const path = await saveTableExport({
          schema,
          table,
          columns,
          rows,
          format,
        });
        if (!path) return false;
        finished(path, rows.length, null);
        return true;
      } catch (caughtError) {
        setError(errorMessage(caughtError));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, columns, finished, schema, selectedRows, table, visibleRows],
  );

  const exportAllRows = useCallback(
    async (format: TableExportFormat) => {
      if (busy) return false;
      setBusy(true);
      setError(null);
      setSavedFilename(null);
      setStatusMessage(null);
      try {
        const path = await chooseTableExportPath(schema, table, format);
        if (!path) return false;
        setFullExport({
          format,
          rowsExported: 0,
          bytesWritten: 0,
          cancelling: false,
        });
        const result = await databaseApi.exportTableData(
          {
            schema,
            table,
            filter: filter || null,
            sort,
            conditions,
            format,
            path,
          },
          (progress) => {
            setFullExport((current) =>
              current ? { ...current, ...progress } : current,
            );
          },
        );
        finished(
          path,
          typeof result?.rowsExported === "number" ? result.rowsExported : null,
          typeof result?.bytesWritten === "number" ? result.bytesWritten : null,
        );
        return true;
      } catch (caughtError) {
        const message = errorMessage(caughtError);
        if (message.toLowerCase().includes("cancelled")) {
          setStatusMessage("Export cancelled. No partial file was kept.");
        } else {
          setError(message);
        }
        return false;
      } finally {
        setFullExport(null);
        setBusy(false);
      }
    },
    [databaseApi, busy, filter, finished, schema, sort, table, conditions],
  );

  const cancelFullExport = useCallback(async () => {
    setFullExport((current) =>
      current ? { ...current, cancelling: true } : current,
    );
    try {
      await databaseApi.cancelQuery();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }, [databaseApi]);

  const clearStatus = useCallback(() => {
    setError(null);
    setSavedFilename(null);
    setStatusMessage(null);
  }, []);

  return {
    busy,
    error,
    savedFilename,
    statusMessage,
    fullExport,
    exportRows,
    exportAllRows,
    cancelFullExport,
    clearStatus,
  };
}
