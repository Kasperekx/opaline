import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive } from "lucide-react";
import { isDesktopRuntime } from "../lib/database-api";
import { hasStorageFailures, retryLocalWrites } from "../lib/local-storage";
import { useWorkSafety } from "./WorkSafety";
import { Sheet } from "../components/Sheet";

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
      <Sheet
        title="Local saving failed"
        subtitle="Some local changes are only in memory. Copy important SQL before quitting. You can retry after freeing disk space, or explicitly quit without saving."
        icon={HardDrive}
        tone="danger"
        size="small"
        showClose={false}
        onClose={() => setStorageBlocked(false)}
        footer={
          <>
            <button
              className="button secondary"
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
          </>
        }
      />
    );
  return error ? (
    <div className="storage-warning" role="alert">
      Window protection could not be initialized. Copy your SQL before quitting
      and restart the app.
    </div>
  ) : null;
}
