import { useCallback, useState } from "react";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";
import type { QueryHistoryEntry } from "./query-types";

const STORAGE_KEY = "opaline.query-history.v1";
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

const loadHistory = () => {
  const stored = readLocalJson<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
};

export function useQueryHistory() {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>(loadHistory);

  const addEntry = useCallback((entry: QueryHistoryEntry) => {
    setEntries((current) => {
      const next = [entry, ...current].slice(0, MAX_HISTORY_ENTRIES);
      writeLocalJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setEntries([]);
    writeLocalJson(STORAGE_KEY, []);
  }, []);

  return { entries, addEntry, clearHistory };
}
