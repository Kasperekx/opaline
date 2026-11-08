import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Search } from "lucide-react";
import type { ColumnInfo } from "../../shared/types/database";

type Match = { column: ColumnInfo; rank: number; start: number; end: number };

/** Ranks a column name for a typed query: prefix, then word start (after
 * "_" or "."), then substring, then the same ignoring underscores. */
export function matchColumn(column: ColumnInfo, query: string): Match | null {
  const name = column.name.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return { column, rank: 0, start: 0, end: 0 };
  const at = name.indexOf(needle);
  if (at === 0) return { column, rank: 0, start: 0, end: needle.length };
  if (at > 0) {
    const wordStart = /[_.\s-]/.test(name[at - 1]!);
    return {
      column,
      rank: wordStart ? 1 : 2,
      start: at,
      end: at + needle.length,
    };
  }
  const loose = needle.replace(/[_\s-]/g, "");
  if (loose && name.replace(/[_\s-]/g, "").includes(loose))
    return { column, rank: 3, start: 0, end: 0 };
  return null;
}

export function rankColumns(columns: ColumnInfo[], query: string): Match[] {
  return columns
    .map((column) => matchColumn(column, query))
    .filter((match): match is Match => match !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (query.trim() ? a.column.name.length - b.column.name.length : 0),
    );
}

/** Columns: find a column, jump to it, show or hide it. One surface, keyboard
 * first: ↑↓ choose, Return jumps, ⌥Return toggles visibility, Esc closes. */
export function TableColumnsPopover({
  anchor,
  columns,
  hidden,
  onVisible,
  onShowAll,
  onJump,
  onClose,
}: {
  anchor: HTMLElement | null;
  columns: ColumnInfo[];
  hidden: string[];
  onVisible: (name: string, visible: boolean) => void;
  onShowAll: () => void;
  onJump: (name: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const matches = rankColumns(columns, query);
  const hiddenSet = new Set(hidden);
  const visibleCount = columns.filter(
    (column) => !hiddenSet.has(column.name),
  ).length;
  const current = matches[Math.min(active, matches.length - 1)];

  useLayoutEffect(() => {
    if (!anchor || !panel.current) return;
    const box = anchor.getBoundingClientRect();
    const width = panel.current.offsetWidth;
    setPosition({
      top: box.bottom + 8,
      left: Math.max(
        8,
        Math.min(box.right - width, window.innerWidth - width - 8),
      ),
    });
  }, [anchor]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [anchor, onClose]);
  useEffect(() => {
    panel.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const toggle = (name: string) => {
    const visible = hiddenSet.has(name);
    if (!visible && visibleCount <= 1) return; // keep one column on screen
    onVisible(name, visible);
  };
  const jump = (name: string) => {
    if (hiddenSet.has(name)) onVisible(name, true);
    onJump(name);
  };

  return createPortal(
    <div
      ref={panel}
      className="table-columns-popover"
      role="dialog"
      aria-label="Columns"
      style={position}
    >
      <label className="table-columns-search">
        <Search size={14} aria-hidden="true" />
        <input
          autoFocus
          role="combobox"
          aria-label="Find column"
          aria-expanded="true"
          aria-controls={id}
          aria-activedescendant={
            current ? `${id}-${current.column.name}` : undefined
          }
          placeholder="Find column"
          title="↑↓ choose · Return goes to the column · Option-Return shows or hides it"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((index) =>
                matches.length
                  ? (index + step + matches.length) % matches.length
                  : 0,
              );
            } else if (event.key === "Enter" && current) {
              event.preventDefault();
              if (event.altKey) toggle(current.column.name);
              else jump(current.column.name);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
        />
      </label>
      <ul id={id} role="listbox" aria-label="Table columns">
        {matches.map(({ column, start, end }, index) => {
          const shown = !hiddenSet.has(column.name);
          return (
            <li
              key={column.name}
              id={`${id}-${column.name}`}
              role="option"
              aria-selected={index === active}
              data-index={index}
              className={index === active ? "active" : undefined}
              onPointerMove={() => setActive(index)}
            >
              <input
                type="checkbox"
                aria-label={`Show ${column.name}`}
                checked={shown}
                disabled={shown && visibleCount <= 1}
                tabIndex={-1}
                onChange={() => toggle(column.name)}
              />
              <button
                type="button"
                tabIndex={-1}
                className={shown ? undefined : "is-hidden"}
                title={`Go to ${column.name}`}
                onClick={() => jump(column.name)}
              >
                <span className="table-columns-name">
                  {column.primaryKey && (
                    <KeyRound size={11} aria-hidden="true" />
                  )}
                  {end > start ? (
                    <>
                      {column.name.slice(0, start)}
                      <b>{column.name.slice(start, end)}</b>
                      {column.name.slice(end)}
                    </>
                  ) : (
                    column.name
                  )}
                </span>
                <small>{column.dataType}</small>
              </button>
            </li>
          );
        })}
        {matches.length === 0 && (
          <li className="table-columns-empty" role="presentation">
            No column matches “{query.trim()}”
          </li>
        )}
      </ul>
      <footer>
        <span>
          {visibleCount} of {columns.length} shown
        </span>
        <button
          type="button"
          className="button ghost compact"
          disabled={visibleCount === columns.length}
          onClick={onShowAll}
        >
          Show all
        </button>
      </footer>
    </div>,
    document.body,
  );
}
