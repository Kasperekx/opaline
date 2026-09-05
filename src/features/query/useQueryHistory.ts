import { useCallback, useState } from "react";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";
import type { QueryHistoryEntry } from "./query-types";

const storageKey = (profileId: string) =>
  "opaline.query-history.v2." + profileId;
const MAX_HISTORY_ENTRIES = 100;
const statuses = new Set(["success", "error", "cancelled", "timeout"]);

const isHistoryEntry = (value: unknown): value is QueryHistoryEntry => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<QueryHistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.sql === "string" &&
    typeof entry.database === "string" &&
    typeof entry.executedAt === "string" &&
    !Number.isNaN(Date.parse(entry.executedAt)) &&
    typeof entry.durationMs === "number" &&
    typeof entry.rowCount === "number" &&
    typeof entry.status === "string" &&
    statuses.has(entry.status)
  );
};

const loadHistory = (key: string) => {
  const stored = readLocalJson<unknown>(key, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
};

export function useQueryHistory(profileId: string, enabled = true) {
  const key = storageKey(profileId);
  const [entries, setEntries] = useState<QueryHistoryEntry[]>(() =>
    loadHistory(key),
  );

  const addEntry = useCallback(
    (entry: QueryHistoryEntry) => {
      if (!enabled) return;
      setEntries((current) => {
        const next = [entry, ...current].slice(0, MAX_HISTORY_ENTRIES);
        writeLocalJson(key, next);
        return next;
      });
    },
    [key, enabled],
  );

  const clearHistory = useCallback(() => {
    setEntries([]);
    writeLocalJson(key, []);
  }, [key]);

  return { entries, addEntry, clearHistory };
}
