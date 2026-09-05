import { useState } from "react";
import { X } from "lucide-react";
import { ConnectionManager } from "./features/connections/ConnectionManager";
import { ConnectProfileDialog } from "./features/connections/ConnectProfileDialog";
import { SessionProvider } from "./features/connections/SessionContext";
import { SessionStrip } from "./features/connections/SessionStrip";
import { useConnectionManager } from "./features/connections/useConnectionManager";
import type { ConnectionProfile } from "./features/connections/connection-types";
import { Workspace } from "./features/query/Workspace";
import { useQueryPreferences } from "./features/query/useQueryPreferences";
import {
  WorkSafetyProvider,
  useWorkRisk,
  useWorkSafety,
} from "./shared/safety/WorkSafety";
import { StorageWarning } from "./shared/safety/StorageWarning";
import { NativeExitGuard } from "./shared/safety/NativeExitGuard";
import { ConnectionSwitcher } from "./features/connections/ConnectionSwitcher";
import "./App.css";
import "./features/connections/connections.css";
import "./features/connections/connection-home.css";
import "./shared/safety/safety.css";

function Application() {
  const safety = useWorkSafety();
  const manager = useConnectionManager();
  useWorkRisk({ label: "Connection operation", busy: manager.busy });
  const queryPreferences = useQueryPreferences();
  const visibleError = manager.error ?? manager.catalog.credentialWarning;
  const [connecting, setConnecting] = useState<ConnectionProfile | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [managerRequest, setManagerRequest] = useState<{
    workspaceId: string;
    create: boolean;
    nonce: number;
  } | null>(null);
  const switching = manager.sessions.find(
    (session) => session.id === switchingId,
  );
  const connect = (profile: ConnectionProfile) => {
    const session = manager.sessions.find(
      (session) => session.profileId === profile.id,
    );
    manager.setError(null);
    if (session) manager.setActiveId(session.id);
    else setConnecting(profile);
  };
  return (
    
    <div
      className={
        "application-shell" + (manager.sessions.length ? " has-sessions" : "")
      }
    >
      {manager.sessions.length > 0 && (
        <SessionStrip
          sessions={manager.sessions}
          workspaces={manager.catalog.workspaces}
          activeId={manager.activeId}
          busy={manager.busy}
          onSelect={manager.setActiveId}
          onClose={(id) =>
            safety.request(
              () => {
                void manager.disconnect(id);
              },
              { sessionId: id },
            )
          }
        />
      )}
      <div className="application-content">
        <div className="session-content" hidden={manager.activeId !== null}>
          <ConnectionManager
            catalog={manager.catalog}
            sessions={manager.sessions}
            loading={manager.loading}
            busy={manager.busy}
            onCatalog={manager.setCatalog}
            onConnect={connect}
            request={managerRequest}
          />
        </div>
        {manager.sessions.map((session) => (
          <div
            className="session-content"
            key={session.id}
            hidden={manager.activeId !== session.id}
          >
            <SessionProvider session={session}>
              <Workspace
                connection={session}
                workspaceName={
                  manager.catalog.workspaces.find(
                    (workspace) => workspace.id === session.workspaceId,
                  )?.name
                }
                active={manager.activeId === session.id}
                onSwitchConnection={() => setSwitchingId(session.id)}
                status={manager.statuses[session.id] ?? "active"}
                onReconnect={() => {
                  const profile = manager.catalog.profiles.find(
                    (profile) => profile.id === session.profileId,
                  );
                  if (profile) setConnecting(profile);
                }}
                queryPreferences={queryPreferences}
                onManageConnections={() => manager.setActiveId(null)}
                onDisconnect={() =>
                  safety.request(
                    () => {
                      void manager.disconnect(session.id);
                    },
                    { sessionId: session.id },
                  )
                }
              />
            </SessionProvider>
          </div>
        ))}
        {visibleError && !connecting && (
          <div className="connection-app-error" role="alert">
            <span>{visibleError}</span>
            <button
              className="button ghost"
              disabled={manager.busy}
              onClick={() => void manager.reload()}
            >
              Retry
            </button>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => {
                manager.setError(null);
                manager.setCatalog({
                  ...manager.catalog,
                  credentialWarning: null,
                });
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
      <StorageWarning />
      <NativeExitGuard />
      {switching && (
        <ConnectionSwitcher
          current={switching}
          workspace={manager.catalog.workspaces.find(
            (workspace) => workspace.id === switching.workspaceId,
          )}
          profiles={manager.catalog.profiles}
          sessions={manager.sessions}
          busy={manager.busy}
          onClose={() => setSwitchingId(null)}
          onSelect={(profile) => {
            setSwitchingId(null);
            connect(profile);
          }}
          onManage={(create) => {
            setManagerRequest({
              workspaceId: switching.workspaceId,
              create,
              nonce: Date.now(),
            });
            setSwitchingId(null);
            manager.setActiveId(null);
          }}
        />
      )}
      {connecting && (
        <ConnectProfileDialog
          profile={connecting}
          workspaceName={
            manager.catalog.workspaces.find(
              (w) => w.id === connecting.workspaceId,
            )?.name ?? ""
          }
          busy={manager.busy}
          error={manager.error}
          onClose={() => {
            setConnecting(null);
            manager.setError(null);
          }}
          onConnect={(password, confirmed) =>
            manager.connect(connecting.id, password, confirmed)
          }
        />
      )}
    </div>
  );
}
function App() {
  return (
    <WorkSafetyProvider>
      <Application />
    </WorkSafetyProvider>
  );
}
export default App;
