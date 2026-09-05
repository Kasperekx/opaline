import { useCallback, useEffect, useRef, useState } from "react";
import type { TableTab } from "../query/query-types";
import type {
  TableChangesError,
  TableChangesResult,
  TableDataPage,
  TableDataRow,
} from "../../shared/types/database";
import { useDatabaseSession } from "../connections/SessionContext";
import { useWorkRisk } from "../../shared/safety/WorkSafety";
import {
  buildChanges,
  changeError,
  changeSetSummary,
  existingRowChange,
  duplicateRowChange,
  hasRowChanges,
  MAX_TABLE_CHANGES,
  newRowChange,
  tableRowKey,
  type ActiveCell,
  type RowChange,
} from "./table-change-set";
import type { InsertCellValue } from "./table-types";

export function useTableChanges(
  tab: TableTab,
  data: TableDataPage | null,
  onSaved: (result: TableChangesResult, submitted: RowChange[]) => void,
) {
  const { api, session } = useDatabaseSession();
  const [rows, setRows] = useState<RowChange[]>([]);
  const rowsRef = useRef(rows);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TableChangesError | null>(null);
  const [saved, setSaved] = useState(false);
  const [review, setReview] = useState<"preview" | "confirm" | null>(null);
  const confirmation = useRef<((confirmed: boolean) => void) | null>(null);
  const locked = useRef(false);
  const columns = data?.columns ?? [];
  const summary = changeSetSummary(columns, rows);
  const disabled = busy || review === "confirm" || error?.kind === "unknown";
  const replaceRows = useCallback((next: RowChange[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);
  useEffect(() => () => confirmation.current?.(false), []);
  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const clear = useCallback(() => {
    if (locked.current) return;
    replaceRows([]);
    setActiveCell(null);
    setError(null);
    setSaved(false);
  }, [replaceRows]);
  const commitCell = () => {
    setActiveCell(null);
    replaceRows(rowsRef.current.filter((row) => hasRowChanges(columns, row)));
  };
  const mutate = (next: RowChange[]) => {
    replaceRows(next);
    setError(null);
    setSaved(false);
  };
  const ensure = (key: string, original?: TableDataRow) => {
    const found = rowsRef.current.find((row) => row.key === key);
    if (found) return found;
    if (
      !original ||
      !data?.editable ||
      !original.rowVersion ||
      session.readOnly
    )
      return null;
    if (
      changeSetSummary(columns, rowsRef.current).rows.length >=
      MAX_TABLE_CHANGES
    ) {
      setError({
        kind: "rejected",
        message:
          "Save or discard the current 500 row changes before editing another row.",
        rowId: null,
      });
      return null;
    }
    return existingRowChange(columns, original);
  };
  const start = (key: string, column: number, original?: TableDataRow) => {
    const info = columns[column];
    if (
      disabled ||
      locked.current ||
      session.readOnly ||
      !info ||
      info.identity ||
      info.generated
    )
      return;
    const row = ensure(key, original);
    if (!row || row.deleted) return;
    if (!rowsRef.current.some((item) => item.key === key))
      replaceRows([...rowsRef.current, row]);
    setActiveCell({ key, column, before: row.values[column] });
    setSaved(false);
  };
  const update = (
    key: string,
    column: number,
    value: InsertCellValue,
    original?: TableDataRow,
  ) => {
    if (
      disabled ||
      locked.current ||
      session.readOnly ||
      columns[column]?.identity ||
      columns[column]?.generated
    )
      return;
    const row = ensure(key, original);
    if (!row || row.deleted) return;
    const values = [...row.values];
    values[column] = value;
    const exists = rowsRef.current.some((item) => item.key === key);
    mutate(
      exists
        ? rowsRef.current.map((item) =>
            item.key === key ? { ...row, values } : item,
          )
        : [...rowsRef.current, { ...row, values }],
    );
  };
  const cancelCell = () => {
    if (!activeCell) return;
    update(activeCell.key, activeCell.column, activeCell.before);
    setActiveCell(null);
  };
  const revertCell = (key: string, column: number) => {
    const row = rowsRef.current.find((item) => item.key === key);
    if (row?.original) update(key, column, row.original.values[column]);
  };
  const insert = (source?: InsertCellValue[]) => {
    if (!data?.insertable || session.readOnly || disabled || locked.current)
      return;
    if (
      changeSetSummary(columns, rowsRef.current).rows.length >=
      MAX_TABLE_CHANGES
    ) {
      setError({
        kind: "rejected",
        message:
          "Save or discard the current 500 row changes before adding another row.",
        rowId: null,
      });
      return;
    }
    const row = source
      ? duplicateRowChange(columns, source)
      : newRowChange(columns);
    mutate([...rowsRef.current, row]);
    const requiredKey = columns.findIndex(
      (info) =>
        info.primaryKey &&
        !info.identity &&
        !info.generated &&
        info.defaultValue === null,
    );
    const column =
      requiredKey >= 0
        ? requiredKey
        : columns.findIndex((info) => !info.identity && !info.generated);
    setActiveCell(
      column < 0 ? null : { key: row.key, column, before: row.values[column] },
    );
  };
  const remove = (key: string, original?: TableDataRow) => {
    if (disabled || session.readOnly || locked.current) return;
    const row = ensure(key, original);
    if (!row) return;
    mutate(
      row.original
        ? [
            ...rowsRef.current.filter((item) => item.key !== key),
            { ...row, deleted: !row.deleted },
          ]
        : rowsRef.current.filter((item) => item.key !== key),
    );
    setActiveCell(null);
  };
  const stageMany = (
    selected: TableDataRow[],
    column?: number,
    value?: string | null,
  ) => {
    if (disabled || !data?.editable || session.readOnly || locked.current)
      return false;
    const next = [...rowsRef.current];
    for (const original of selected) {
      if (!original.rowVersion) return false;
      const key = tableRowKey(columns, original);
      const index = next.findIndex((row) => row.key === key);
      const row =
        index < 0 ? existingRowChange(columns, original) : next[index];
      const updated = { ...row, values: [...row.values] };
      if (column === undefined) updated.deleted = true;
      else {
        if (
          columns[column]?.identity ||
          columns[column]?.generated ||
          columns[column]?.primaryKey ||
          updated.deleted
        )
          continue;
        updated.values[column] = value ?? null;
      }
      if (index < 0) next.push(updated);
      else next[index] = updated;
    }
    if (changeSetSummary(columns, next).rows.length > MAX_TABLE_CHANGES) {
      setError({
        kind: "rejected",
        message: "Save at most 500 changed rows at a time.",
        rowId: null,
      });
      return false;
    }
    mutate(next);
    setActiveCell(null);
    return true;
  };

  const save = async (): Promise<boolean> => {
    if (
      locked.current ||
      error?.kind === "unknown" ||
      session.readOnly ||
      !data
    )
      return false;
    let changes;
    try {
      changes = buildChanges(columns, rowsRef.current);
    } catch (caught) {
      setError({
        kind: "rejected",
        message: caught instanceof Error ? caught.message : "Invalid changes.",
        rowId: null,
      });
      return false;
    }
    if (!changes.length) {
      commitCell();
      return true;
    }
    locked.current = true;
    try {
      if (changes.some((change) => change.kind === "delete")) {
        setReview("confirm");
        const accepted = await new Promise<boolean>((resolve) => {
          confirmation.current = resolve;
        });
        confirmation.current = null;
        setReview(null);
        if (!accepted) return false;
      }
      setBusy(true);
      setError(null);
      setSaved(false);
      setActiveCell(null);
      const submitted = rowsRef.current.filter((row) =>
        hasRowChanges(columns, row),
      );
      const result = await api.applyTableChanges({
        schema: tab.schema,
        table: tab.table,
        changes,
      });
      if (
        !result ||
        !Array.isArray(result.rows) ||
        result.rows.length !== changes.length ||
        changes.some(
          (change) => !result.rows.some((row) => row.id === change.id),
        )
      ) {
        throw new Error("Invalid save acknowledgement");
      }
      replaceRows([]);
      setSaved(true);
      try {
        onSaved(result, submitted);
      } catch {
        setError({
          kind: "rejected",
          message:
            "Changes were saved, but the view could not be refreshed. Refresh the table; do not repeat the write.",
          rowId: null,
        });
      }
      return true;
    } catch (caught) {
      setError(changeError(caught));
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  useWorkRisk({
    sessionId: session.id,
    tabId: tab.id,
    label: `${session.name}: ${tab.schema}.${tab.table}`,
    dirty: summary.rows.length > 0,
    busy,
    save: error?.kind === "unknown" ? undefined : save,
    discard: clear,
    warning:
      error?.kind === "unknown"
        ? "Discarding this draft does not undo a possibly committed write. Verify the database first."
        : undefined,
  });
  return {
    rows,
    activeCell,
    summary,
    busy,
    error,
    saved,
    disabled,
    review,
    start,
    update,
    commitCell,
    cancelCell,
    revertCell,
    insert: () => insert(),
    duplicate: (key: string, original?: TableDataRow) => {
      const draft = rowsRef.current.find((row) => row.key === key);
      if (draft?.deleted) return;
      const values = draft?.values ?? original?.values;
      if (values) insert(values);
    },
    remove,
    stageMany,
    save,
    clear,
    showReview: () => setReview("preview"),
    closeReview: () => {
      confirmation.current?.(false);
      setReview(null);
    },
    confirmReview: () => confirmation.current?.(true),
  };
}
