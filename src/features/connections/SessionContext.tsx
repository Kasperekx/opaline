import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createDatabaseApi } from "../../shared/lib/database-api";
import type { SessionInfo } from "./connection-types";

const SessionContext = createContext<{
  session: SessionInfo;
  api: ReturnType<typeof createDatabaseApi>;
} | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: SessionInfo;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ session, api: createDatabaseApi(session.id) }),
    [session],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
export function useDatabaseSession() {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("Database operations require an explicit session.");
  return context;
}
