import { useCallback, useEffect, useMemo, useState } from "react";
import { databaseObjectKey } from "../../shared/lib/database-object";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";
import type {
  DatabaseObject,
  QueryExecutionError,
  QueryResult,
} from "../../shared/types/database";
import type { QueryTab, TableTab, WorkspaceTab } from "./query-types";

const STORAGE_KEY = "opaline.query-session.v1";
const starterQuery = `select
  current_database() as database,
  current_user as connected_as,
  now() as connected_at;`;

type StoredQueryTab = Pick<QueryTab, "id" | "title" | "sql" | "lastExecutedSql">;

type StoredQuerySession = {
  activeTabId: string;
  tabs: StoredQueryTab[];
};

type WorkspaceSession = {
  activeTabId: string;
  tabs: WorkspaceTab[];
};

const createId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createQueryTab = (title: string, sql = ""): QueryTab => ({
  kind: "query",
  id: createId(),
  title,
  sql,
  lastExecutedSql: null,
  result: null,
  error: null,
});

const createTableTab = (object: DatabaseObject): TableTab => ({
  kind: "table",
  id: `table:${databaseObjectKey(object)}`,
  title: object.name,
  schema: object.schema,
  table: object.name,
  objectType: object.objectType,
});

const initialSession = (): WorkspaceSession => {
  const tab = createQueryTab("Query 1", starterQuery);
  return { activeTabId: tab.id, tabs: [tab] };
};

const loadSession = (): WorkspaceSession => {
  const value = readLocalJson<unknown>(STORAGE_KEY, null);
  if (!value || typeof value !== "object") return initialSession();
  const stored = value as Partial<StoredQuerySession>;
  if (!Array.isArray(stored.tabs) || stored.tabs.length === 0) {
    return initialSession();
  }

  const tabs = stored.tabs
    .filter(
      (tab) =>
        tab &&
        typeof tab.id === "string" &&
        typeof tab.title === "string" &&
        typeof tab.sql === "string",
    )
    .map<QueryTab>((tab) => ({
      kind: "query",
      id: tab.id,
      title: tab.title,
      sql: tab.sql,
      lastExecutedSql:
        typeof tab.lastExecutedSql === "string" ? tab.lastExecutedSql : null,
      result: null,
      error: null,
    }));

  if (tabs.length === 0) return initialSession();
  const activeTabId =
    typeof stored.activeTabId === "string" &&
    tabs.some((tab) => tab.id === stored.activeTabId)
      ? stored.activeTabId
      : tabs[0].id;
  return { tabs, activeTabId };
};

export function useWorkspaceTabs() {
  const [session] = useState(loadSession);
  const [tabs, setTabs] = useState<WorkspaceTab[]>(session.tabs);
  const [activeTabId, setActiveTabId] = useState(session.activeTabId);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]!,
    [activeTabId, tabs],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const queryTabs = tabs.filter((tab): tab is QueryTab => tab.kind === "query");
      const activeQueryId = queryTabs.some((tab) => tab.id === activeTabId)
        ? activeTabId
        : queryTabs[0]?.id ?? "";
      writeLocalJson(STORAGE_KEY, {
        activeTabId: activeQueryId,
        tabs: queryTabs.map(({ id, title, sql, lastExecutedSql }) => ({
          id,
          title,
          sql,
          lastExecutedSql,
        })),
      } satisfies StoredQuerySession);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeTabId, tabs]);

  const updateQueryTab = useCallback(
    (id: string, update: (tab: QueryTab) => QueryTab) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === id && tab.kind === "query" ? update(tab) : tab,
        ),
      );
    },
    [],
  );

  const updateSql = useCallback(
    (id: string, sql: string) => {
      updateQueryTab(id, (tab) => ({ ...tab, sql, error: null }));
    },
    [updateQueryTab],
  );

  const addQueryTab = useCallback(
    (sql = "", preferredTitle?: string) => {
      const queryCount = tabs.filter((tab) => tab.kind === "query").length;
      const tab = createQueryTab(preferredTitle ?? `Query ${queryCount + 1}`, sql);
      setTabs((current) => [...current, tab]);
      setActiveTabId(tab.id);
      return tab.id;
    },
    [tabs],
  );

  const openTable = useCallback((object: DatabaseObject) => {
    const tab = createTableTab(object);
    setTabs((current) =>
      current.some((candidate) => candidate.id === tab.id)
        ? current
        : [...current, tab],
    );
    setActiveTabId(tab.id);
    return tab.id;
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      if (tabs.length === 1) return;
      const index = tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;
      const nextTabs = tabs.filter((tab) => tab.id !== id);
      setTabs(nextTabs);
      if (activeTabId === id) {
        setActiveTabId(nextTabs[Math.min(index, nextTabs.length - 1)].id);
      }
    },
    [activeTabId, tabs],
  );

  const renameQueryTab = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      if (trimmed) updateQueryTab(id, (tab) => ({ ...tab, title: trimmed }));
    },
    [updateQueryTab],
  );

  const setExecution = useCallback(
    (
      id: string,
      result: QueryResult | null,
      error: QueryExecutionError | null,
      lastExecutedSql?: string,
    ) => {
      updateQueryTab(id, (tab) => ({
        ...tab,
        lastExecutedSql: lastExecutedSql ?? tab.lastExecutedSql,
        result,
        error,
      }));
    },
    [updateQueryTab],
  );

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    updateSql,
    addQueryTab,
    openTable,
    closeTab,
    renameQueryTab,
    setExecution,
  };
}
