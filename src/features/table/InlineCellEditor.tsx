import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { ColumnInfo } from "../../shared/types/database";
import { TypedValueControl } from "./TableCells";
import { columnEditorKind } from "./column-editor";
import type { InsertCellValue } from "./table-types";

type Props = {
  column: ColumnInfo;
  value: InsertCellValue;
  error: string | null;
  anchor: HTMLElement | null;
  isNew: boolean;
  onChange: (value: InsertCellValue) => void;
  onCommit: () => void;
  onCancel: () => void;
  onBlur: () => void;
  onMove: (direction: number) => boolean;
};

export function InlineCellEditor({
  column,
  value,
  error,
  anchor,
  isNew,
  onChange,
  onCommit,
  onCancel,
  onBlur,
  onMove,
}: Props) {
  const errorId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded] = useState(
    () =>
      columnEditorKind(column) === "json" ||
      (typeof value === "string" &&
        (value.length > 140 || value.includes("\n"))),
  );
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!expanded || !anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(520, window.innerWidth - 32);
      setPosition({
        width,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: Math.max(16, Math.min(rect.bottom, window.innerHeight - 320)),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [expanded, anchor]);
  useLayoutEffect(() => {
    const input = ref.current?.querySelector<HTMLElement>(
      "input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button",
    );
    input?.focus();
  }, []);
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (
      event.key === "Enter" &&
      event.target instanceof Element &&
      event.target.closest("button")
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
    if (
      event.key === "Enter" &&
      (!expanded || event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!error) onCommit();
    }
    if (event.key === "Tab" && !expanded) {
      if (error) {
        event.preventDefault();
        return;
      }
      if (onMove(event.shiftKey ? -1 : 1)) event.preventDefault();
      else onCommit();
    }
  };
  const content = (
    <div
      ref={ref}
      className={`inline-cell-editor ${expanded ? "expanded" : ""} ${error ? "invalid" : ""}`}
      style={expanded ? position : undefined}
      aria-label={`Edit ${column.name}`}
      aria-describedby={error ? errorId : undefined}
      onKeyDown={keyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          onBlur();
      }}
    >
      {expanded && (
        <header>
          <strong>{column.name}</strong>
          <span>{column.dataType}</span>
        </header>
      )}
      <TypedValueControl
        column={column}
        value={value ?? ""}
        disabled={value === null || value === undefined}
        invalid={Boolean(error)}
        onChange={onChange}
        multiline={expanded}
        rawNumeric
      />
      <div className="inline-value-options">
        {value === undefined && (
          <button onClick={() => onChange("")}>DEFAULT · Override</button>
        )}
        {column.nullable && (
          <button
            aria-label={`Set ${column.name} ${value === null ? "to a value" : "to NULL"}`}
            aria-pressed={value === null}
            onClick={() => onChange(value === null ? "" : null)}
          >
            NULL
          </button>
        )}
        {isNew && column.defaultValue !== null && value !== undefined && (
          <button onClick={() => onChange(undefined)}>DEFAULT</button>
        )}
      </div>
      {error && (
        <small className="inline-value-error" id={errorId} role="alert">
          {error}
        </small>
      )}
      {expanded && (
        <footer>
          <span>Changes stay local until saved</span>
          <button onClick={onCancel}>Cancel</button>
          <button disabled={Boolean(error)} onClick={onCommit}>
            Apply
          </button>
        </footer>
      )}
    </div>
  );
  return expanded ? createPortal(content, document.body) : content;
}
