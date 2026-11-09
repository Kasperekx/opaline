import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  KeyRound,
  Search,
  X,
} from "lucide-react";
import type { ColumnInfo } from "../../shared/types/database";
import type { DisplayRow } from "./TableGridCell";
import { useEntrance } from "../../shared/hooks/useEntrance";
import { TableCellMenu, type CellMenuAction } from "./TableCellMenu";
import { columnEditorKind, validateColumnValue } from "./column-editor";
import type { InsertCellValue } from "./table-types";

// Columns that usually name a record, most human-readable first.
const titleColumns = [
  "display_name",
  "full_name",
  "name",
  "title",
  "label",
  "username",
  "email",
];

/** A readable title for a row. Falls back to the primary key, then the row
 * number. */
function recordTitle(row: DisplayRow, columns: ColumnInfo[], index: number) {
  const text = (position: number) => {
    const value = row.values[position];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const named = titleColumns
    .map((name) =>
      columns.findIndex((column) => column.name.toLowerCase() === name),
    )
    .find((position) => position >= 0 && text(position) !== null);
  if (named !== undefined) return text(named)!;
  const key = columns.findIndex((column) => column.primaryKey);
  const keyValue = key >= 0 ? text(key) : null;
  return keyValue ? `${columns[key]!.name} ${keyValue}` : `Row ${index + 1}`;
}

// PostgreSQL's short type names, as psql and TablePlus show them.
const shortTypes: [RegExp, string][] = [
  [/^integer$/, "int4"],
  [/^bigint$/, "int8"],
  [/^smallint$/, "int2"],
  [/^boolean$/, "bool"],
  [/^real$/, "float4"],
  [/^double precision$/, "float8"],
  [/^timestamp(\(\d+\))? with time zone$/, "timestamptz$1"],
  [/^timestamp(\(\d+\))? without time zone$/, "timestamp$1"],
  [/^time(\(\d+\))? with time zone$/, "timetz$1"],
  [/^time(\(\d+\))? without time zone$/, "time$1"],
  [/^character varying/, "varchar"],
  [/^character(?=\(|$)/, "char"],
  [/^bit varying/, "varbit"],
];
export function shortTypeName(dataType: string) {
  for (const [pattern, short] of shortTypes)
    if (pattern.test(dataType)) return dataType.replace(pattern, short);
  return dataType;
}

const shown = (value: InsertCellValue) =>
  value === undefined
    ? "DEFAULT"
    : value === null
      ? "NULL"
      : value === ""
        ? "Empty string"
        : value;

type FieldProps = {
  column: ColumnInfo;
  value: InsertCellValue;
  original: InsertCellValue | null;
  changed: boolean;
  editable: boolean;
  error: string | null;
  onStage: (value: InsertCellValue) => void;
  onMenu: (anchor: HTMLElement) => void;
};

/** One column of the record: caption (name · short type), then the value in
 * a field that wraps long text. Edits stage like a cell edit: Return or
 * leaving the field stages, Escape restores, Shift-Return adds a line. */
function RecordField({
  column,
  value,
  original,
  changed,
  editable,
  error,
  onStage,
  onMenu,
}: FieldProps) {
  const id = useId();
  const kind = columnEditorKind(column);
  const area = useRef<HTMLTextAreaElement>(null);
  // A draft exists only while the user types; otherwise the field shows the
  // staged or loaded value.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (typeof value === "string" ? value : "");
  const draftError =
    draft !== null && draft !== value
      ? validateColumnValue(column, draft)
      : null;
  const message = draftError ?? error;
  useLayoutEffect(() => {
    // Grow with the value (uuid and timestamps wrap onto a second line).
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);
  const stage = () => {
    if (draft !== null && draft !== value) onStage(draft);
    setDraft(null);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (!draftError) stage();
    } else if (event.key === "Escape" && draft !== null) {
      // Restore first; a second Escape closes the inspector.
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    }
  };
  const choice = kind === "boolean" || kind === "enum";
  const options =
    kind === "boolean"
      ? [
          { value: "true", label: "TRUE" },
          { value: "false", label: "FALSE" },
        ]
      : column.enumValues.map((option) => ({ value: option, label: option }));
  return (
    <div
      className={[
        "record-field",
        changed ? "changed" : "",
        message ? "invalid" : "",
      ].join(" ")}
      data-value-kind={kind}
    >
      <div className="record-field-caption">
        <label htmlFor={id}>
          {column.name}
          {column.primaryKey && <KeyRound size={11} aria-label="Primary key" />}
        </label>
        <span
          title={column.dataType + (column.primaryKey ? " · Primary key" : "")}
        >
          {shortTypeName(column.dataType)}
        </span>
      </div>
      <div className="record-value">
        {choice ? (
          <>
            <select
              id={id}
              aria-label={`Record value for ${column.name}`}
              disabled={!editable}
              value={value === null || value === undefined ? "" : value}
              onChange={(event) =>
                onStage(event.target.value === "" ? null : event.target.value)
              }
            >
              {(value === null || value === undefined || column.nullable) && (
                <option value="" disabled={!column.nullable}>
                  {value === undefined ? "DEFAULT" : "NULL"}
                </option>
              )}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronsUpDown
              className="record-select-icon"
              size={12}
              aria-hidden="true"
            />
          </>
        ) : (
          <textarea
            ref={area}
            id={id}
            rows={1}
            aria-label={`Record value for ${column.name}`}
            aria-invalid={Boolean(message) || undefined}
            readOnly={!editable}
            spellCheck={kind === "text"}
            placeholder={
              value === undefined
                ? column.identity || column.generated
                  ? "AUTO"
                  : "DEFAULT"
                : value === null
                  ? "NULL"
                  : value === ""
                    ? "Empty string"
                    : undefined
            }
            value={text}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={keyDown}
            onBlur={stage}
          />
        )}
        <button
          type="button"
          className="record-value-menu"
          aria-label={`Actions for ${column.name}`}
          aria-haspopup="menu"
          title="Edit, inspect or copy"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            stage();
            onMenu(event.currentTarget);
          }}
        >
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </div>
      {message && (
        <small className="record-field-error" role="alert">
          {message}
        </small>
      )}
      {changed && (
        <small>
          Unsaved · previous value: <span>{shown(original)}</span>
        </small>
      )}
    </div>
  );
}

