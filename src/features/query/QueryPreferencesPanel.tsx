import { Settings2, X } from "lucide-react";
import type { QueryPreferences } from "./query-types";

type QueryPreferencesPanelProps = {
  preferences: QueryPreferences;
  onClose: () => void;
  onUpdate: <Key extends keyof QueryPreferences>(
    key: Key,
    value: QueryPreferences[Key],
  ) => void;
};

const rowLimits = [100, 500, 1_000, 5_000];
const timeouts = [10_000, 30_000, 60_000, 120_000];

export function QueryPreferencesPanel({
  preferences,
  onClose,
  onUpdate,
}: QueryPreferencesPanelProps) {
  return (
    <aside
      className="workspace-drawer preferences-drawer"
      aria-label="Query preferences"
    >
      <header className="drawer-header">
        <div>
          <span className="section-kicker">Workspace</span>
          <h2>Preferences</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close preferences"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <div className="preferences-content">
        <div className="preference-intro">
          <Settings2 size={20} />
          <p>Appearance and query safeguards are stored only on this device.</p>
        </div>

        <fieldset className="preference-group">
          <legend>Privacy</legend>
          <label>
            <input
              type="checkbox"
              checked={preferences.historyEnabled}
              onChange={(event) =>
                onUpdate("historyEnabled", event.target.checked)
              }
            />{" "}
            Record query history on this device
          </label>
          <p>
            SQL can contain sensitive values. Turning history off stops new
            entries; clear existing entries in History. Open query drafts are
            still saved locally.
          </p>
        </fieldset>

        <fieldset className="preference-group">
          <legend>Text size</legend>
          <div className="segmented-control">
            {(["comfortable", "large"] as const).map((size) => (
              <button
                key={size}
                aria-pressed={preferences.fontSize === size}
                onClick={() => onUpdate("fontSize", size)}
              >
                {size === "comfortable" ? "Comfortable" : "Large"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="preference-group">
          <legend>Interface density</legend>
          <div className="segmented-control">
            {(["comfortable", "compact"] as const).map((density) => (
              <button
                key={density}
                aria-pressed={preferences.density === density}
                onClick={() => onUpdate("density", density)}
              >
                {density === "comfortable" ? "Comfortable" : "Compact"}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="preference-field">
          <span>Maximum result rows</span>
          <select
            value={preferences.maxRows}
            onChange={(event) =>
              onUpdate("maxRows", Number(event.target.value))
            }
          >
            {rowLimits.map((limit) => (
              <option key={limit} value={limit}>
                {limit.toLocaleString()} rows
              </option>
            ))}
          </select>
        </label>

        <label className="preference-field">
          <span>Query timeout</span>
          <select
            value={preferences.timeoutMs}
            onChange={(event) =>
              onUpdate("timeoutMs", Number(event.target.value))
            }
          >
            {timeouts.map((timeout) => (
              <option key={timeout} value={timeout}>
                {timeout / 1_000} seconds
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}
