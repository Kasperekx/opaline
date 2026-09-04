import { Database, KeyRound, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConnectionConfig } from "../../shared/types/database";
import { initialConnection } from "./connection-defaults";

type ConnectionModalProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: ConnectionConfig) => void;
};

export function ConnectionModal({
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: ConnectionModalProps) {
  const [value, setValue] = useState(initialConnection);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose, open]);

  if (!open) return null;

  const update = <K extends keyof ConnectionConfig>(
    key: K,
    next: ConnectionConfig[K],
  ) => setValue((current) => ({ ...current, [key]: next }));

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="connection-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-title"
      >
        <div className="modal-head">
          <div className="modal-title-wrap">
            <div className="postgres-glyph large">
              <Database size={23} />
            </div>
            <div>
              <span className="section-kicker">New connection</span>
              <h2 id="connection-title">PostgreSQL</h2>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value);
          }}
        >
          <label className="field full">
            <span>Connection name</span>
            <input
              value={value.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Production"
              autoFocus
            />
          </label>
          <div className="field-row host-row">
            <label className="field">
              <span>Host</span>
              <input
                value={value.host}
                onChange={(event) => update("host", event.target.value)}
                placeholder="localhost"
                required
              />
            </label>
            <label className="field port-field">
              <span>Port</span>
              <input
                type="number"
                min="1"
                max="65535"
                value={value.port}
                onChange={(event) => update("port", Number(event.target.value))}
                required
              />
            </label>
          </div>
          <label className="field full">
            <span>Database</span>
            <input
              value={value.database}
              onChange={(event) => update("database", event.target.value)}
              placeholder="postgres"
              required
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Username</span>
              <input
                value={value.username}
                onChange={(event) => update("username", event.target.value)}
                placeholder="postgres"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={value.password}
                onChange={(event) => update("password", event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <label className="field full">
            <span>SSL mode</span>
            <select
              value={value.sslMode}
              onChange={(event) =>
                update("sslMode", event.target.value as ConnectionConfig["sslMode"])
              }
            >
              <option value="prefer">Prefer</option>
              <option value="require">Require</option>
              <option value="disable">Disable</option>
            </select>
          </label>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="modal-footer">
            <span className="secure-copy">
              <KeyRound size={14} /> Kept in memory for this session
            </span>
            <div>
              <button
                type="button"
                className="button ghost"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <Database size={16} />
                )}
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
