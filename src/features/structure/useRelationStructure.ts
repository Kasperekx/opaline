import { useDatabaseSession } from "../connections/SessionContext";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../shared/lib/database-api";
import type { RelationStructure } from "../../shared/types/structure";

export function useRelationStructure(
  schema: string,
  table: string,
  enabled = true,
) {
  const { api: databaseApi, session } = useDatabaseSession();
  const key = JSON.stringify([session.id, schema, table]);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: RelationStructure;
  } | null>(null);
  const [status, setStatus] = useState<{
    key: string;
    busy: boolean;
    error: string | null;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setStatus({ key, busy: true, error: null });
    databaseApi
      .inspectRelation(schema, table)
      .then((result) => {
        if (active) {
          setSnapshot({ key, data: result });
          setStatus({ key, busy: false, error: null });
        }
      })
      .catch((caughtError) => {
        if (active)
          setStatus({ key, busy: false, error: errorMessage(caughtError) });
      });
    return () => {
      active = false;
    };
  }, [databaseApi, schema, table, key, revision, enabled]);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  return {
    data: snapshot?.key === key ? snapshot.data : null,
    busy: enabled && (status?.key !== key || status.busy),
    error: status?.key === key ? status.error : null,
    refresh,
  };
}
