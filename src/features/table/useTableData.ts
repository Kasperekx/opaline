import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { databaseApi, errorMessage } from "../../shared/lib/database-api";
import type {
  TableCellValue,
  TableDataPage,
  TableDataRow,
  TableRowIdentity,
  TableSort,
} from "../../shared/types/database";
import type { TableTab } from "../query/query-types";
import {
  initialColumnValue,
  validateColumnValue,
  writableColumns,
} from "./column-editor";
import type { InsertCellValue } from "./table-types";

type RowDraft = {
  rowIndex: number;
  original: TableDataRow;
  values: Array<string | null>;
};

type InsertDraft = {
  values: InsertCellValue[];
};

type BulkUpdateDraft = {
  columnIndex: number;
  value: string | null;
};

export const MAX_BULK_MUTATION_ROWS = 500;

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

const rowIdentity = (
  page: TableDataPage,
  row: TableDataRow,
): TableRowIdentity | null =>
  row.rowVersion
    ? { key: buildRowKey(page, row), rowVersion: row.rowVersion }
    : null;

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
  const [bulkUpdateDraft, setBulkUpdateDraft] = useState<BulkUpdateDraft | null>(null);
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
    setBulkUpdateDraft(null);
    setSelectedRowsByKey(new Map());
    setMutationError(null);
    setMutationMessage(null);
    setRevision((current) => current + 1);
  }, []);

  const applyFilter = useCallback(() => {
    const nextFilter = filterDraft.trim();
    setDraft(null);
    setInsertDraft(null);
    setBulkUpdateDraft(null);
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
    setBulkUpdateDraft(null);
    setSelectedRowsByKey(new Map());
    setMutationError(null);
    setMutationMessage(null);
  }, []);

  const setPage = useCallback((nextPage: number) => {
    setDraft(null);
    setInsertDraft(null);
    setBulkUpdateDraft(null);
    setMutationError(null);
    setMutationMessage(null);
    setPageState(Math.max(0, nextPage));
  }, []);

  const setPageSize = useCallback((nextPageSize: number) => {
    setDraft(null);
    setInsertDraft(null);
    setBulkUpdateDraft(null);
    setSelectedRowsByKey(new Map());
    setMutationError(null);
    setMutationMessage(null);
    setPageState(0);
    setPageSizeState(nextPageSize);
  }, []);

  const toggleSort = useCallback((column: string) => {
    setDraft(null);
    setInsertDraft(null);
    setBulkUpdateDraft(null);
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
      setBulkUpdateDraft(null);
      setSelectedRowsByKey(new Map());
      setDraft({ rowIndex, original: row, values: [...row.values] });
    },
    [data],
  );

  const discardChanges = useCallback(() => {
    setDraft(null);
    setBulkUpdateDraft(null);
    setMutationError(null);
    setMutationMessage(null);
  }, []);

  const startInserting = useCallback(() => {
    if (!data?.insertable) return;
    setMutationError(null);
    setMutationMessage(null);
    setDraft(null);
    setBulkUpdateDraft(null);
    setSelectedRowsByKey(new Map());
    setInsertDraft({
      values: data.columns.map((column) => {
        if (column.identity || column.generated || column.defaultValue !== null) {
          return undefined;
        }
        return initialColumnValue(column);
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
  const draftErrors = useMemo(
    () =>
      data?.columns.map((column, index) => {
        if (
          !draft ||
          column.identity ||
          column.generated ||
          draft.values[index] === draft.original.values[index]
        ) {
          return null;
        }
        return validateColumnValue(column, draft.values[index]);
      }) ?? [],
    [data, draft],
  );
  const insertErrors = useMemo(
    () =>
      data?.columns.map((column, index) =>
        !insertDraft || column.identity || column.generated
          ? null
          : validateColumnValue(column, insertDraft.values[index]),
      ) ?? [],
    [data, insertDraft],
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
  const selectedIdentities = useMemo(
    () => (data ? selectedRows.flatMap((row) => rowIdentity(data, row) ?? []) : []),
    [data, selectedRows],
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
    setBulkUpdateDraft(null);
  }, []);

  const startBulkUpdate = useCallback(() => {
    if (!data?.editable || selectedRows.length === 0) return;
    if (selectedRows.length > MAX_BULK_MUTATION_ROWS) {
      setMutationError(
        `Bulk changes are limited to ${MAX_BULK_MUTATION_ROWS} rows at a time.`,
      );
      return;
    }
    const column = writableColumns(data.columns)[0];
    if (!column) {
      setMutationError("This table has no columns that can be updated in bulk.");
      return;
    }
    setMutationError(null);
    setMutationMessage(null);
    setBulkUpdateDraft({
      columnIndex: data.columns.indexOf(column),
      value: initialColumnValue(column),
    });
  }, [data, selectedRows.length]);

  const setBulkUpdateColumn = useCallback(
    (columnIndex: number) => {
      const column = data?.columns[columnIndex];
      if (!column || !writableColumns(data.columns).includes(column)) return;
      setMutationError(null);
      setBulkUpdateDraft({ columnIndex, value: initialColumnValue(column) });
    },
    [data],
  );

  const updateBulkValue = useCallback((value: string | null) => {
    setMutationError(null);
    setBulkUpdateDraft((current) => (current ? { ...current, value } : current));
  }, []);

  const discardBulkUpdate = useCallback(() => {
    setBulkUpdateDraft(null);
    setMutationError(null);
  }, []);

  const bulkUpdateColumn =
    data && bulkUpdateDraft ? data.columns[bulkUpdateDraft.columnIndex] : undefined;
  const bulkUpdateError = bulkUpdateColumn
    ? validateColumnValue(bulkUpdateColumn, bulkUpdateDraft?.value)
    : null;

  const saveInsert = useCallback(async () => {
    if (!data || !insertDraft) return;
    if (insertErrors.some(Boolean)) {
      setMutationError("Fix the invalid values before inserting this row.");
      return;
    }
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
  }, [data, filter, insertDraft, insertErrors, page, tab.schema, tab.table]);

  const saveChanges = useCallback(async () => {
    if (!data || !draft || !draft.original.rowVersion || changedCells.length === 0) {
      setDraft(null);
      return;
    }
    if (draftErrors.some(Boolean)) {
      setMutationError("Fix the invalid values before saving this row.");
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
  }, [changedCells, data, draft, draftErrors, tab.schema, tab.table]);

  const saveBulkUpdate = useCallback(async () => {
    if (!data || !bulkUpdateDraft || !bulkUpdateColumn || bulkUpdateError) return false;
    if (selectedIdentities.length !== selectedRows.length) {
      setMutationError("Some selected rows cannot be updated safely. Refresh and try again.");
      return false;
    }
    setMutationBusy(true);
    setMutationError(null);
    setMutationMessage(null);
    try {
      const result = await databaseApi.updateTableRows({
        schema: tab.schema,
        table: tab.table,
        rows: selectedIdentities,
        change: { column: bulkUpdateColumn.name, value: bulkUpdateDraft.value },
      });
      setBulkUpdateDraft(null);
      setSelectedRowsByKey(new Map());
      setMutationMessage(`${result.affectedRows} rows updated.`);
      setRevision((current) => current + 1);
      return true;
    } catch (caughtError) {
      setMutationError(errorMessage(caughtError));
      return false;
    } finally {
      setMutationBusy(false);
    }
  }, [
    bulkUpdateColumn,
    bulkUpdateDraft,
    bulkUpdateError,
    data,
    selectedIdentities,
    selectedRows.length,
    tab.schema,
    tab.table,
  ]);

  const deleteSelected = useCallback(async () => {
    if (!data?.editable || selectedRows.length === 0) return false;
    if (selectedRows.length > MAX_BULK_MUTATION_ROWS) {
      setMutationError(
        `Bulk changes are limited to ${MAX_BULK_MUTATION_ROWS} rows at a time.`,
      );
      return false;
    }
    if (selectedIdentities.length !== selectedRows.length) {
      setMutationError("Some selected rows cannot be deleted safely. Refresh and try again.");
      return false;
    }
    setMutationBusy(true);
    setMutationError(null);
    setMutationMessage(null);
    try {
      const result = await databaseApi.deleteTableRows({
        schema: tab.schema,
        table: tab.table,
        rows: selectedIdentities,
      });
      setSelectedRowsByKey(new Map());
      setMutationMessage(`${result.affectedRows} rows deleted.`);
      setRevision((current) => current + 1);
      return true;
    } catch (caughtError) {
      setMutationError(errorMessage(caughtError));
      return false;
    } finally {
      setMutationBusy(false);
    }
  }, [data, selectedIdentities, selectedRows.length, tab.schema, tab.table]);

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
    draftErrors,
    insertDraft,
    insertErrors,
    bulkUpdateDraft,
    bulkUpdateColumn,
    bulkUpdateError,
    mutationBusy,
    mutationError,
    mutationMessage,
    changedCellCount: changedCells.length,
    selectedRows,
    selectedCount: selectedRows.length,
    selectedOnPage,
    allPageRowsSelected,
    somePageRowsSelected,
    hasDraft: draft !== null || insertDraft !== null || bulkUpdateDraft !== null,
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
    discardBulkUpdate,
    updateValue,
    updateInsertValue,
    updateBulkValue,
    setBulkUpdateColumn,
    toggleRowSelection,
    togglePageSelection,
    clearSelection,
    startBulkUpdate,
    dismissMutationMessage: () => setMutationMessage(null),
    dismissMutationError: () => setMutationError(null),
    rowSelectionKey: (rowIndex: number) => currentPageRows[rowIndex]?.key,
    isRowSelected: (rowIndex: number) => {
      const key = currentPageRows[rowIndex]?.key;
      return key ? selectedRowsByKey.has(key) : false;
    },
    saveInsert,
    saveChanges,
    saveBulkUpdate,
    deleteRow,
    deleteSelected,
  };
}

export type TableDataController = ReturnType<typeof useTableData>;
