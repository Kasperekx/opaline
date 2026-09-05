import { useEffect, useRef, useState, type RefObject } from "react";
import { errorMessage } from "../../shared/lib/database-api";
import { useWorkRisk } from "../../shared/safety/WorkSafety";
import { useOperationLock } from "../../shared/hooks/useOperationLock";
import { sqlDocumentApi } from "./sql-document-api";
import type { useWorkspaceTabs } from "./useWorkspaceTabs";
import type { SqlEditorHandle } from "./SqlEditor";
import type { QueryTab } from "./query-types";

// Effect replay in StrictMode must not revoke an open native file capability.
const fileOwners = new Map<string, number>();
function retainFile(id: string) {
  fileOwners.set(id, (fileOwners.get(id) ?? 0) + 1);
  return () => {
    fileOwners.set(id, (fileOwners.get(id) ?? 1) - 1);
    queueMicrotask(() => {
      if (fileOwners.get(id) !== 0) return;
      fileOwners.delete(id);
      void sqlDocumentApi.release(id).catch(() => undefined);
    });
  };
}

export function FileWorkRisk({
  tab,
  sessionId,
}: {
  tab: QueryTab;
  sessionId: string;
}) {
  useWorkRisk({
    sessionId,
    tabId: tab.id,
    label: `${tab.title}: unsaved file`,
    dirty: Boolean(tab.file && tab.sql !== tab.file.savedSql),
  });
  const id = tab.file?.id;
  useEffect(() => (id ? retainFile(id) : undefined), [id]);
  return null;
}

export function useSqlDocuments(
  tabs: ReturnType<typeof useWorkspaceTabs>,
  sessionId: string,
  editor: RefObject<SqlEditorHandle | null>,
) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const lock = useOperationLock();
  const latest = useRef(tabs.activeTab);
  latest.current = tabs.activeTab;
  const latestTabs = useRef(tabs);
  latestTabs.current = tabs;
  useWorkRisk({
    sessionId,
    tabId: busyId ?? undefined,
    label: "SQL document operation",
    busy: busyId !== null,
  });
  const operate = (action: () => Promise<void>) =>
    lock(async () => {
      setBusyId(tabs.activeTab.id);
      setMessage(null);
      try {
        await action();
      } catch (error) {
        setMessage(errorMessage(error));
      } finally {
        setBusyId(null);
      }
    });
  return {
    busy: busyId !== null,
    message,
    dismiss: () => setMessage(null),
    open: () =>
      operate(async () => {
        if (tabs.tabs.length >= 30)
          throw new Error("Close a tab before opening another file.");
        const document = await sqlDocumentApi.open();
        if (!document) return;
        if (latestTabs.current.tabs.length >= 30) {
          await sqlDocumentApi.release(document.id);
          throw new Error("Close a tab before opening another file.");
        }
        const id = latestTabs.current.addQueryTab(
          document.content,
          document.path.split(/[\\/]/).pop(),
        );
        tabs.updateQueryTab(id, (tab) => ({
          ...tab,
          file: {
            id: document.id,
            path: document.path,
            savedSql: document.content,
          },
        }));
      }),
    save: (saveAs = false) =>
      operate(async () => {
        const tab = tabs.activeTab;
        if (tab.kind !== "query") return;
        const document = await sqlDocumentApi.save(tab.sql, tab.file, saveAs);
        if (!document) return;
        tabs.updateQueryTab(tab.id, (current) => ({
          ...current,
          title: document.path.split(/[\\/]/).pop() ?? current.title,
          file: {
            id: document.id,
            path: document.path,
            savedSql: document.content,
          },
        }));
        setMessage(
          "SQL file saved. Changes made while saving remain marked as unsaved.",
        );
      }),
    format: () =>
      operate(async () => {
        const tab = tabs.activeTab;
        if (tab.kind !== "query") return;
        const formatted = await sqlDocumentApi.format(tab.sql);
        if (
          latest.current.id !== tab.id ||
          latest.current.kind !== "query" ||
          latest.current.sql !== tab.sql
        )
          throw new Error(
            "Editor changed while formatting. Run Format again on the current draft.",
          );
        editor.current?.replaceDocument(formatted);
      }),
  };
}
