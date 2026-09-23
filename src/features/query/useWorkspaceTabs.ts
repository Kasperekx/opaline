import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { databaseObjectKey } from "../../shared/lib/database-object";
import {
  markUnreadableStorage,
  readLocalJson,
  writeLocalJson,
} from "../../shared/lib/local-storage";
import type {
  DatabaseObject,
  QueryExecutionError,
  QueryResult,
} from "../../shared/types/database";
import type {
  DiagramTab,
  SchemaTab,
  QueryTab,
  TableTab,
  WorkspaceTab,
} from "./query-types";
import { validFilters } from "../table/table-view-state";
import type { OpenRelatedTable } from "../table/table-relations";

const storageKey = (profileId: string) =>
  "opaline.query-session.v2." + profileId;
const starterQuery = `select
  current_database() as database,
  current_user as connected_as,
  now() as connected_at;`;

type StoredQueryTab = Pick<
  QueryTab,
  "id" | "title" | "sql" | "lastExecutedSql"
>;

type StoredTab = StoredQueryTab | TableTab | DiagramTab | SchemaTab;
const serializeTab = (tab: WorkspaceTab): StoredTab =>
  tab.kind === "diagram"
    ? { kind: "diagram", id: tab.id, title: tab.title }
    : tab.kind === "schema"
      ? { ...tab, drop: false }
      : tab.kind === "table"
        ? tab
        : {
            id: tab.id,
            title: tab.title,
            sql: tab.sql,
            lastExecutedSql: tab.lastExecutedSql,
          };

type StoredQuerySession = {
  version?: 2 | 3;
  activeTabId: string;
  tabs: StoredTab[];
  closedTabs?: StoredQueryTab[];
};

