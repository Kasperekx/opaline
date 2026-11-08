import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { tableRowKey } from "../../src/features/table/table-change-set";
import type { TableDataController } from "../../src/features/table/useTableData";
import { advanceGuide, guidePhase, initialGuideProgress } from "./guide-state";

/** Guidance observes the desktop controller; it never edits or saves for the visitor. */
export function GuidedTableGuide({
  table,
  memoryOnly,
}: {
  table: TableDataController;
  memoryOnly: boolean;
}) {
  const { changes, data } = table;
  const snapshot = {
    signature: changes.summary.rows.length
      ? JSON.stringify(changes.summary.rows)
      : null,
    editing: changes.activeCell !== null,
    reviewing: changes.review !== null,
    saved: changes.saved,
  };
  const [progress, setProgress] = useState(initialGuideProgress);
  const next = advanceGuide(progress, snapshot);
  // Remember observed review/save transitions, including the native transient
  // success state, without delaying the guide by an effect or a timer.
  if (next !== progress) setProgress(next);
  const phase = guidePhase(next, snapshot);
  const step = { edit: 0, review: 1, save: 2, done: 3 }[phase];
  const row = data?.rows[0];
  const roleIndex =
    data?.columns.findIndex((column) => column.name === "role") ?? -1;
  const nameIndex =
    data?.columns.findIndex((column) => column.name === "name") ?? -1;
  const name = row?.values[nameIndex] ?? "a team member";
  const canStart = Boolean(data?.editable && row && roleIndex >= 0);
  const locked = table.busy || changes.disabled;
  const message = table.error
    ? "The sample data couldn’t load. Reset the demo to try again."
    : changes.error
      ? "Your draft is still here. Check the error below before saving."
      : changes.summary.invalid
        ? "Check the highlighted value before continuing. Your changes are not saved."
        : snapshot.editing
          ? "Finish your edit to stage it. Nothing is saved yet."
          : phase === "done"
            ? memoryOnly
              ? "Changes applied to this demo. Browser storage is unavailable."
              : "Saved in this browser. Keep exploring, or reset for a fresh start."
            : phase === "save"
              ? "Happy with the difference? Choose Save changes below."
              : phase === "review"
                ? "Your changes are staged, not saved. Open Review to see the difference."
                : canStart
                  ? `Try changing ${name}’s role. You decide when to save.`
                  : table.busy
                    ? "Loading the sample table…"
                    : "No sample rows left. Reset the demo to start again.";

  const beginEdit = () => {
    if (!canStart || locked || !data || !row) return;
    changes.start(tableRowKey(data.columns, row), roleIndex, row);
  };

  return (
    <div className="demo-walkthrough" data-phase={phase}>
      <ol className="demo-steps" aria-label="Try the editing workflow">
        {["Edit", "Review", "Save locally"].map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            data-complete={step > index}
          >
            <span aria-hidden="true">
              {step > index ? <Check size={12} /> : `0${index + 1}`}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <div className="demo-prompt">
        <p role="status" aria-live="polite" aria-atomic="true">
          {message}
        </p>
        {!snapshot.editing &&
          (phase === "edit" || phase === "done") &&
          canStart && (
            <button
              className="demo-start"
              onClick={beginEdit}
              disabled={locked}
            >
              {phase === "done" ? "Try another edit" : "Change a role"}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
      </div>
    </div>
  );
}
