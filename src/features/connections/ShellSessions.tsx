import { createContext, useContext, type ReactNode } from "react";
import type { ProductWorkspace, SessionInfo } from "./connection-types";

/** Open sessions as the window chrome sees them. The sidebar's connection
 * pill and the connection library both switch and close sessions through it. */
export type ShellSessions = {
  sessions: SessionInfo[];
  workspaces: ProductWorkspace[];
  activeId: string | null;
  busy: boolean;
  /** Show a session, or the connection library with `null`. */
  select: (id: string | null) => void;
  /** Disconnect after the work-safety check. */
  close: (id: string) => void;
};

const ShellSessionsContext = createContext<ShellSessions | null>(null);

export function ShellSessionsProvider({
  value,
  children,
}: {
  value: ShellSessions;
  children: ReactNode;
}) {
  return (
    <ShellSessionsContext.Provider value={value}>
      {children}
    </ShellSessionsContext.Provider>
  );
}

export function useShellSessions() {
  return useContext(ShellSessionsContext);
}
