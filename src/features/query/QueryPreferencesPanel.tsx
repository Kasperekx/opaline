import { useId } from "react";
import { Lock, X } from "lucide-react";
import type { QueryPreferences } from "./query-types";
import { useEntrance } from "../../shared/hooks/useEntrance";

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
  const entrance = useEntrance();
  const id = useId();
  return (
    <aside
      {...entrance}
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
          <X size={16} />
        </button>
      </header>

      <div className="preferences-content">
        <h3 className="preference-caption">Appearance</h3>
        <div className="preference-group">
          <div
            className="preference-row"
            role="group"
            aria-labelledby={`${id}-text-size`}
          >
            <span className="preference-label" id={`${id}-text-size`}>
              Text size
            </span>
            <div className="segmented-capsule">
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
          </div>
          <div
            className="preference-row"
            role="group"
            aria-labelledby={`${id}-density`}
          >
            <span className="preference-label" id={`${id}-density`}>
              Interface density
            </span>
            <div className="segmented-capsule">
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
          </div>
        </div>

        <h3 className="preference-caption">Results</h3>
        <div className="preference-group">
          <label className="preference-row">
            <span className="preference-label">Maximum result rows</span>
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
          <label className="preference-row">
            <span className="preference-label">Query timeout</span>
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

        <h3 className="preference-caption">Privacy</h3>
        <div className="preference-group">
          <label className="preference-row">
            <span className="preference-label">
              Record query history on this device
            </span>
            <input
              className="preference-switch"
              type="checkbox"
              role="switch"
              checked={preferences.historyEnabled}
              onChange={(event) =>
                onUpdate("historyEnabled", event.target.checked)
              }
            />
          </label>
          <p className="preference-note">
            SQL can contain sensitive values. Turning history off stops new
            entries; clear existing entries in History. Open query drafts are
            still saved locally.
          </p>
        </div>

        <p className="preference-footnote">
          <Lock size={11} strokeWidth={2} />
          Appearance and query safeguards are stored only on this device.
        </p>
      </div>
    </aside>
  );
}
