import { useCallback, useEffect, useRef, useState } from "react";
import {
  errorMessage,
  isQueryExecutionError,
} from "../../shared/lib/database-api";
import { databaseObjectKey } from "../../shared/lib/database-object";
import type {
  ColumnInfo,
  DatabaseObject,
  QueryExecutionError,
} from "../../shared/types/database";
import type { QueryHistoryStatus } from "./query-types";
import { useQueryHistory } from "./useQueryHistory";
import type { useQueryPreferences } from "./useQueryPreferences";
import { useDatabaseSession } from "../connections/SessionContext";
import { useWorkspaceTabs } from "./useWorkspaceTabs";

export type QuerySubmission = {
  sql: string;
  offset: number;
  wholeDocument: boolean;
};

const createId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const toAbsoluteErrorPosition = (
  error: QueryExecutionError,
  submission: QuerySubmission,
) => {
  if (error.position === null) return error;
  const relativeCharacters = Math.max(0, error.position - 1);
  const relativeOffset = Array.from(submission.sql)
    .slice(0, relativeCharacters)
    .join("").length;
  return { ...error, position: submission.offset + relativeOffset };
};

const historyStatus = (error: QueryExecutionError): QueryHistoryStatus => {
  if (error.kind === "cancelled") return "cancelled";
  if (error.kind === "timeout") return "timeout";
  return "error";
};