type WorkspaceSession = {
  activeTabId: string;
  tabs: WorkspaceTab[];
  closedTabs?: StoredQueryTab[];
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

const loadSession = (key: string): WorkspaceSession => {
  const value = readLocalJson<unknown>(key, null);
  if (!value || typeof value !== "object") return initialSession();
  const stored = value as Partial<StoredQuerySession>;
  if (
    !Array.isArray(stored.tabs) ||
    (stored.version !== undefined &&
      stored.version !== 2 &&
      stored.version !== 3)
  ) {
    markUnreadableStorage(key);
    return initialSession();
  }

  const tabs = stored.tabs
    .filter(
      (tab) =>
        tab &&
        typeof tab.id === "string" &&
        typeof tab.title === "string" &&
        ("kind" in tab && tab.kind === "diagram"
          ? true
          : "kind" in tab && tab.kind === "schema"
            ? typeof tab.schema === "string" &&
              (tab.table === null || typeof tab.table === "string")
            : "kind" in tab && tab.kind === "table"
              ? typeof tab.schema === "string" &&
                typeof tab.table === "string" &&
                typeof tab.objectType === "string" &&
                (tab.initialFilters === undefined ||
                  validFilters(tab.initialFilters))
              : "sql" in tab && typeof tab.sql === "string"),
    )
    .map<WorkspaceTab>((storedTab) => {
      if ("kind" in storedTab && storedTab.kind === "schema")
        return { ...storedTab, drop: false };
      if ("kind" in storedTab && storedTab.kind === "diagram") {
        return { kind: "diagram", id: "database-diagram", title: "Diagram" };
      }
      if ("kind" in storedTab && storedTab.kind === "table") {
        const tab = createTableTab({
          schema: storedTab.schema,
          name: storedTab.table,
          objectType: storedTab.objectType,
          estimatedRows: 0,
        });
        return storedTab.initialFilters
          ? {
              ...tab,
              id: storedTab.id,
              title: `${tab.title} · related`,
              initialFilters: storedTab.initialFilters,
            }
          : tab;
      }
      const tab = storedTab as StoredQueryTab;
      return {
        kind: "query",
        id: tab.id,
        title: tab.title,
        sql: tab.sql,
        lastExecutedSql:
          typeof tab.lastExecutedSql === "string" ? tab.lastExecutedSql : null,
        result: null,
        error: null,
      };
    });

  if (tabs.length !== stored.tabs.length) markUnreadableStorage(key);
  const closedTabs = Array.isArray(stored.closedTabs)
    ? stored.closedTabs
        .filter(
          (tab) =>
            tab &&
            typeof tab.id === "string" &&
            typeof tab.title === "string" &&
            typeof tab.sql === "string",
        )
        .slice(0, 20)
    : [];
  if (tabs.length === 0) return { tabs: [], activeTabId: "", closedTabs };
  const activeTabId =
    typeof stored.activeTabId === "string" &&
    tabs.some((tab) => tab.id === stored.activeTabId)
      ? stored.activeTabId
      : tabs[0].id;
  return { tabs, activeTabId, closedTabs };
};

export function useWorkspaceTabs(profileId: string) {
  const key = storageKey(profileId);
  const [session] = useState(() => loadSession(key));
  const [tabs, setTabs] = useState<WorkspaceTab[]>(session.tabs);
  const latestTabs = useRef(tabs);
  latestTabs.current = tabs;
  const [activeTabId, setActiveTabId] = useState(session.activeTabId);
  const [closedTabs, setClosedTabs] = useState(session.closedTabs ?? []);
  const [notice, setNotice] = useState<string | null>(null);

  const activeTab = useMemo<WorkspaceTab | null>(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  );

  useEffect(() => {
    const persist = () => {
      return writeLocalJson(key, {
        version: 3,
        activeTabId,
        tabs: tabs.map(serializeTab),
        closedTabs,
      } satisfies StoredQuerySession);
    };
    persist();
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [activeTabId, tabs, closedTabs, key]);

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
      if (tabs.length >= 30) {
        setNotice(
          "30 open tabs per connection. Close a tab before opening another.",
        );
        return activeTabId;
      }
      const queryCount = tabs.filter((tab) => tab.kind === "query").length;
      const tab = createQueryTab(
        preferredTitle ?? `Query ${queryCount + 1}`,
        sql,
      );
      setTabs((current) => [...current, tab]);
      setActiveTabId(tab.id);
      return tab.id;
    },
    [tabs, activeTabId],
  );

  const openTable = useCallback(
    (object: DatabaseObject) => {
      const tab = createTableTab(object);
      if (tabs.length >= 30 && !tabs.some((item) => item.id === tab.id)) {
        setNotice(
          "30 open tabs per connection. Close a tab before opening another.",
        );
        return activeTabId;
      }
      setTabs((current) =>
        current.some((candidate) => candidate.id === tab.id)
          ? current
          : [...current, tab],
      );
      setActiveTabId(tab.id);
      return tab.id;
    },
    [tabs, activeTabId],
  );

  const openRelatedTable: OpenRelatedTable = (schema, table, filters) => {
    if (tabs.length >= 30) {
      setNotice(
        "30 open tabs per connection. Close a tab before opening another.",
      );
      return;
    }
    const tab: TableTab = {
      kind: "table",
      id: `related:${createId()}`,
      title: `${table} · related`,
      schema,
      table,
      objectType: "table",
      initialFilters: filters,
    };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  };
  const closeTab = useCallback(
    (id: string) => {
      const index = tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;
      const nextTabs = tabs.filter((tab) => tab.id !== id);
      const nextActiveId =
        activeTabId === id
          ? (nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? "")
          : activeTabId;
      const closing = tabs[index];
      const nextClosed =
        closing.kind === "query"
          ? [
              {
                id: closing.id,
                title: closing.title,
                sql: closing.sql,
                lastExecutedSql: closing.lastExecutedSql,
              },
              ...closedTabs,
            ].slice(0, 20)
          : closedTabs;
      if (
        !writeLocalJson(key, {
          version: 3,
          activeTabId: nextActiveId,
          tabs: nextTabs.map(serializeTab),
          closedTabs: nextClosed,
        })
      ) {
        // Retry must persist the still-open session, not the aborted close action.
        writeLocalJson(key, {
          version: 3,
          activeTabId,
          tabs: tabs.map(serializeTab),
          closedTabs,
        });
        setNotice("Could not save your session. The tab was kept open.");
        return;
      }
      setClosedTabs(nextClosed);
      setTabs(nextTabs);
      setActiveTabId(nextActiveId);
    },
    [activeTabId, tabs, closedTabs, key],
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
      setTabs((current) => {
        // Keep at most three result-bearing query tabs per connection. SQL survives eviction.
        let remaining = result ? 2 : 3;
        return current.map((tab) => {
          if (tab.kind !== "query") return tab;
          if (tab.id === id)
            return {
              ...tab,
              lastExecutedSql: lastExecutedSql ?? tab.lastExecutedSql,
              result,
              error,
            };
          if (tab.result && remaining-- <= 0) return { ...tab, result: null };
          return tab;
        });
      });
    },
    [],
  );

  return {
    clearResults: useCallback(
      () =>
        setTabs((current) =>
          current.map((tab) =>
            tab.kind === "query"
              ? {
                  ...tab,
                  result: null,
                  error: null,
                  executionMode: "atomic" as const,
                }
              : tab,
          ),
        ),
      [],
    ),
    notice,
    dismissNotice: () => setNotice(null),
    canRestore: closedTabs.length > 0,
    restoreClosedTab: () => {
      const tab = closedTabs[0];
      if (!tab || tabs.length >= 30) return;
      const id = createId();
      setTabs((current) => [
        ...current,
        { ...tab, id, kind: "query", result: null, error: null },
      ]);
      setClosedTabs((current) => current.slice(1));
      // Select the restored tab without executing SQL.
      setActiveTabId(id);
    },
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    updateSql,
    updateQueryTab,
    addQueryTab,
    openDiagram: (object?: { schema: string; name: string }) => {
      const id = "database-diagram";
      if (tabs.length >= 30 && !tabs.some((tab) => tab.id === id)) {
        setNotice(
          "30 open tabs per connection. Close a tab before opening another.",
        );
        return;
      }
      const tab: DiagramTab = {
        kind: "diagram",
        id,
        title: "Diagram",
        focus: object ? { ...object, request: Date.now() } : undefined,
      };
      setTabs((current) =>
        current.some((item) => item.id === id)
          ? current.map((item) => (item.id === id ? tab : item))
          : [...current, tab],
      );
      setActiveTabId(id);
    },
    openTable,
    openSchema: (
      schema = "public",
      table: string | null = null,
      drop = false,
    ) => {
      const id = `schema:${JSON.stringify([schema, table])}`;
      if (tabs.some((tab) => tab.id === id)) {
        setActiveTabId(id);
        return;
      }
      if (tabs.length >= 30) {
        setNotice("Close a tab before opening another structure editor.");
        return;
      }
      setTabs((current) => [
        ...current,
        {
          kind: "schema",
          id,
          title: table ? `${table} · structure` : "New table",
          schema,
          table,
          drop,
        },
      ]);
      setActiveTabId(id);
    },
    schemaApplied: (
      editorId: string,
      schema: string,
      original: string | null,
      table: string,
      dropped: boolean,
    ) => {
      const remaining = latestTabs.current.filter(
        (tab) =>
          tab.id !== editorId &&
          !(
            tab.kind === "table" &&
            tab.schema === schema &&
            tab.table === original
          ),
      );
      if (!dropped) {
        const next = createTableTab({
          schema,
          name: table,
          objectType: "table",
          estimatedRows: 0,
        });
        const withoutDuplicate = remaining.filter((tab) => tab.id !== next.id);
        setTabs([...withoutDuplicate, next]);
        setActiveTabId(next.id);
      } else {
        setTabs(remaining);
        setActiveTabId(remaining[remaining.length - 1]?.id ?? "");
      }
    },
    openRelatedTable,
    closeTab,
    renameQueryTab,
    setExecution,
  };
}
