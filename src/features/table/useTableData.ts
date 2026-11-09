import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDatabaseSession } from "../connections/SessionContext";
import { errorMessage } from "../../shared/lib/database-api";
import type {
  TableChangesResult,
  TableDataPage,
  TableSort,
  TableFilter,
} from "../../shared/types/database";
import type { TableTab } from "../query/query-types";
import { useWorkSafety } from "../../shared/safety/WorkSafety";
import { readTableView, tableViewKey } from "./table-view-state";
import { writeLocalJson } from "../../shared/lib/local-storage";
import { useTableChanges } from "./useTableChanges";
import { useTableSelection } from "./useTableSelection";
import {
  MAX_TABLE_CHANGES,
  tableRowKey,
  type RowChange,
} from "./table-change-set";

export const MAX_BULK_MUTATION_ROWS = MAX_TABLE_CHANGES;

export function useTableData(tab: TableTab) {
  const { session, api } = useDatabaseSession();
  const safety = useWorkSafety();
  const requestId = useRef(0);
  const viewKey = tableViewKey(session.profileId, tab.schema, tab.table);
  const [initial] = useState(() => readTableView(viewKey));
  const [data, setData] = useState<TableDataPage | null>(null);
  const [page, setPageState] = useState(tab.initialFilters ? 0 : initial.page);
  const [pageSize, setPageSizeState] = useState(initial.pageSize);
  const [filter, setFilter] = useState(
    tab.initialFilters ? "" : initial.filter,
  );
  const [filterDraft, setFilterDraft] = useState(
    tab.initialFilters ? "" : initial.filter,
  );
  const [conditions, setConditions] = useState<TableFilter[]>(
    tab.initialFilters ?? initial.conditions,
  );
  const [widths, setWidths] = useState(initial.widths);
  const [pinnedColumn, setPinnedColumn] = useState(initial.pinnedColumn);
  const [density, setDensity] = useState(initial.density);
  const [sort, setSort] = useState<TableSort | null>(initial.sort);
  // Search token: the column the row search is scoped to (applied / draft).
  const [searchColumn, setSearchColumn] = useState<string | null>(
    tab.initialFilters ? null : initial.searchColumn,
  );
  const [searchColumnDraft, setSearchColumnDraft] = useState<string | null>(
    tab.initialFilters ? null : initial.searchColumn,
  );
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(
    initial.hiddenColumns,
  );
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selection = useTableSelection(data);
  useEffect(() => {
    // Related tabs do not replace the normal table's remembered search.
    if (!tab.initialFilters)
      writeLocalJson(viewKey, {
        page,
        pageSize,
        filter,
        sort,
        conditions,
        widths,
        pinnedColumn,
        density,
        searchColumn,
        hiddenColumns,
      });
  }, [
    viewKey,
    page,
    pageSize,
    filter,
    sort,
    conditions,
    widths,
    pinnedColumn,
    density,
    searchColumn,
    hiddenColumns,
    tab.initialFilters,
  ]);
  // What the server sees: a scoped search is a case-insensitive "contains"
  // condition on one column; otherwise the search spans all columns.
  const scoped = Boolean(searchColumn && filter);
  const queryFilter = scoped ? null : filter || null;
  const queryConditions = useMemo<TableFilter[]>(
    () =>
      searchColumn && filter
        ? [
            ...conditions,
            { column: searchColumn, operator: "contains", value: filter },
          ]
        : conditions,
    [conditions, searchColumn, filter],
  );
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.loadTablePage({
        schema: tab.schema,
        table: tab.table,
        page,
        pageSize,
        filter: queryFilter,
        conditions: queryConditions,
        sort,
      });
      if (id === requestId.current) setData(result);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [
    api,
    tab.schema,
    tab.table,
    page,
    pageSize,
    queryFilter,
    sort,
    queryConditions,
  ]);
  useEffect(() => {
    void load();
    const generation = requestId.current;
    return () => {
      requestId.current = generation + 1;
    };
  }, [load, revision]);

  const saved = (result: TableChangesResult, submitted: RowChange[]) => {
    // Show confirmed values immediately. A later reload failure cannot retry the write.
    setData((current) => {
      if (!current) return current;
      const byKey = new Map(
        submitted.map((row) => [
          row.key,
          result.rows.find((item) => item.id === row.id),
        ]),
      );
      return {
        ...current,
        rows: [
          ...submitted
            .filter((row) => !row.original)
            .flatMap((row) => {
              const inserted = byKey.get(row.key)?.row;
              return inserted ? [inserted] : [];
            }),
          ...current.rows.flatMap((row, index) => {
            const updated = byKey.get(
              tableRowKey(
                current.columns,
                row,
                String(current.page) + ":" + index,
              ),
            );
            return updated ? (updated.row ? [updated.row] : []) : [row];
          }),
        ],
      };
    });
    selection.clearSelection();
    setRevision((value) => value + 1);
  };
  const changes = useTableChanges(tab, data, saved);
  const navigate = (
    action: () => void = () => undefined,
    clearSelection = true,
  ) => {
    if (busy || changes.busy) return;
    safety.request(
      () => {
        changes.clear();
        if (clearSelection) selection.clearSelection();
        setData(null);
        action();
        setRevision((value) => value + 1);
      },
      { sessionId: session.id, tabId: tab.id },
    );
  };
  return {
    data,
    page,
    pageSize,
    filter,
    filterDraft,
    sort,
    conditions,
    widths,
    setWidths,
    pinnedColumn,
    setPinnedColumn,
    density,
    setDensity,
    /** The column the applied search is scoped to, if any. */
    searchColumn,
    /** The token shown in the search field before Return applies it. */
    searchColumnDraft,
    setSearchColumnDraft,
    /** Effective server query (scoped search folded into the conditions). */
    query: { filter: queryFilter, conditions: queryConditions },
    hiddenColumns,
    setColumnVisible: (name: string, visible: boolean) =>
      setHiddenColumns((current) =>
        visible
          ? current.filter((column) => column !== name)
          : current.includes(name)
            ? current
            : [...current, name],
      ),
    showAllColumns: () => setHiddenColumns([]),
    applyConditions: (next: TableFilter[]) =>
      navigate(() => {
        setConditions(next);
        setPageState(0);
      }),
    busy,
    error,
    changes,
    ...selection,
    setFilterDraft,
    applyFilter: () =>
      navigate(() => {
        setPageState(0);
        setFilter(filterDraft.trim());
        setSearchColumn(searchColumnDraft);
      }),
    clearFilter: () =>
      navigate(() => {
        setFilterDraft("");
        setFilter("");
        setSearchColumn(null);
        setSearchColumnDraft(null);
        setConditions([]);
        setPageState(0);
      }),
    resetView: () =>
      navigate(() => {
        setFilterDraft("");
        setFilter("");
        setSearchColumn(null);
        setSearchColumnDraft(null);
        setConditions([]);
        setSort(null);
        setPageState(0);
      }),
    setPage: (next: number) =>
      navigate(() => setPageState(Math.max(0, next)), false),
    setPageSize: (next: number) =>
      navigate(() => {
        setPageSizeState(next);
        setPageState(0);
      }),
    toggleSort: (column: string) =>
      navigate(() => {
        setSort((current) =>
          !current || current.column !== column
            ? { column, direction: "asc" }
            : current.direction === "asc"
              ? { column, direction: "desc" }
              : null,
        );
        setPageState(0);
      }),
    refresh: () => navigate(),
  };
}
export type TableDataController = ReturnType<typeof useTableData>;
