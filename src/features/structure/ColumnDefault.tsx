import type { ColumnDraft } from "../../shared/types/structure";

export function ColumnDefault({
  column,
  index,
  disabled,
  originalDefault,
  onChange,
}: {
  column: ColumnDraft;
  index: number;
  disabled: boolean;
  originalDefault: string | null;
  onChange: (patch: Partial<ColumnDraft>) => void;
}) {
  const mode =
    column.defaultMode ??
    (column.original
      ? "keep"
      : column.defaultValue === null
        ? "drop"
        : "literal");
  return (
    <div className="schema-column-default">
      <select
        aria-label={`Column ${index + 1} default action`}
        value={mode}
        disabled={disabled}
        onChange={(event) =>
          onChange({
            defaultMode: event.target.value as ColumnDraft["defaultMode"],
            defaultValue:
              event.target.value === "keep"
                ? originalDefault
                : event.target.value === "literal"
                  ? ""
                  : null,
          })
        }
      >
        {column.original && <option value="keep">Keep existing</option>}
        <option value="drop">No default</option>
        <option value="literal">Literal value</option>
        <option value="currentTimestamp">Current timestamp</option>
        <option value="randomUuid">Random UUID</option>
      </select>
      {mode === "keep" ? (
        <small title={column.defaultValue ?? "No default"}>
          {column.defaultValue ?? "No default"}
        </small>
      ) : mode === "literal" ? (
        <input
          aria-label={`Column ${index + 1} default literal`}
          value={column.defaultValue ?? ""}
          disabled={disabled}
          placeholder="Empty string is a value"
          onChange={(e) => onChange({ defaultValue: e.target.value })}
        />
      ) : null}
    </div>
  );
}
