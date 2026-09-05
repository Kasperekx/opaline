import { useEffect, useState } from "react";
import {
  markUnreadableStorage,
  readLocalJson,
  writeLocalJson,
} from "../../shared/lib/local-storage";
export type SavedQuery = {
  id: string;
  title: string;
  sql: string;
  updatedAt: string;
};
const keyFor = (id: string) => `opaline.saved-queries.v1.${id}`;
const changed = "opaline-saved-queries-changed";
export function loadSavedQueries(id: string): SavedQuery[] {
  const key = keyFor(id);
  const value = readLocalJson<unknown>(key, []);
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        typeof item.title !== "string" ||
        typeof item.sql !== "string" ||
        typeof item.updatedAt !== "string",
    )
  ) {
    markUnreadableStorage(key);
    return [];
  }
  return value;
}
export function writeSavedQueries(workspaceId: string, entries: SavedQuery[]) {
  if (
    entries.length > 200 ||
    new TextEncoder().encode(JSON.stringify(entries)).byteLength >
      2 * 1024 * 1024
  )
    throw new Error(
      "Library limit: 200 queries / 2 MiB. Remove an entry or save SQL to a file.",
    );
  if (!writeLocalJson(keyFor(workspaceId), entries))
    throw new Error(
      "Library could not be saved. Your editor is unchanged; retry the local save.",
    );
  window.dispatchEvent(new Event(changed));
}
export function useSavedQueries(workspaceId: string) {
  const [entries, setEntries] = useState(() => loadSavedQueries(workspaceId));
  useEffect(() => {
    const refresh = () => setEntries(loadSavedQueries(workspaceId));
    refresh();
    window.addEventListener(changed, refresh);
    return () => window.removeEventListener(changed, refresh);
  }, [workspaceId]);
  return {
    entries,
    save: (title: string, sql: string, id?: string) => {
      if (!title.trim() || title.trim().length > 120)
        throw new Error("Name must contain 1–120 characters.");
      const current = loadSavedQueries(workspaceId);
      writeSavedQueries(workspaceId, [
        {
          id: id ?? crypto.randomUUID(),
          title: title.trim(),
          sql,
          updatedAt: new Date().toISOString(),
        },
        ...current.filter((item) => item.id !== id),
      ]);
    },
    remove: (id: string) =>
      writeSavedQueries(
        workspaceId,
        loadSavedQueries(workspaceId).filter((item) => item.id !== id),
      ),
  };
}
