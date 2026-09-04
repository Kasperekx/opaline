import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { databaseApi, errorMessage } from "../../shared/lib/database-api";
import type {
  TableCellValue,
  TableDataPage,
  TableDataRow,
  TableSort,
} from "../../shared/types/database";
import type { TableTab } from "../query/query-types";

type RowDraft = {
  rowIndex: number;
  original: TableDataRow;
  values: Array<string | null>;
};

const buildRowKey = (
  page: TableDataPage,
  row: TableDataRow,
): TableCellValue[] =>
  page.columns.flatMap((column, index) =>
    column.primaryKey ? [{ column: column.name, value: row.values[index] }] : [],
  );

export function useTableData(tab: TableTab) {
  const requestId = useRef(0);
  const [data, setData] = useState<TableDataPage | null>(null);
  const [page, setPageState] = useState(0);
  const [pageSize, setPageSizeState] = useState(50);
  const [filter, setFilterState] = useState("");
  const [filterDraft, setFilterDraft] = useState("");
  const [sort, setSortState] = useState<TableSort | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const result = await databaseApi.loadTablePage({
        schema: tab.schema,
        table: tab.table,
        page,
        pageSize,
        filter: filter || null,
        sort,
      });
      if (currentRequest === requestId.current) setData(result);
    } catch (caughtError) {
      if (currentRequest === requestId.current) {
        setError(errorMessage(caughtError));
      }
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }, [filter, page, pageSize, revision, sort, tab.schema, tab.table]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setDraft(null);
    setMutationError(null);
    setRevision((current) => current + 1);
  }, []);

  const applyFilter = useCallback(() => {
    const nextFilter = filterDraft.trim();
    setDraft(null);
    setMutationError(null);
    setPageState(0);
    setFilterState(nextFilter);
    if (page === 0 && nextFilter === filter) {
      setRevision((current) => current + 1);
    }
  }, [filter, filterDraft, page]);

  const clearFilter = useCallback(() => {
    setFilterDraft("");
    setFilterState("");
    setPageState(0);
    setDraft(null);
  }, []);

  const setPage = useCallback((nextPage: number) => {
    setDraft(null);
    setMutationError(null);
    setPageState(Math.max(0, nextPage));
  }, []);

  const setPageSize = useCallback((nextPageSize: number) => {
    setDraft(null);
    setMutationError(null);
    setPageState(0);
    setPageSizeState(nextPageSize);
  }, []);

  const toggleSort = useCallback((column: string) => {
    setDraft(null);
    setMutationError(null);
    setPageState(0);
    setSortState((current) => {
      if (!current || current.column !== column) {
        return { column, direction: "asc" };
      }
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }, []);

  const startEditing = useCallback(
    (rowIndex: number) => {
      const row = data?.rows[rowIndex];
      if (!data?.editable || !row?.rowVersion) return;
      setMutationError(null);
      setDraft({ rowIndex, original: row, values: [...row.values] });
    },
    [data],
  );

  const discardChanges = useCallback(() => {
    setDraft(null);
    setMutationError(null);
  }, []);

  const updateValue = useCallback((columnIndex: number, value: string | null) => {
    setDraft((current) => {
      if (!current) return current;
      const values = [...current.values];
      values[columnIndex] = value;
      return { ...current, values };
    });
  }, []);

  const changedCells = useMemo(
    () =>
      data && draft
        ? data.columns.flatMap((column, index) =>
            !column.identity &&
            !column.generated &&
            draft.values[index] !== draft.original.values[index]
              ? [{ column: column.name, value: draft.values[index] }]
              : [],
          )
        : [],
    [data, draft],
  );

  const saveChanges = useCallback(async () => {
    if (!data || !draft || !draft.original.rowVersion || changedCells.length === 0) {
      setDraft(null);
      return;
    }
    setMutationBusy(true);
    setMutationError(null);
    try {
      await databaseApi.updateTableRow({
        schema: tab.schema,
        table: tab.table,
        key: buildRowKey(data, draft.original),
        changes: changedCells,
        rowVersion: draft.original.rowVersion,
      });
      setDraft(null);
      setRevision((current) => current + 1);
    } catch (caughtError) {
      setMutationError(errorMessage(caughtError));
    } finally {
      setMutationBusy(false);
    }
  }, [changedCells, data, draft, tab.schema, tab.table]);

  const deleteRow = useCallback(
    async (rowIndex: number) => {
      const row = data?.rows[rowIndex];
      if (!data?.editable || !row?.rowVersion) return false;
      setMutationBusy(true);
      setMutationError(null);
      try {
        await databaseApi.deleteTableRow({
          schema: tab.schema,
          table: tab.table,
          key: buildRowKey(data, row),
          rowVersion: row.rowVersion,
        });
        setDraft(null);
        if (data.rows.length === 1 && page > 0) {
          setPageState((current) => current - 1);
        } else {
          setRevision((current) => current + 1);
        }
        return true;
      } catch (caughtError) {
        setMutationError(errorMessage(caughtError));
        return false;
      } finally {
        setMutationBusy(false);
      }
    },
    [data, page, tab.schema, tab.table],
  );

  return {
    data,
    page,
    pageSize,
    filter,
    filterDraft,
    sort,
    busy,
    error,
    draft,
    mutationBusy,
    mutationError,
    changedCellCount: changedCells.length,
    setFilterDraft,
    applyFilter,
    clearFilter,
    setPage,
    setPageSize,
    toggleSort,
    refresh,
    startEditing,
    discardChanges,
    updateValue,
    saveChanges,
    deleteRow,
  };
}
