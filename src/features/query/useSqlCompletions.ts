import { useCallback, useEffect, useMemo, useState } from "react";
import { useDatabaseSession } from "../connections/SessionContext";
import { errorMessage } from "../../shared/lib/database-api";
import type { DatabaseObject } from "../../shared/types/database";

type Entry = { schema: string; table: string; column: string };
export function completionSchema(objects: DatabaseObject[], columns: Entry[]) {
  const schema: Record<string, Record<string, string[]>> = Object.create(null);
  for (const object of objects)
    (schema[object.schema] ??= Object.create(null))[object.name] = [];
  for (const item of columns) {
    const tables = (schema[item.schema] ??= Object.create(null));
    (tables[item.table] ??= []).push(item.column);
  }
  return schema;
}
export function useSqlCompletions(objects: DatabaseObject[]) {
  const { api } = useDatabaseSession();
  const [data, setData] = useState<{
    api: typeof api;
    columns: Entry[];
    error: string | null;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    api.completionCatalog().then(
      (columns) => {
        if (live) setData({ api, columns, error: null });
      },
      (error) => {
        if (live) setData({ api, columns: [], error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [api, revision]);
  const schema = useMemo(
    () => completionSchema(objects, data?.api === api ? data.columns : []),
    [objects, data, api],
  );
  return {
    schema,
    error: data?.api === api ? data.error : null,
    refresh: useCallback(() => setRevision((r) => r + 1), []),
  };
}
