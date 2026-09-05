import { useSyncExternalStore } from "react";
import {
  recoverLocalStorage,
  retryLocalWrites,
  storageSnapshot,
  subscribeStorage,
} from "../lib/local-storage";

export function StorageWarning() {
  const failures = useSyncExternalStore(subscribeStorage, storageSnapshot);
  if (!failures.length) return null;
  return (
    <div className="storage-warning" role="alert">
      <span>
        {failures.some((failure) => failure.reason === "read")
          ? "Local data could not be read and was not overwritten. Recovery preserves the original in a local backup, then saves the currently open drafts."
          : "Local saving failed. Your drafts are only in memory. Free some disk space and retry; do not quit before copying your SQL."}
      </span>
      <button className="button ghost" onClick={retryLocalWrites}>
        Retry saving
      </button>
      {failures.some((failure) => failure.reason === "read") && (
        <button className="button ghost" onClick={recoverLocalStorage}>
          Back up and recover
        </button>
      )}
    </div>
  );
}
