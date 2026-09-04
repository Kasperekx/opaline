import { useCallback, useState } from "react";
import { errorMessage } from "../../shared/lib/database-api";
import type { ColumnInfo, TableDataRow } from "../../shared/types/database";
import { saveTableExport, type TableExportFormat } from "./table-export";

type UseTableExportOptions = {
  schema: string;
  table: string;
  columns: ColumnInfo[];
  visibleRows: TableDataRow[];
  selectedRows: TableDataRow[];
};

export function useTableExport({
  schema,
  table,
  columns,
  visibleRows,
  selectedRows,
}: UseTableExportOptions) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFilename, setSavedFilename] = useState<string | null>(null);

  const exportRows = useCallback(
    async (format: TableExportFormat) => {
      const rows = selectedRows.length > 0 ? selectedRows : visibleRows;
      if (rows.length === 0 || busy) return false;
      setBusy(true);
      setError(null);
      setSavedFilename(null);
      try {
        const path = await saveTableExport({ schema, table, columns, rows, format });
        if (!path) return false;
        setSavedFilename(path.split(/[\\/]/).pop() ?? path);
        return true;
      } catch (caughtError) {
        setError(errorMessage(caughtError));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, columns, schema, selectedRows, table, visibleRows],
  );

  const clearStatus = useCallback(() => {
    setError(null);
    setSavedFilename(null);
  }, []);

  return { busy, error, savedFilename, exportRows, clearStatus };
}

