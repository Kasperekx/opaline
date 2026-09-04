import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { databaseApi, errorMessage } from "../../shared/lib/database-api";
import type {
  TableCellValue,
  TableDataPage,
  TableDataRow,
  TableSort,
} from "../../shared/types/database";
import type { TableTab } from "../query/query-types";
import type { InsertCellValue } from "./table-types";

type RowDraft = {
  rowIndex: number;
  original: TableDataRow;
  values: Array<string | null>;
};

type InsertDraft = {
  values: InsertCellValue[];
};

const buildRowKey = (
  page: TableDataPage,
  row: TableDataRow,
): TableCellValue[] =>
  page.columns.flatMap((column, index) =>
    column.primaryKey ? [{ column: column.name, value: row.values[index] }] : [],
  );

const selectionKey = (
  page: TableDataPage,
  row: TableDataRow,
  rowIndex: number,
) => {
  const key = buildRowKey(page, row);
  return key.length > 0
    ? `key:${JSON.stringify(key)}`
    : `row:${page.page}:${rowIndex}:${JSON.stringify(row.values)}`;
};

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
  const [insertDraft, setInsertDraft] = useState<InsertDraft | null>(null);
  const [selectedRowsByKey, setSelectedRowsByKey] = useState(
    () => new Map<string, TableDataRow>(),
  );
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);

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
    setInsertDraft(null);
    setSelectedRowsByKey(new Map());
    setMutationError(null);
    setMutationMessage(null);
    setRevision((current) => current + 1);
  }, []);

  const applyFilter = useCallback(() => {
    const nextFilter = filterDraft.trim();
    setDraft(null);
    setInsertDraft(null);
    setSelectedRowsByKey(new Map());
    setMutationError(null);
    setMutationMessage(null);
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
    setInsertDraft(null);
    setSelectedRowsByKey(new Map());
    setMutationError(null);
    setMutationMessage(null);
  }, []);

  const setPage = useCallback((nextPage: number) => {
    setDraft(null);
    setInsertDraft(null);
    setMutationError(null);
    setMutationMessage(null);
    setPageState(Math.max(0, nextPage));
  }, []);

  const setPageSize = useCallback((nextPageSize: number) => {
    setDraft(null);
    setInsertDraft(null);
    setSelectedRowsByKey(new Map());
    setMutationError(null);
    setMutationMessage(null);
    setPageState(0);
    setPageSizeState(nextPageSize);
  }, []);

  const toggleSort = useCallback((column: string) => {
    setDraft(null);
    setInsertDraft(null);
    setSelectedRowsByKey(new Map());
    setMutationError(null);
    setMutationMessage(null);
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
      setMutationMessage(null);
      setInsertDraft(null);
      setSelectedRowsByKey(new Map());
      setDraft({ rowIndex, original: row, values: [...row.values] });
    },
    [data],
  );

  const discardChanges = useCallback(() => {
    setDraft(null);
    setMutationError(null);
    setMutationMessage(null);
  }, []);

  const startInserting = useCallback(() => {
    if (!data?.insertable) return;
    setMutationError(null);
    setMutationMessage(null);
    setDraft(null);
    setSelectedRowsByKey(new Map());
    setInsertDraft({
      values: data.columns.map((column) => {
        if (column.identity || column.generated || column.defaultValue !== null) {
          return undefined;
        }
        return column.nullable ? null : "";
      }),
    });
  }, [data]);

  const discardInsert = useCallback(() => {
    setInsertDraft(null);
    setMutationError(null);
    setMutationMessage(null);
  }, []);

  const updateValue = useCallback((columnIndex: number, value: string | null) => {
    setDraft((current) => {
      if (!current) return current;
      const values = [...current.values];
      values[columnIndex] = value;
      return { ...current, values };
    });
  }, []);

  const updateInsertValue = useCallback(
    (columnIndex: number, value: InsertCellValue) => {
      setInsertDraft((current) => {
        if (!current) return current;
        const values = [...current.values];
        values[columnIndex] = value;
        return { values };
      });
    },
    [],
  );

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

  const currentPageRows = useMemo(
    () =>
      data?.rows.map((row, rowIndex) => ({
        key: selectionKey(data, row, rowIndex),
        row,
      })) ?? [],
    [data],
  );
  const selectedRows = useMemo(
    () => [...selectedRowsByKey.values()],
    [selectedRowsByKey],
  );
  const selectedOnPage = currentPageRows.filter(({ key }) =>
    selectedRowsByKey.has(key),
  ).length;
  const allPageRowsSelected =
    currentPageRows.length > 0 && selectedOnPage === currentPageRows.length;
  const somePageRowsSelected = selectedOnPage > 0 && !allPageRowsSelected;

  const toggleRowSelection = useCallback(
    (rowIndex: number) => {
      const entry = currentPageRows[rowIndex];
      if (!entry) return;
      setSelectedRowsByKey((current) => {
        const next = new Map(current);
        if (next.has(entry.key)) next.delete(entry.key);
        else next.set(entry.key, entry.row);
        return next;
      });
    },
    [currentPageRows],
  );

  const togglePageSelection = useCallback(() => {
    setSelectedRowsByKey((current) => {
      const next = new Map(current);
      if (allPageRowsSelected) {
        currentPageRows.forEach(({ key }) => next.delete(key));
      } else {
        currentPageRows.forEach(({ key, row }) => next.set(key, row));
      }
      return next;
    });
  }, [allPageRowsSelected, currentPageRows]);

  const clearSelection = useCallback(() => {
    setSelectedRowsByKey(new Map());
  }, []);

  const saveInsert = useCallback(async () => {
    if (!data || !insertDraft) return;
    const values = data.columns.flatMap((column, index) => {
      const value = insertDraft.values[index];
      return column.identity || column.generated || value === undefined
        ? []
        : [{ column: column.name, value }];
    });
    setMutationBusy(true);
    setMutationError(null);
    setMutationMessage(null);
    try {
      await databaseApi.insertTableRow({
        schema: tab.schema,
        table: tab.table,
        values,
      });
      setInsertDraft(null);
      setSelectedRowsByKey(new Map());
      setMutationMessage(
        filter ? "Row inserted. The active filter may hide it." : "Row inserted.",
      );
      if (page === 0) setRevision((current) => current + 1);
      else setPageState(0);
    } catch (caughtError) {
      setMutationError(errorMessage(caughtError));
    } finally {
      setMutationBusy(false);
    }
  }, [data, filter, insertDraft, page, tab.schema, tab.table]);

  const saveChanges = useCallback(async () => {
    if (!data || !draft || !draft.original.rowVersion || changedCells.length === 0) {
      setDraft(null);
      return;
    }
    setMutationBusy(true);
    setMutationError(null);
    setMutationMessage(null);
    try {
      await databaseApi.updateTableRow({
        schema: tab.schema,
        table: tab.table,
        key: buildRowKey(data, draft.original),
        changes: changedCells,
        rowVersion: draft.original.rowVersion,
      });
      setDraft(null);
      setSelectedRowsByKey(new Map());
      setMutationMessage("Row updated.");
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
      setMutationMessage(null);
      try {
        await databaseApi.deleteTableRow({
          schema: tab.schema,
          table: tab.table,
          key: buildRowKey(data, row),
          rowVersion: row.rowVersion,
        });
        setDraft(null);
        setSelectedRowsByKey(new Map());
        setMutationMessage("Row deleted.");
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
    insertDraft,
    mutationBusy,
    mutationError,
    mutationMessage,
    changedCellCount: changedCells.length,
    selectedRows,
    selectedCount: selectedRows.length,
    selectedOnPage,
    allPageRowsSelected,
    somePageRowsSelected,
    hasDraft: draft !== null || insertDraft !== null,
    setFilterDraft,
    applyFilter,
    clearFilter,
    setPage,
    setPageSize,
    toggleSort,
    refresh,
    startEditing,
    startInserting,
    discardChanges,
    discardInsert,
    updateValue,
    updateInsertValue,
    toggleRowSelection,
    togglePageSelection,
    clearSelection,
    dismissMutationMessage: () => setMutationMessage(null),
    rowSelectionKey: (rowIndex: number) => currentPageRows[rowIndex]?.key,
    isRowSelected: (rowIndex: number) => {
      const key = currentPageRows[rowIndex]?.key;
      return key ? selectedRowsByKey.has(key) : false;
    },
    saveInsert,
    saveChanges,
    deleteRow,
  };
}
