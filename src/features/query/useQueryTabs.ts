import { useCallback, useEffect, useMemo, useState } from "react";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";
import type { QueryExecutionError, QueryResult } from "../../shared/types/database";
import type { QueryTab } from "./query-types";

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

type QuerySession = {
  activeTabId: string;
  tabs: QueryTab[];
};

const createId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createTab = (title: string, sql = ""): QueryTab => ({
  id: createId(),
  title,
  sql,
  lastExecutedSql: null,
  result: null,
  error: null,
});

const initialSession = (): QuerySession => {
  const tab = createTab("Query 1", starterQuery);
  return { activeTabId: tab.id, tabs: [tab] };
};

const loadSession = (): QuerySession => {
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
      ...tab,
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
  return {
    tabs,
    activeTabId,
  };
};

export function useQueryTabs() {
  const [session] = useState(loadSession);
  const [tabs, setTabs] = useState<QueryTab[]>(session.tabs);
  const [activeTabId, setActiveTabId] = useState(session.activeTabId);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]!,
    [activeTabId, tabs],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeLocalJson(STORAGE_KEY, {
        activeTabId,
        tabs: tabs.map(({ id, title, sql, lastExecutedSql }) => ({
          id,
          title,
          sql,
          lastExecutedSql,
        })),
      } satisfies StoredQuerySession);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeTabId, tabs]);

  const updateTab = useCallback(
    (id: string, update: (tab: QueryTab) => QueryTab) => {
      setTabs((current) => current.map((tab) => (tab.id === id ? update(tab) : tab)));
    },
    [],
  );

  const updateSql = useCallback(
    (id: string, sql: string) => {
      updateTab(id, (tab) => ({ ...tab, sql, error: null }));
    },
    [updateTab],
  );

  const addTab = useCallback((sql = "", preferredTitle?: string) => {
    const tab = createTab(preferredTitle ?? `Query ${tabs.length + 1}`, sql);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    return tab.id;
  }, [tabs.length]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((current) => {
        if (current.length === 1) return current;
        const index = current.findIndex((tab) => tab.id === id);
        if (index < 0) return current;
        const nextTabs = current.filter((tab) => tab.id !== id);
        if (activeTabId === id) {
          setActiveTabId(nextTabs[Math.min(index, nextTabs.length - 1)].id);
        }
        return nextTabs;
      });
    },
    [activeTabId],
  );

  const renameTab = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      if (trimmed) updateTab(id, (tab) => ({ ...tab, title: trimmed }));
    },
    [updateTab],
  );

  const setExecution = useCallback(
    (
      id: string,
      result: QueryResult | null,
      error: QueryExecutionError | null,
      lastExecutedSql?: string,
    ) => {
      updateTab(id, (tab) => ({
        ...tab,
        lastExecutedSql: lastExecutedSql ?? tab.lastExecutedSql,
        result,
        error,
      }));
    },
    [updateTab],
  );

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    updateSql,
    addTab,
    closeTab,
    renameTab,
    setExecution,
  };
}
