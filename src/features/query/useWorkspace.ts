import { useCallback, useEffect, useRef, useState } from "react";
import { databaseApi, errorMessage } from "../../shared/lib/database-api";
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
  const [objects, setObjects] = useState<DatabaseObject[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selected, setSelected] = useState<DatabaseObject | null>(null);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState(starterQuery);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [queryBusy, setQueryBusy] = useState(false);
  const [explorerBusy, setExplorerBusy] = useState(false);
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

  const selectObject = useCallback(async (object: DatabaseObject) => {
    setSelected(object);
    setColumns([]);
    setExplorerError(null);
    setQuery(`select *\nfrom "${object.schema}"."${object.name}"\nlimit 100;`);
    try {
      setColumns(await databaseApi.listColumns(object.schema, object.name));
    } catch (error) {
      setExplorerError(errorMessage(error));
    }
  }, []);

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
    filter,
    query,
    result,
    activeResultIndex,
    queryError,
    explorerError,
    queryBusy,
    explorerBusy,
    copied,
    setFilter,
    setQuery,
    setActiveResultIndex,
    refreshObjects,
    selectObject,
    runQuery,
    copyQuery,
  };
}
