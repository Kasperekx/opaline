import { useRef, useState } from "react";
import {
  Braces,
  Copy,
  CopyPlus,
  PanelRight,
  PencilLine,
  Trash2,
  X,
} from "lucide-react";
import { BulkUpdateDialog } from "./BulkUpdateDialog";
import {
  initialColumnValue,
  validateColumnValue,
  writableColumns,
} from "./column-editor";
import type { TableDataController } from "./useTableData";
import type { TableTab } from "../query/query-types";
import { useDatabaseSession } from "../connections/SessionContext";
import { useWorkRisk } from "../../shared/safety/WorkSafety";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { primaryModifierLabel } from "../../shared/lib/platform";

/** Commands that need the grid (display values, Quick Look). */
export type SelectionCommands = {
  copyRows: (json: boolean) => void;
  inspectRow: () => void;
};

/** The selected row that single-row actions (Duplicate) apply to. */
export function singleSelectedRow(table: TableDataController) {
  const data = table.data;
  if (!data || table.selectedCount !== 1) return null;
  const index = data.rows.findIndex((_, position) =>
    table.isRowSelected(position),
  );
  const key = index >= 0 ? table.rowSelectionKey(index) : undefined;
  if (!key) return null;
  const change = table.changes.rows.find((row) => row.key === key);
  return { key, original: data.rows[index], deleted: Boolean(change?.deleted) };
}

/** State for the selection segment and its "Set value…" popover. Lives in
 * the always-mounted bar so the unstaged value survives the bar's motion. */
export function useSelectionActions(
  table: TableDataController,
  tab: TableTab,
  locked: boolean,
  commands?: SelectionCommands,
) {
  const { session } = useDatabaseSession();
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState<{
    column: number;
    value: string | null;
  } | null>(null);
  const columns = table.data?.columns ?? [];
  useWorkRisk({
    sessionId: session.id,
    tabId: tab.id,
    label: "Unstaged bulk value",
    dirty: draft !== null,
    discard: () => setDraft(null),
  });
  const close = () => {
    setDraft(null);
    anchor.current?.focus();
  };
  const popover = draft && (
    <BulkUpdateDialog
      open
      anchor={anchor.current}
      columns={columns}
      columnIndex={draft.column}
      value={draft.value}
      rowCount={table.selectedCount}
      error={validateColumnValue(columns[draft.column], draft.value)}
      mutationError={table.changes.error?.message ?? null}
      busy={locked}
      onColumnChange={(column) =>
        setDraft({ column, value: initialColumnValue(columns[column]) })
      }
      onValueChange={(value) => setDraft({ ...draft, value })}
      onCancel={close}
      onConfirm={() => {
        if (
          table.changes.stageMany(table.selectedRows, draft.column, draft.value)
        ) {
          setDraft(null);
          table.clearSelection();
        }
      }}
    />
  );
  return {
    popover,
    commands,
    anchorRef: anchor,
    setValueOpen: draft !== null,
    toggleSetValue: () => {
      if (draft) return close();
      const column = writableColumns(columns)[0];
      if (column)
        setDraft({
          column: columns.indexOf(column),
          value: initialColumnValue(column),
        });
    },
  };
}

/** Selection segment of the contextual bar: count, the row actions, an
 * overflow menu and Clear. Labels collapse to icons in narrow windows (see
 * inline-editing.css); every button keeps its accessible name. */
export function SelectionSegment({
  table,
  locked,
  commands,
  anchorRef,
  setValueOpen,
  toggleSetValue,
}: {
  table: TableDataController;
  locked: boolean;
} & Omit<ReturnType<typeof useSelectionActions>, "popover">) {
  const columns = table.data?.columns ?? [];
  const editable = Boolean(table.data?.editable) && !locked;
  const count = table.selectedCount;
  const single = singleSelectedRow(table);
  const canDuplicate =
    Boolean(single) &&
    !single?.deleted &&
    Boolean(table.data?.insertable) &&
    !locked;
  return (
    <div
      className="table-selection-segment"
      role="group"
      aria-label="Selected row actions"
    >
      <strong
        role="status"
        title="Shift-click selects a range of cells · Double-click or Return edits a cell"
      >
        {count} {count === 1 ? "row" : "rows"} selected
      </strong>
      <button
        className="table-bar-action"
        aria-label="Copy"
        title={`Copy selected rows (${primaryModifierLabel} C)`}
        disabled={!commands}
        onClick={() => commands?.copyRows(false)}
      >
        <Copy size={14} aria-hidden="true" />
        <span className="table-bar-label">Copy</span>
      </button>
      <button
        className="table-bar-action"
        aria-label="Duplicate"
        title={
          canDuplicate
            ? `Duplicate as a new local row (${primaryModifierLabel} D)`
            : count > 1
              ? "Duplicate works on one row at a time"
              : "This row cannot be duplicated here"
        }
        disabled={!canDuplicate}
        onClick={() => {
          if (single && canDuplicate)
            table.changes.duplicate(single.key, single.original);
        }}
      >
        <CopyPlus size={14} aria-hidden="true" />
        <span className="table-bar-label">Duplicate</span>
      </button>
      <button
        ref={anchorRef}
        className="table-bar-action"
        aria-label="Set value…"
        aria-haspopup="dialog"
        aria-expanded={setValueOpen}
        title="Stage one value for a column on every selected row"
        disabled={!editable || !writableColumns(columns).length}
        onClick={toggleSetValue}
      >
        <PencilLine size={14} aria-hidden="true" />
        <span className="table-bar-label">Set value…</span>
      </button>
      <button
        className="table-bar-action danger"
        aria-label="Mark for deletion"
        title={`Stage the selected rows for deletion (${primaryModifierLabel} ⌫). Nothing is deleted until you save.`}
        disabled={!editable}
        onClick={() => {
          if (table.changes.stageMany(table.selectedRows))
            table.clearSelection();
        }}
      >
        <Trash2 size={14} aria-hidden="true" />
        <span className="table-bar-label">Mark for deletion</span>
      </button>
      <ActionMenu
        label="More actions"
        placement="above"
        triggerClassName="table-bar-action icon-only"
        disabled={!commands}
        actions={[
          {
            label: "Copy as JSON",
            icon: Braces,
            onSelect: () => commands?.copyRows(true),
          },
          {
            label: "Inspect record",
            detail: "Space",
            icon: PanelRight,
            onSelect: () => commands?.inspectRow(),
          },
        ]}
      />
      <button
        className="table-bar-action icon-only clear"
        aria-label="Clear selection"
        title="Clear selection (Esc)"
        disabled={locked}
        onClick={table.clearSelection}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
