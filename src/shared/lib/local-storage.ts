type StorageFailure = { key: string; reason: "read" | "write" };
const failures = new Map<string, StorageFailure>();
const pendingWrites = new Map<string, string>();
const unreadable = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: StorageFailure[] = [];
const publish = () => {
  snapshot = [...failures.values()];
  // Reads may occur during React initialization. Notify subscribers after render.
  queueMicrotask(() => listeners.forEach((listener) => listener()));
};
export const subscribeStorage = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const storageSnapshot = () => snapshot;
export const hasStorageFailures = () => failures.size > 0;
export function markUnreadableStorage(key: string) {
  unreadable.add(key);
  failures.set(key, { key, reason: "read" });
  publish();
}

export function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    markUnreadableStorage(key);
    return fallback;
  }
}

export function writeLocalJson(key: string, value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    pendingWrites.set(key, serialized);
    // Never overwrite unreadable data with a fresh default session.
    if (unreadable.has(key)) return false;
    window.localStorage.setItem(key, serialized);
    pendingWrites.delete(key);
    if (failures.delete(key)) publish();
    return true;
  } catch {
    failures.set(key, { key, reason: "write" });
    publish();
    return false;
  }
}

export function retryLocalWrites() {
  for (const [key, serialized] of pendingWrites) {
    if (unreadable.has(key)) continue;
    try {
      window.localStorage.setItem(key, serialized);
      pendingWrites.delete(key);
      failures.delete(key);
    } catch {
      /* Preserve the in-memory draft and visible warning. */
    }
  }
  publish();
}

// Explicit recovery keeps an untouched local backup before replacing damaged data.
export function recoverLocalStorage(): boolean {
  for (const key of unreadable) {
    try {
      const original = window.localStorage.getItem(key);
      if (original !== null)
        window.localStorage.setItem(
          `${key}.recovery.${crypto.randomUUID()}`,
          original,
        );
      unreadable.delete(key);
      failures.delete(key);
    } catch {
      publish();
      return false;
    }
  }
  retryLocalWrites();
  return !hasStorageFailures();
}
