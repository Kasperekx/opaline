import { useCallback, useEffect, useState } from "react";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";
import type { QueryPreferences } from "./query-types";

const STORAGE_KEY = "opaline.query-preferences.v2";

const defaults: QueryPreferences = {
  fontSize: "large",
  density: "comfortable",
  maxRows: 500,
  timeoutMs: 30_000,
};

const rowLimits = new Set([100, 500, 1_000, 5_000]);
const timeouts = new Set([10_000, 30_000, 60_000, 120_000]);

const loadPreferences = (): QueryPreferences => {
  const value = readLocalJson<unknown>(STORAGE_KEY, null);
  if (!value || typeof value !== "object") return defaults;
  const stored = value as Partial<QueryPreferences>;
  const maxRows = stored.maxRows;
  const timeoutMs = stored.timeoutMs;
  return {
    fontSize:
      stored.fontSize === "comfortable" || stored.fontSize === "large"
        ? stored.fontSize
        : defaults.fontSize,
    density:
      stored.density === "comfortable" || stored.density === "compact"
        ? stored.density
        : defaults.density,
    maxRows:
      typeof maxRows === "number" && rowLimits.has(maxRows)
        ? maxRows
        : defaults.maxRows,
    timeoutMs:
      typeof timeoutMs === "number" && timeouts.has(timeoutMs)
        ? timeoutMs
        : defaults.timeoutMs,
  };
};

export function useQueryPreferences() {
  const [preferences, setPreferences] = useState<QueryPreferences>(loadPreferences);

  useEffect(() => {
    document.documentElement.dataset.fontSize = preferences.fontSize;
    document.documentElement.dataset.density = preferences.density;
    writeLocalJson(STORAGE_KEY, preferences);
  }, [preferences]);

  const updatePreference = useCallback(
    <Key extends keyof QueryPreferences>(
      key: Key,
      value: QueryPreferences[Key],
    ) => setPreferences((current) => ({ ...current, [key]: value })),
    [],
  );

  return { preferences, updatePreference };
}
