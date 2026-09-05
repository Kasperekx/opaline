import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { isDesktopRuntime } from "../lib/database-api";
import { hasStorageFailures, retryLocalWrites } from "../lib/local-storage";
import { useWorkSafety } from "./WorkSafety";
import { ConnectionDialog } from "../../features/connections/ConnectionDialog";

// Both the window close button and native Quit are routed here by Rust.
export function NativeExitGuard() {
  const { request } = useWorkSafety();
  const [error, setError] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("request-app-exit", () => {
      retryLocalWrites();
      if (hasStorageFailures()) {
        setStorageBlocked(true);
        return;
      }
      request(() => {
        void invoke("exit_application").catch(() => setError(true));
      });
    })
      .then((stop) => {
        if (disposed) stop();
        else {
          unlisten = stop;
          void invoke("enable_exit_guard").catch(() => setError(true));
        }
      })
      .catch(() => setError(true));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [request]);
  if (storageBlocked)
    return (
      <ConnectionDialog
        title="Local saving failed"
        subtitle="Before quitting"
        onClose={() => setStorageBlocked(false)}
      >
        <div className="safety-content">
          <p>
            Some local changes are only in memory. Copy important SQL before
            quitting. You can retry after freeing disk space, or explicitly quit
            without saving.
          </p>
        </div>
        <footer className="dialog-actions">
          <button
            className="button ghost"
            data-initial-focus="true"
            onClick={() => setStorageBlocked(false)}
          >
            Keep working
          </button>
          <button
            className="button danger"
            onClick={() => {
              setStorageBlocked(false);
              request(() => {
                void invoke("exit_application").catch(() => setError(true));
              });
            }}
          >
            Quit without saving
          </button>
        </footer>
      </ConnectionDialog>
    );
  return error ? (
    <div className="storage-warning" role="alert">
      Window protection could not be initialized. Copy your SQL before quitting
      and restart the app.
    </div>
  ) : null;
}
