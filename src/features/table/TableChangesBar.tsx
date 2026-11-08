import { Check, Loader2 } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FloatingPresence } from "./FloatingPresence";
import { useDatabaseSession } from "../connections/SessionContext";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useWorkSafety } from "../../shared/safety/WorkSafety";
import { primaryModifierLabel } from "../../shared/lib/platform";
import { useHud } from "../../shared/components/Hud";
import type { TableTab } from "../query/query-types";
import type { TableDataController } from "./useTableData";
import { TableErrorNotice } from "./TableErrorNotice";
import { useEntrance } from "../../shared/hooks/useEntrance";
import {
  SelectionSegment,
  useSelectionActions,
  type SelectionCommands,
} from "./TableSelectionBar";

/** Width/crossfade morph between segments (matches inline-editing.css). */
const SEGMENT_MS = 220;

type BarProps = {
  table: TableDataController;
  tab: TableTab;
  locked?: boolean;
  /** Grid-backed commands for the selection segment (copy, Quick Look).
   * Without them the bar shows unsaved changes only. */
  selection?: SelectionCommands;
};

/**
 * The table's one contextual floating bar, bottom-centre. Its content
 * follows state: selected rows, unsaved changes, or both as two segments in
 * the same capsule. Segments morph in place (width + crossfade); the capsule
 * enters once and leaves (after a save, a discard or a cleared selection)
 * instead of vanishing.
 */
export function TableChangesBar({
  table,
  tab,
  locked = false,
  selection,
}: BarProps) {
  const { changes } = table;
  const { popover, ...selectionActions } = useSelectionActions(
    table,
    tab,
    locked,
    selection,
  );
  const hasChanges = Boolean(
    changes.summary.rows.length || changes.saved || changes.error,
  );
  const hasSelection = Boolean(selection) && table.selectedCount > 0;
  return (
    <>
      <FloatingPresence show={hasChanges || hasSelection}>
        <ContextBar
          table={table}
          tab={tab}
          hasChanges={hasChanges}
          selectionSegment={
            selection && (
              <SelectionSegment
                table={table}
                locked={locked}
                {...selectionActions}
              />
            )
          }
          hasSelection={hasSelection}
        />
      </FloatingPresence>
      {popover}
    </>
  );
}

function ContextBar({
  table,
  tab,
  hasChanges,
  hasSelection,
  selectionSegment,
  leaving = false,
}: {
  table: TableDataController;
  tab: TableTab;
  hasChanges: boolean;
  hasSelection: boolean;
  selectionSegment: ReactNode;
  leaving?: boolean;
}) {
  const entrance = useEntrance();
  const { session } = useDatabaseSession();
  const { changes } = table;
  const { summary } = changes;
  const target = `${session.name} · ${session.host}:${session.port}/${session.database} · ${tab.schema}.${tab.table}`;
  const succeeded = changes.saved && !changes.error;
  const phase = changes.busy ? "saving" : succeeded ? "saved" : "idle";
  const showActions = !changes.saved || succeeded;
  return (
    <div
      {...entrance}
      className={`table-changes-bar ${changes.error ? "has-error" : ""}`}
      data-phase={phase}
      data-leaving={leaving || undefined}
      data-hud-avoid=""
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
    >
      {hasChanges && session.environment === "production" && showActions && (
        <small className="table-change-context">{target}</small>
      )}
      {hasChanges && summary.inserted > 0 && !changes.saved && (
        <small className="table-change-context">
          New rows: review primary and unique keys before saving.
        </small>
      )}
      {hasChanges && changes.error && (
        <TableErrorNotice
          title={
            changes.error.kind === "unknown"
              ? "Save outcome unknown. "
              : changes.saved
                ? "View refresh failed. "
                : "Could not save. "
          }
          hint={
            changes.error.kind === "unknown"
              ? "Your local changes are kept."
              : changes.saved
                ? "The save was confirmed. Refresh the table without repeating the write."
                : "Your local changes are preserved. Review the details and correct the affected values before saving again."
          }
          message={changes.error.message}
        />
      )}
      <div className="table-bar-row">
        <Segment open={hasSelection} kind="selection">
          {selectionSegment}
        </Segment>
        <Segment open={hasChanges} kind="changes">
          <ChangesSegment
            table={table}
            tab={tab}
            joined={hasSelection}
            phase={phase}
            showActions={showActions}
          />
        </Segment>
      </div>
    </div>
  );
}

/** One part of the bar. It opens and closes by animating its width to the
 * measured width of its content while the content crossfades; closing
 * keeps the last content on screen until the width reaches zero. */
