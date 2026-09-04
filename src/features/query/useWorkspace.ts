import { useCallback, useEffect, useRef, useState } from "react";
import { databaseApi, errorMessage } from "../../shared/lib/database-api";
import {
  databaseObjectKey,
  qualifiedObjectName,
} from "../../shared/lib/database-object";
import type {
  ColumnInfo,
  DatabaseObject,
  QueryResult,
} from "../../shared/types/database";

const starterQuery = `select
  current_database() as database,
  current_user as connected_as,
  now() as connected_at;`;

export function useWorkspace() {
  const queryInFlight = useRef(false);
  const expandedObject = useRef<string | null>(null);
  const columnRequest = useRef(0);
  const columnCache = useRef(new Map<string, ColumnInfo[]>());
  const [objects, setObjects] = useState<DatabaseObject[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selected, setSelected] = useState<DatabaseObject | null>(null);
  const [expandedObjectKey, setExpandedObjectKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState(starterQuery);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [queryBusy, setQueryBusy] = useState(false);
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [columnsBusy, setColumnsBusy] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshObjects = useCallback(async () => {
    setExplorerBusy(true);
    setExplorerError(null);
    try {
      setObjects(await databaseApi.listObjects());
    } catch (error) {
      setExplorerError(errorMessage(error));
    } finally {
      setExplorerBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshObjects();
  }, [refreshObjects]);

  const expandObject = useCallback(async (object: DatabaseObject) => {
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
      const nextColumns = await databaseApi.listColumns(object.schema, object.name);
      columnCache.current.set(key, nextColumns);
      if (request === columnRequest.current && expandedObject.current === key) {
        setColumns(nextColumns);
      }
    } catch (error) {
      if (request === columnRequest.current && expandedObject.current === key) {
        setColumnsError(errorMessage(error));
      }
    } finally {
      if (request === columnRequest.current) setColumnsBusy(false);
    }
  }, []);

  const selectObject = useCallback(
    (object: DatabaseObject) => {
      setSelected(object);
      setQuery(`select *\nfrom ${qualifiedObjectName(object)}\nlimit 100;`);
      if (expandedObject.current !== databaseObjectKey(object)) {
        void expandObject(object);
      }
    },
    [expandObject],
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

  const runQuery = useCallback(async () => {
    if (queryInFlight.current) return;
    queryInFlight.current = true;
    setQueryBusy(true);
    setQueryError(null);
    try {
      setResult(await databaseApi.runQuery(query));
      setActiveResultIndex(0);
    } catch (error) {
      setResult(null);
      setQueryError(errorMessage(error));
    } finally {
      queryInFlight.current = false;
      setQueryBusy(false);
    }
  }, [query]);

  useEffect(() => {
    const runWithShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void runQuery();
      }
    };
    window.addEventListener("keydown", runWithShortcut);
    return () => window.removeEventListener("keydown", runWithShortcut);
  }, [runQuery]);

  const copyQuery = useCallback(async () => {
    await navigator.clipboard.writeText(query);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [query]);

  return {
    objects,
    columns,
    selected,
    expandedObjectKey,
    filter,
    query,
    result,
    activeResultIndex,
    queryError,
    explorerError,
    queryBusy,
    explorerBusy,
    columnsBusy,
    columnsError,
    copied,
    setFilter,
    setQuery,
    setActiveResultIndex,
    refreshObjects,
    selectObject,
    toggleObject,
    runQuery,
    copyQuery,
  };
}