export function TableRecordInspector({
  row,
  columns,
  index,
  count,
  animate = true,
  focusOnOpen = true,
  canEdit,
  canEditInGrid = canEdit,
  onStage,
  onRevert,
  onEditInGrid,
  onInspectValue,
  onCopyValue,
  onMove,
  onClose,
  onDismiss = onClose,
}: {
  row: DisplayRow;
  columns: ColumnInfo[];
  index: number;
  count: number;
  /** Slide in once. Off for Quick Look (Space), which must feel instant. */
  animate?: boolean;
  /** Move focus into the panel. Off when the grid should keep arrow keys. */
  focusOnOpen?: boolean;
  canEdit: (column: number) => boolean;
  /** The column's cell can open its editor (e.g. it is not hidden). */
  canEditInGrid?: (column: number) => boolean;
  /** Stage a value like a cell edit; nothing is written until Save. */
  onStage: (column: number, value: InsertCellValue) => void;
  onRevert: (column: number) => void;
  onEditInGrid: (column: number) => void;
  onInspectValue: (column: number) => void;
  onCopyValue: (column: number) => void;
  onMove: (offset: number) => void;
  /** Close button: turn the inspector off until it is shown again. */
  onClose: () => void;
  /** Escape: deselect the row, which closes the inspector. */
  onDismiss?: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    actions: CellMenuAction[];
    anchor: HTMLElement;
  } | null>(null);
  const title = recordTitle(row, columns, index);
  const entrance = useEntrance();
  const [animated] = useState(animate);
  useEffect(() => {
    if (focusOnOpen) close.current?.focus();
  }, [focusOnOpen]);
  const needle = query.trim().toLowerCase();
  const fields = columns
    .map((column, position) => ({ column, position }))
    .filter(
      ({ column }) =>
        !needle ||
        column.name.toLowerCase().includes(needle) ||
        shortTypeName(column.dataType).toLowerCase().includes(needle),
    );
  const openMenu = (position: number, anchor: HTMLElement) => {
    const column = columns[position]!;
    const value = row.values[position];
    const changed = Boolean(
      row.original && value !== row.original.values[position],
    );
    const rect = anchor.getBoundingClientRect();
    setMenu({
      x: rect.right - 220,
      y: rect.bottom + 4,
      anchor,
      actions: [
        {
          label: "Edit in table cell",
          disabled: !canEdit(position) || !canEditInGrid(position),
          run: () => onEditInGrid(position),
        },
        {
          label: "Inspect value",
          run: () => onInspectValue(position),
        },
        {
          label: "Copy value",
          run: () => onCopyValue(position),
        },
        {
          label: "Set to NULL",
          groupStart: true,
          disabled: !canEdit(position) || !column.nullable || value === null,
          run: () => onStage(position, null),
        },
        {
          label: "Revert change",
          disabled: !changed || !canEdit(position),
          run: () => onRevert(position),
        },
      ],
    });
  };
  return (
    <aside
      {...(animated ? entrance : undefined)}
      className="grid-value-panel record-inspector"
      aria-label="Record inspector"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          if (event.target instanceof HTMLInputElement && event.target.value)
            setQuery("");
          else onDismiss();
        }
      }}
    >
      <header>
        <label className="search-capsule record-field-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search for field"
            placeholder="Search for field…"
            value={query}
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          ref={close}
          className="icon-button"
          aria-label="Close record inspector"
          title="Close · the inspector stays off until you show it again"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>
      <nav aria-label="Records on this page">
        <button
          className="icon-button"
          aria-label="Previous record"
          disabled={index === 0}
          onClick={() => {
            if (index === 1) close.current?.focus();
            onMove(-1);
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <div>
          <strong title={title}>{title}</strong>
          <small>
            <span>
              Row {index + 1} of {count}
            </span>
            {row.change?.deleted ? (
              <span className="record-status">
                Marked for deletion · not saved
              </span>
            ) : (
              row.change &&
              row.original &&
              row.values.some(
                (value, position) => value !== row.original!.values[position],
              ) && (
                <span className="record-status">Local changes · not saved</span>
              )
            )}
            {!row.original && (
              <span className="record-status">New row · not saved</span>
            )}
          </small>
        </div>
        <button
          className="icon-button"
          aria-label="Next record"
          disabled={index === count - 1}
          onClick={() => {
            if (index === count - 2) close.current?.focus();
            onMove(1);
          }}
        >
          <ChevronRight size={16} />
        </button>
      </nav>
      <div
        className="record-fields"
        role="group"
        aria-label={`Fields of ${title}`}
      >
        {fields.map(({ column, position }) => {
          const value = row.values[position];
          const original = row.original ? row.original.values[position] : null;
          return (
            <RecordField
              key={`${row.key}:${column.name}`}
              column={column}
              value={value}
              original={original}
              changed={Boolean(row.original && value !== original)}
              editable={canEdit(position)}
              error={
                row.change && value !== original
                  ? validateColumnValue(column, value)
                  : null
              }
              onStage={(next) => onStage(position, next)}
              onMenu={(anchor) => openMenu(position, anchor)}
            />
          );
        })}
        {fields.length === 0 && (
          <p className="record-fields-empty">No fields match “{query}”.</p>
        )}
      </div>
      {menu && (
        <TableCellMenu
          x={menu.x}
          y={menu.y}
          actions={menu.actions}
          onClose={() => {
            menu.anchor.focus();
            setMenu(null);
          }}
        />
      )}
    </aside>
  );
}