function Segment({
  open,
  kind,
  children,
}: {
  open: boolean;
  kind: "selection" | "changes";
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const [width, setWidth] = useState<number | null>(null);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const frozen = useRef<ReactNode>(null);
  if (open) frozen.current = children;
  if (open && !mounted) setMounted(true);
  useLayoutEffect(() => {
    if (!mounted) return;
    const measure = () => {
      const measured = Math.ceil(
        inner.current?.getBoundingClientRect().width ?? 0,
      );
      setWidth(measured > 0 ? measured : null);
    };
    if (open && !expanded) {
      // Commit the collapsed width first so opening is a transition.
      outer.current?.getBoundingClientRect();
      setExpanded(true);
    } else if (!open && expanded) setExpanded(false);
    measure();
    if (!open || typeof ResizeObserver === "undefined" || !inner.current)
      return;
    const observer = new ResizeObserver(measure);
    observer.observe(inner.current);
    return () => observer.disconnect();
  }, [open, mounted, expanded]);
  useEffect(() => {
    if (open || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), SEGMENT_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);
  if (!mounted) return null;
  const shown = open && expanded;
  return (
    <div
      ref={outer}
      className={`table-bar-segment ${kind}`}
      data-open={shown || undefined}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
      style={
        {
          width: shown ? (width ?? undefined) : 0,
        } satisfies CSSProperties
      }
    >
      <div ref={inner} className="table-bar-segment-inner">
        {open ? children : frozen.current}
      </div>
    </div>
  );
}

function ChangesSegment({
  table,
  tab,
  joined,
  phase,
  showActions,
}: {
  table: TableDataController;
  tab: TableTab;
  joined: boolean;
  phase: SavePhase;
  showActions: boolean;
}) {
  const { session } = useDatabaseSession();
  const safety = useWorkSafety();
  const hud = useHud();
  const { changes } = table;
  const { summary } = changes;
  const count = summary.fields + summary.inserted + summary.deleted;
  const target = `${session.name} · ${session.host}:${session.port}/${session.database} · ${tab.schema}.${tab.table}`;
  const succeeded = phase === "saved";
  return (
    <>
      {joined && <span className="table-bar-divider" aria-hidden="true" />}
      <div className="table-change-summary" role="status" title={target}>
        <span className="table-change-dot" aria-hidden="true" />
        <span>
          <strong>
            {changes.busy
              ? "Saving changes…"
              : changes.saved
                ? "Changes saved"
                : changes.error?.kind === "unknown"
                  ? "Save not confirmed"
                  : `${count} unsaved ${count === 1 ? "change" : "changes"}`}
          </strong>
          <small>· {tab.table}</small>
        </span>
      </div>
      {showActions && (
        <>
          {session.environment === "production" && (
            <EnvironmentBadge
              environment={session.environment}
              readOnly={session.readOnly}
            />
          )}
          <div className="table-change-actions">
            <button
              className="button ghost secondary-action"
              disabled={changes.busy || succeeded}
              onClick={changes.showReview}
            >
              Review
            </button>
            <button
              className="button ghost discard secondary-action"
              disabled={changes.busy || succeeded}
              onClick={() =>
                safety.request(
                  () => {
                    const discarded = changes.summary.rows.length > 0;
                    changes.clear();
                    if (discarded)
                      hud.show({
                        title: "Discarded changes",
                        detail: `${tab.schema}.${tab.table}`,
                      });
                  },
                  {
                    sessionId: session.id,
                    tabId: tab.id,
                  },
                  { allowSave: false },
                )
              }
            >
              Discard…
            </button>
            <SaveButton
              phase={phase}
              production={session.environment === "production"}
              disabled={
                phase !== "idle" ||
                changes.disabled ||
                summary.invalid ||
                table.busy ||
                !summary.rows.length
              }
              onSave={() => void changes.save()}
            />
          </div>
        </>
      )}
    </>
  );
}

type SavePhase = "idle" | "saving" | "saved";

/** Save → Saving… → Saved. The button keeps the width of its idle label so
 * nothing moves under the pointer; the faces crossfade (blur bridge) inside. */
function SaveButton({
  phase,
  production,
  disabled,
  onSave,
}: {
  phase: SavePhase;
  production: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  const faces = useRef<Partial<Record<SavePhase, HTMLSpanElement | null>>>({});
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    // The widest face (the idle label) sets a stable width; +1 covers subpixel
    // text. Recomputed only when that label changes, never per phase.
    const widest = Math.max(
      ...Object.values(faces.current).map((face) => face?.offsetWidth ?? 0),
    );
    setWidth(widest > 0 ? widest + 1 : null);
  }, [production]);
  const face = (name: SavePhase, content: ReactNode) => (
    <span
      ref={(element) => {
        faces.current[name] = element;
      }}
      className="save-face"
      data-active={phase === name || undefined}
      aria-hidden={phase !== name || undefined}
    >
      {content}
    </span>
  );
  return (
    <button
      className="button primary table-save-button"
      data-phase={phase}
      disabled={disabled}
      onClick={onSave}
    >
      <span
        className="save-morph"
        style={width === null ? undefined : ({ width } satisfies CSSProperties)}
      >
        {face(
          "idle",
          <>
            {production ? "Save changes to production" : "Save changes"}{" "}
            <kbd>{primaryModifierLabel} S</kbd>
          </>,
        )}
        {face(
          "saving",
          <>
            <Loader2 size={14} className="spin" aria-hidden="true" />
            Saving…
          </>,
        )}
        {face(
          "saved",
          <>
            <Check size={14} strokeWidth={2.5} aria-hidden="true" />
            Saved
          </>,
        )}
      </span>
    </button>
  );
}
