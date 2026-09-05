import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isDesktopRuntime } from "../../shared/lib/database-api";
import { connectionApi } from "./connection-api";
import type {
  ConnectionCatalog,
  SessionInfo,
  SessionStatus,
} from "./connection-types";

const emptyCatalog: ConnectionCatalog = {
  version: 1,
  workspaces: [],
  profiles: [],
};

export function useConnectionManager() {
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, SessionStatus>>({});
  useEffect(() => {
    if (!sessions.length) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await connectionApi.statuses();
        if (!stopped)
          setStatuses(
            Object.fromEntries(next.map((item) => [item.id, item.status])),
          );
      } catch {
        if (!stopped)
          setStatuses(
            Object.fromEntries(
              sessions.map((session) => [session.id, "unknown"]),
            ),
          );
      }
      if (!stopped)
        timer = setTimeout(() => {
          void poll();
        }, 2000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [sessions]);
  const inFlight = useRef(false);
  const reload = useCallback(async () => {
    if (!isDesktopRuntime()) {
      setError("Open the desktop app to manage real PostgreSQL connections.");
      setLoading(false);
      return;
    }
    try {
      const [nextCatalog, nextSessions] = await Promise.all([
        connectionApi.catalog(),
        connectionApi.sessions(),
      ]);
      setCatalog(nextCatalog);
      setSessions(nextSessions);
      setActiveId((current) =>
        nextSessions.some((session) => session.id === current) ? current : null,
      );
      setError(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const perform = useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, []);

  const connect = useCallback(
    (profileId: string, password: string | null, confirmed: boolean) =>
      perform(async () => {
        const existing = sessions.find((s) => s.profileId === profileId);
        if (existing && statuses[existing.id] !== "lost") {
          setActiveId(existing.id);
          return;
        }
        const session = await connectionApi.connect(
          profileId,
          password,
          confirmed,
        );
        setSessions((current) =>
          existing
            ? current.map((item) => (item.id === existing.id ? session : item))
            : [...current, session],
        );
        setStatuses((current) => ({ ...current, [session.id]: "active" }));
        setActiveId(session.id);
      }),
    [perform, sessions, statuses],
  );

  const disconnect = useCallback(
    (sessionId: string) =>
      perform(async () => {
        await connectionApi.disconnect(sessionId);
        setSessions((current) =>
          current.filter((session) => session.id !== sessionId),
        );
        setActiveId((current) => (current === sessionId ? null : current));
      }),
    [perform],
  );

  return {
    catalog,
    setCatalog,
    sessions,
    statuses,
    activeId,
    setActiveId,
    error,
    setError,
    loading,
    busy,
    reload,
    connect,
    disconnect,
  };
}