export function useWorkspace(
  database: string,
  queryPreferences: ReturnType<typeof useQueryPreferences>,
) {
  const { session, api: databaseApi } = useDatabaseSession();
  const queryInFlight = useRef(false);
  const expandedObject = useRef<string | null>(null);
  const columnRequest = useRef(0);
  const columnCache = useRef(new Map<string, ColumnInfo[]>());
  const tabs = useWorkspaceTabs(session.profileId);
  const clearResults = tabs.clearResults;
  useEffect(() => {
    clearResults();
  }, [databaseApi, clearResults]);
  const history = useQueryHistory(
    session.profileId,
    queryPreferences.preferences.historyEnabled,
  );
  const [objects, setObjects] = useState<DatabaseObject[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selected, setSelected] = useState<DatabaseObject | null>(null);
  const [expandedObjectKey, setExpandedObjectKey] = useState<string | null>(
    null,
  );
  const [filter, setFilter] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [columnsBusy, setColumnsBusy] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [runningTabId, setRunningTabId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationError, setCancellationError] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const refreshObjects = useCallback(async () => {
    columnCache.current.clear();
    columnRequest.current += 1;
    expandedObject.current = null;
    setExpandedObjectKey(null);
    setColumns([]);
    setColumnsBusy(false);
    setExplorerBusy(true);
    setExplorerError(null);
    try {
      setObjects(await databaseApi.listObjects());
    } catch (error) {
      setExplorerError(errorMessage(error));
    } finally {
      setExplorerBusy(false);
    }
  }, [databaseApi]);

  useEffect(() => {
    void refreshObjects();
  }, [refreshObjects]);

  const expandObject = useCallback(
    async (object: DatabaseObject) => {
      const key = databaseObjectKey(object);
      const request = ++columnRequest.current;
      expandedObject.current = key;
      setExpandedObjectKey(key);
      setColumnsError(null);

      if (columnCache.current.has(key)) {
        setColumns(columnCache.current.get(key) ?? []);
        setColumnsBusy(false);
        return;
      }

      setColumns([]);
      setColumnsBusy(true);
      try {
        const nextColumns = await databaseApi.listColumns(
          object.schema,
          object.name,
        );
        columnCache.current.set(key, nextColumns);
        if (
          request === columnRequest.current &&
          expandedObject.current === key
        ) {
          setColumns(nextColumns);
        }
      } catch (error) {
        if (
          request === columnRequest.current &&
          expandedObject.current === key
        ) {
          setColumnsError(errorMessage(error));
        }
      } finally {
        if (request === columnRequest.current) setColumnsBusy(false);
      }
    },
    [databaseApi],
  );

  const selectObject = useCallback(
    (object: DatabaseObject) => {
      setSelected(object);
      tabs.openTable(object);
      if (expandedObject.current !== databaseObjectKey(object)) {
        void expandObject(object);
      }
    },
    [expandObject, tabs],
  );

  const toggleObject = useCallback(
    (object: DatabaseObject) => {
      const key = databaseObjectKey(object);
      if (expandedObject.current === key) {
        columnRequest.current += 1;
        expandedObject.current = null;
        setExpandedObjectKey(null);
        setColumns([]);
        setColumnsError(null);
        setColumnsBusy(false);
        return;
      }
      void expandObject(object);
    },
    [expandObject],
  );

  const runQuery = useCallback(
    async (submission?: QuerySubmission) => {
      if (queryInFlight.current) return;
      const tab = tabs.activeTab;
      if (tab.kind !== "query") return;
      const querySubmission = submission ?? {
        sql: tab.sql,
        offset: 0,
        wholeDocument: true,
      };
      queryInFlight.current = true;
      setRunningTabId(tab.id);
      setCancellationError(null);
      setActiveResultIndex(0);
      const started = performance.now();

      try {
        const result = await databaseApi.runQuery(querySubmission.sql, {
          maxRows: queryPreferences.preferences.maxRows,
          timeoutMs: queryPreferences.preferences.timeoutMs,
        });
        tabs.setExecution(
          tab.id,
          result,
          null,
          querySubmission.wholeDocument ? tab.sql : undefined,
        );
        history.addEntry({
          id: createId(),
          title: tab.title,
          sql: querySubmission.sql,
          database,
          executedAt: new Date().toISOString(),
          durationMs: result.durationMs,
          rowCount: result.resultSets.reduce(
            (total, set) => total + set.rows.length,
            0,
          ),
          status: "success",
        });
      } catch (caughtError) {
        const error = isQueryExecutionError(caughtError)
          ? toAbsoluteErrorPosition(caughtError, querySubmission)
          : {
              kind: "database" as const,
              message: errorMessage(caughtError),
              detail: null,
              hint: null,
              code: null,
              position: null,
            };
        tabs.setExecution(
          tab.id,
          null,
          error,
          querySubmission.wholeDocument ? tab.sql : undefined,
        );
        history.addEntry({
          id: createId(),
          title: tab.title,
          sql: querySubmission.sql,
          database,
          executedAt: new Date().toISOString(),
          durationMs: Math.round(performance.now() - started),
          rowCount: 0,
          status: historyStatus(error),
        });
      } finally {
        queryInFlight.current = false;
        setRunningTabId(null);
        setCancelling(false);
      }
    },
    [databaseApi, database, history, queryPreferences.preferences, tabs],
  );

  const cancelQuery = useCallback(async () => {
    if (!queryInFlight.current || cancelling) return;
    setCancelling(true);
    try {
      const requested = await databaseApi.cancelQuery();
      if (!requested)
        setCancellationError(
          "No cancellable operation was found. Wait for the final outcome before retrying.",
        );
    } catch (error) {
      setCancellationError(errorMessage(error));
      setCancelling(false);
    }
  }, [databaseApi, cancelling]);

  const copyQuery = useCallback(async () => {
    if (tabs.activeTab.kind !== "query") return;
    await navigator.clipboard.writeText(tabs.activeTab.sql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [tabs.activeTab]);

  return {
    objects,
    columns,
    selected,
    expandedObjectKey,
    filter,
    activeResultIndex,
    explorerError,
    explorerBusy,
    columnsBusy,
    columnsError,
    runningTabId,
    cancelling,
    copied,
    tabs,
    history,
    queryPreferences,
    setFilter,
    setActiveResultIndex,
    refreshObjects,
    selectObject,
    toggleObject,
    runQuery,
    cancelQuery,
    cancellationError,
    copyQuery,
  };
}
