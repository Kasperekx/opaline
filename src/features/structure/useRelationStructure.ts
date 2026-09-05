import { useDatabaseSession } from "../connections/SessionContext";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../shared/lib/database-api";
import type { RelationStructure } from "../../shared/types/structure";

export function useRelationStructure(schema: string, table: string) {
  const { api: databaseApi } = useDatabaseSession();
  const [data, setData] = useState<RelationStructure | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(null);
    databaseApi
      .inspectRelation(schema, table)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((caughtError) => {
        if (active) setError(errorMessage(caughtError));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [databaseApi, schema, table, revision]);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  return { data, busy, error, refresh };
}
