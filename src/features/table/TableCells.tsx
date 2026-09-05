import { AlertCircle } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { ColumnInfo } from "../../shared/types/database";
import { columnEditorKind, databaseValue, inputValue } from "./column-editor";
import type { InsertCellValue } from "./table-types";

type EditableCellProps = {
  column: ColumnInfo;
  value: string | null;
  autoFocus?: boolean;
  onChange: (value: string | null) => void;
  onCommit: () => void;
  onCancel: () => void;
  onUseDefault?: () => void;
  error?: string | null;
};

export function EditableCell({
  column,
  value,
  autoFocus,
  onChange,
  onCommit,
  onCancel,
  onUseDefault,
  error,
}: EditableCellProps) {
  if (column.identity || column.generated) return <CellValue value={value} />;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") onCancel();
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
  };

  return (
    <div
      className={`cell-editor ${value === null ? "is-null" : ""} ${error ? "invalid" : ""}`}
    >
      <TypedValueControl
        column={column}
        value={value ?? ""}
        disabled={value === null}
        autoFocus={autoFocus}
        invalid={Boolean(error)}
        onChange={(nextValue) => onChange(nextValue)}
        onKeyDown={handleKeyDown}
      />
      {error && (
        <span
          className="cell-editor-error"
          role="alert"
          title={error}
          aria-label={error}
        >
          <AlertCircle size={13} />
        </span>
      )}
      <div className="cell-editor-options">
        {column.nullable && (
          <button
            type="button"
            aria-label={
              value === null
                ? `Set a value for ${column.name}`
                : `Set ${column.name} to NULL`
            }
            aria-pressed={value === null}
            onClick={() => onChange(value === null ? "" : null)}
          >
            NULL
          </button>
        )}
        {onUseDefault && (
          <button
            type="button"
            aria-label={`Use the PostgreSQL default for ${column.name}`}
            onClick={onUseDefault}
          >
            DEFAULT
          </button>
        )}
      </div>
    </div>
  );
}

type TypedValueControlProps = {
  column: ColumnInfo;
  value: string;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  rawNumeric?: boolean;
  multiline?: boolean;
};

export function TypedValueControl({
  column,
  value,
  disabled,
  autoFocus,
  invalid,
  onChange,
  onKeyDown,
  rawNumeric = false,
  multiline = false,
}: TypedValueControlProps) {
  const kind = columnEditorKind(column);
  const common = {
    autoFocus,
    disabled,
    "aria-invalid": invalid || undefined,
    "aria-label": `Value for ${column.name}`,
    onKeyDown,
  };

  if (kind === "boolean") {
    return (
      <select
        {...common}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {value !== "true" && value !== "false" && (
          <option value="" disabled>
            Select a value…
          </option>
        )}
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (kind === "enum") {
    return (
      <select
        {...common}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!column.enumValues.includes(value) && (
          <option value="" disabled>
            Select a value…
          </option>
        )}
        {column.enumValues.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (kind === "json" || multiline) {
    return (
      <textarea
        {...common}
        rows={1}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  const inputType =
    kind === "date"
      ? "date"
      : kind === "datetime"
        ? "datetime-local"
        : kind === "time"
          ? "time"
          : !rawNumeric && (kind === "integer" || kind === "number")
            ? "number"
            : "text";
  return (
    <input
      {...common}
      type={inputType}
      step={
        kind === "integer"
          ? "1"
          : kind === "number" || kind === "time"
            ? "any"
            : undefined
      }
      inputMode={
        kind === "integer" || kind === "number" ? "decimal" : undefined
      }
      spellCheck={kind === "text"}
      value={inputValue(column, value)}
      onChange={(event) => onChange(databaseValue(column, event.target.value))}
    />
  );
}

type InsertCellProps = {
  column: ColumnInfo;
  value: InsertCellValue;
  autoFocus: boolean;
  onChange: (value: InsertCellValue) => void;
  onCommit: () => void;
  onCancel: () => void;
  error?: string | null;
};

export function InsertCell({
  column,
  value,
  autoFocus,
  onChange,
  onCommit,
  onCancel,
  error,
}: InsertCellProps) {
  if (column.identity || column.generated) {
    return (
      <span
        className="insert-cell-managed"
        title={
          column.generated
            ? "Computed by PostgreSQL"
            : "Generated by PostgreSQL"
        }
      >
        {column.generated ? "GENERATED" : "AUTO"}
      </span>
    );
  }
  if (value === undefined) {
    return (
      <button
        type="button"
        className="insert-cell-default"
        title={column.defaultValue ?? "Use the PostgreSQL default"}
        onClick={() => onChange("")}
      >
        <span>DEFAULT</span>
        <small>Click to override</small>
      </button>
    );
  }
  return (
    <EditableCell
      column={column}
      value={value}
      autoFocus={autoFocus}
      onChange={onChange}
      onCommit={onCommit}
      onCancel={onCancel}
      error={error}
      onUseDefault={
        column.defaultValue !== null ? () => onChange(undefined) : undefined
      }
    />
  );
}

export function CellValue({ value }: { value: string | null }) {
  return value === null ? (
    <span className="table-null">NULL</span>
  ) : (
    <span className="table-cell-value" title={value}>
      {value}
    </span>
  );
}

type SelectionCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
};

export function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  disabled,
  onChange,
}: SelectionCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      className="table-selection-checkbox"
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
    />
  );
}
