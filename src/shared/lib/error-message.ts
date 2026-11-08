/** Tauri rejects with plain serialized objects, not necessarily Error instances. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const value = error as {
      message?: unknown;
      code?: unknown;
      hint?: unknown;
    };
    if (typeof value.message === "string" && value.message.trim()) {
      const parts = [value.message];
      if (
        typeof value.hint === "string" &&
        value.hint.trim() &&
        !value.message.includes(value.hint)
      )
        parts.push(value.hint);
      if (
        typeof value.code === "string" &&
        /^[0-9A-Z]{5}$/.test(value.code) &&
        !value.message.includes(`SQLSTATE ${value.code}`)
      )
        parts.push(`SQLSTATE ${value.code}`);
      return parts.join("\n");
    }
  }
  // Never stringify arbitrary IPC payloads: they may contain credentials or rows.
  return "The operation failed without a readable diagnostic. If it was a write, verify the database state before retrying. Report the operation and app version.";
}
