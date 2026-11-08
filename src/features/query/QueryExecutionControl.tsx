import { Loader2, Play, Square } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Sheet } from "../../shared/components/Sheet";
import { useEntrance } from "../../shared/hooks/useEntrance";
import { primaryModifierLabel } from "../../shared/lib/platform";
import type { QueryExecutionMode } from "../../shared/types/database";

export function QueryExecutionControl({
  mode,
  target,
  readOnly,
  busy,
  onChange,
}: {
  mode: QueryExecutionMode;
  target: string;
  readOnly: boolean;
  busy: boolean;
  onChange: (mode: QueryExecutionMode) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <label
        className={`query-execution-control ${mode}`}
        title={
          readOnly
            ? "Read-only sessions always use a protected atomic transaction"
            : "Atomic rolls back a failed script. Autocommit saves a single statement immediately."
        }
      >
        <span className="sr-only">SQL execution mode</span>
        <select
          aria-label="SQL execution mode"
          value={mode}
          disabled={busy || readOnly}
          onChange={(event) => {
            if (event.target.value === "autocommit") setConfirming(true);
            else onChange("atomic");
          }}
        >
          <option value="atomic">Atomic</option>
          <option value="autocommit">Autocommit</option>
        </select>
      </label>
      {confirming && (
        <Sheet
          title="Enable autocommit for this tab?"
          subtitle={target}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button
                className="button secondary"
                data-initial-focus="true"
                onClick={() => setConfirming(false)}
              >
                Keep atomic
              </button>
              <button
                className="button danger"
                onClick={() => {
                  onChange("autocommit");
                  setConfirming(false);
                }}
              >
                Enable autocommit
              </button>
            </>
          }
        >
          <div className="safety-content">
            <p>
              Each Run executes one statement and saves it immediately. There is
              no application rollback. Use this for commands such as VACUUM or
              CREATE DATABASE.
            </p>
            <p>
              Select one statement before running a script. Manual BEGIN/COMMIT
              are not supported. After an error or lost response, inspect the
              database before retrying.
            </p>
            <p>
              This choice applies only to this tab and is not restored after
              restarting the application.
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Live elapsed time of a run, ticking every 100ms once it passes 300ms, so
 * fast queries never flash a counter. Null until then. */
export function useRunElapsed(running: boolean) {
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const tick = () => setElapsed(performance.now() - started);
    let interval = 0;
    const delay = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 100);
    }, 300);
    return () => {
      window.clearTimeout(delay);
      window.clearInterval(interval);
      setElapsed(null);
    };
  }, [running]);
  return running ? elapsed : null;
}

export function formatElapsed(ms: number) {
  if (ms < 10_000) return `${(Math.floor(ms / 100) / 10).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s`;
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Crossfades a label in through a 2px blur, once per mount. */
function RunLabel({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const entrance = useEntrance(400);
  return (
    <span className={className} {...entrance}>
      {children}
    </span>
  );
}

/**
 * Run morphs into Cancel while SQL executes: one capsule that eases its
 * width and crossfades its label. While running it reads "Running" with the
 * elapsed time; hover or keyboard focus reveals "Cancel", its action.
 */
export function RunQueryButton({
  running,
  cancelling,
  disabled,
  onRun,
  onCancel,
}: {
  running: boolean;
  cancelling: boolean;
  disabled: boolean;
  onRun: () => void;
  onCancel: () => void;
}) {
  const elapsed = useRunElapsed(running && !cancelling);
  const button = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const state = !running ? "idle" : cancelling ? "cancelling" : "running";

  // Width follows the label so the capsule can ease between states (auto
  // widths cannot transition).
  useLayoutEffect(() => {
    const host = button.current;
    const inner = content.current;
    if (!host || !inner || typeof ResizeObserver === "undefined") return;
    // Layout sizes (not getBoundingClientRect): the press scale must not
    // shrink the measurement.
    const measure = ([entry]: ResizeObserverEntry[]) => {
      const label = entry?.contentRect.width ?? 0;
      // A hidden workspace measures 0; keep the last width so showing it
      // again doesn't animate.
      if (label === 0) return;
      const style = getComputedStyle(host);
      setWidth(
        Math.ceil(
          label +
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            parseFloat(style.borderLeftWidth) +
            parseFloat(style.borderRightWidth),
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={button}
      className={`run-button${running ? " is-running" : ""}`}
      data-state={state}
      style={width === null ? undefined : { width }}
      disabled={running ? cancelling : disabled}
      aria-label={
        state === "running"
          ? "Cancel"
          : state === "cancelling"
            ? "Cancelling"
            : undefined
      }
      title={
        running
          ? "Cancel the running query"
          : "Run selected SQL, or the entire editor when nothing is selected"
      }
      onClick={running ? onCancel : onRun}
    >
      <span className="run-button-content" ref={content}>
        {state === "idle" ? (
          <RunLabel key="idle" className="run-button-label">
            <Play size={12} fill="currentColor" />
            Run <kbd>{primaryModifierLabel}↩</kbd>
          </RunLabel>
        ) : state === "running" ? (
          <RunLabel key="running" className="run-button-label">
            <Square size={10} fill="currentColor" />
            <span className="run-button-swap">
              <span className="run-button-status">Running</span>
              <span className="run-button-action">Cancel</span>
            </span>
            {elapsed !== null && (
              <span className="run-button-elapsed">
                {formatElapsed(elapsed)}
              </span>
            )}
          </RunLabel>
        ) : (
          <RunLabel key="cancelling" className="run-button-label">
            <Loader2 className="spin" size={13} />
            Cancelling
          </RunLabel>
        )}
      </span>
    </button>
  );
}
