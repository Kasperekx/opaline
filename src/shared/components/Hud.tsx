import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Check, CircleAlert, TriangleAlert } from "lucide-react";

export type HudTone = "neutral" | "success" | "warning" | "danger";
export type HudMessage = {
  /** Replaces the tone's default glyph. Pass `null` for text only. */
  icon?: ReactNode;
  title: string;
  detail?: string;
  tone?: HudTone;
};
export type HudApi = {
  /** Shows a transient confirmation, replacing the one on screen. */
  show: (message: HudMessage) => void;
  /** False without a provider (tests, fixtures): callers keep their own
   * inline status so nothing goes unannounced. */
  available: boolean;
};

const VISIBLE_MS = 1600;
const RESUME_MS = 1000;
const EXIT_MS = 150;
/** Resting distance from the window's bottom edge: clear of the status line
 * and a table's pagination footer. */
const BASELINE = 96;
const GAP = 12;

type Placement = { x: number | null; bottom: number };

/** Centre on the visible content column and rise above floating bars that
 * opt in with `data-hud-avoid` (e.g. the unsaved-changes bar). */
function placement(): Placement {
  const visible = (element: Element) => element.getClientRects().length > 0;
  const column = [...document.querySelectorAll(".workbench-canvas")].find(
    visible,
  );
  const rect = column?.getBoundingClientRect();
  const tops = [...document.querySelectorAll("[data-hud-avoid]")]
    .filter(visible)
    .map((element) => element.getBoundingClientRect().top);
  return {
    x: rect && rect.width ? rect.left + rect.width / 2 : null,
    bottom: Math.max(
      BASELINE,
      ...tops.map((top) => window.innerHeight - top + GAP),
    ),
  };
}

const unavailable: HudApi = { show: () => undefined, available: false };
const HudContext = createContext<HudApi>(unavailable);

/** Transient confirmations (copied, saved, exported). A safe no-op without a
 * provider. Never use it for errors or anything that needs a decision. */
export function useHud() {
  return useContext(HudContext);
}

const toneIcons: Record<HudTone, ReactNode> = {
  neutral: null,
  success: <Check size={15} strokeWidth={2.25} />,
  warning: <TriangleAlert size={15} />,
  danger: <CircleAlert size={15} />,
};

type Entry = HudMessage & { id: number; leaving: boolean; replacing: boolean };

export function HudProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  const nextId = useRef(0);
  const dismissTimer = useRef<number | undefined>(undefined);
  const removalTimers = useRef(new Set<number>());
  const hovered = useRef(false);

  const commit = useCallback((next: Entry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);
  const leave = useCallback(
    (ids: number[]) => {
      if (!ids.length) return;
      commit(
        entriesRef.current.map((entry) =>
          ids.includes(entry.id) ? { ...entry, leaving: true } : entry,
        ),
      );
      const timer = window.setTimeout(() => {
        removalTimers.current.delete(timer);
        commit(entriesRef.current.filter((entry) => !ids.includes(entry.id)));
      }, EXIT_MS);
      removalTimers.current.add(timer);
    },
    [commit],
  );
  const schedule = useCallback(
    (ms: number) => {
      window.clearTimeout(dismissTimer.current);
      if (hovered.current) return;
      dismissTimer.current = window.setTimeout(() => {
        leave(
          entriesRef.current
            .filter((entry) => !entry.leaving)
            .map((entry) => entry.id),
        );
      }, ms);
    },
    [leave],
  );
  const show = useCallback(
    (message: HudMessage) => {
      const current = entriesRef.current.find((entry) => !entry.leaving);
      const same =
        current &&
        current.title === message.title &&
        current.detail === message.detail &&
        (current.tone ?? "neutral") === (message.tone ?? "neutral");
      // Repeating the same confirmation keeps it up instead of flickering.
      if (!same) {
        if (current) {
          // The hovered capsule is leaving; its pointerleave never arrives.
          hovered.current = false;
          leave([current.id]);
        }
        commit([
          // At most one outgoing capsule crossfades beneath the new one.
          ...entriesRef.current.filter((entry) => entry.leaving).slice(-1),
          {
            ...message,
            id: ++nextId.current,
            leaving: false,
            replacing: Boolean(current),
          },
        ]);
      }
      schedule(VISIBLE_MS);
    },
    [commit, leave, schedule],
  );
  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      window.clearTimeout(dismissTimer.current);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  const value = useMemo(() => ({ show, available: true }), [show]);
  return (
    <HudContext.Provider value={value}>
      {children}
      <div
        className="hud-viewport"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {entries.map((entry) => (
          <HudCapsule
            key={entry.id}
            entry={entry}
            onPointerEnter={() => {
              hovered.current = true;
              window.clearTimeout(dismissTimer.current);
            }}
            onPointerLeave={() => {
              hovered.current = false;
              schedule(RESUME_MS);
            }}
            onDismiss={() => {
              hovered.current = false;
              window.clearTimeout(dismissTimer.current);
              leave([entry.id]);
            }}
          />
        ))}
      </div>
    </HudContext.Provider>
  );
}

function HudCapsule({
  entry,
  onPointerEnter,
  onPointerLeave,
  onDismiss,
}: {
  entry: Entry;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    // Commit the hidden starting styles before switching state, so the
    // entrance is a CSS transition and stays interruptible. Placement is read
    // after the commit that triggered the message (a finished export bar has
    // already gone) and then stays put for the capsule's lifetime.
    ref.current?.getBoundingClientRect();
    setPlace(placement());
  }, []);
  const tone = entry.tone ?? "neutral";
  const icon = entry.icon === undefined ? toneIcons[tone] : entry.icon;
  return (
    <div
      ref={ref}
      className="hud"
      data-tone={tone}
      data-state={entry.leaving ? "leaving" : place ? "visible" : "entering"}
      data-replacing={entry.replacing || undefined}
      style={
        place
          ? ({
              "--hud-x": place.x === null ? undefined : `${place.x}px`,
              "--hud-bottom": `${place.bottom}px`,
            } as CSSProperties)
          : undefined
      }
      aria-hidden={entry.leaving || undefined}
      onPointerEnter={entry.leaving ? undefined : onPointerEnter}
      onPointerLeave={entry.leaving ? undefined : onPointerLeave}
      onClick={entry.leaving ? undefined : onDismiss}
    >
      {icon && (
        <span className="hud-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="hud-text">
        <strong>{entry.title}</strong>
        {entry.detail && <span>{entry.detail}</span>}
      </span>
    </div>
  );
}
