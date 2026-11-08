import { useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { BookMarked, Eye, Search, Table2, X } from "lucide-react";
import { Sheet } from "../../shared/components/Sheet";
import { useOptionalDatabaseSession } from "../connections/SessionContext";
import { primaryModifierLabel } from "../../shared/lib/platform";
import {
  highlightRuns,
  peekPaletteScope,
  rankPalette,
  requestPaletteScope,
  type CommandAction,
  type PaletteScope,
  type PaletteSection,
  type RankedItem,
} from "./command-palette-model";

export type { CommandAction } from "./command-palette-model";

const sectionIcons: Partial<Record<PaletteSection, typeof Table2>> = {
  Tables: Table2,
  Views: Eye,
  Queries: BookMarked,
};

/** Open Quickly: one field for tables, views, saved queries and commands.
 * Opens and closes without motion (it is used constantly), keeps focus in
 * the field and never runs SQL: tables open through the explorer's path,
 * queries open as editable tabs. */
export function CommandPalette({
  commands,
  onClose,
  initialScope,
}: {
  commands: CommandAction[];
  onClose: () => void;
  initialScope?: PaletteScope;
}) {
  const context = useOptionalDatabaseSession();
  const [scope, setScope] = useState<PaletteScope>(
    () => initialScope ?? peekPaletteScope(),
  );
  // The next open starts unscoped unless its shortcut asks otherwise.
  useEffect(() => () => requestPaletteScope("all"), []);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const { groups, total } = useMemo(
    () => rankPalette(commands, search, scope),
    [commands, search, scope],
  );
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const firstEnabled = flat.findIndex((entry) => !entry.item.disabled);
  const cursorIndex = cursor
    ? flat.findIndex((entry) => entry.key === cursor)
    : -1;
  const index = cursorIndex >= 0 ? cursorIndex : firstEnabled;
  const current = index >= 0 ? flat[index] : undefined;
  const baseId = useId();
  const optionId = (i: number) => `${baseId}-option-${i}`;
  const listId = `${baseId}-list`;

  const positionOf = useMemo(
    () => new Map(flat.map((entry, i) => [entry.key, i])),
    [flat],
  );

  useLayoutEffect(() => {
    if (index < 0) return;
    document
      .getElementById(`${baseId}-option-${index}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [baseId, index]);

  const move = (direction: 1 | -1) => {
    if (!flat.length) return;
    for (let step = 1; step <= flat.length; step += 1) {
      const next = (index + direction * step + flat.length * 2) % flat.length;
      if (!flat[next]!.item.disabled) {
        setCursor(flat[next]!.key);
        return;
      }
    }
  };
  const run = (entry: RankedItem | undefined, alternate = false) => {
    if (!entry || entry.item.disabled) return;
    onClose();
    if (alternate && entry.item.alternate) entry.item.alternate.run();
    else entry.item.run();
  };
  const changeScope = (next: PaletteScope) => {
    setScope(next);
    setCursor(null);
  };

  const primaryHint =
    current && current.section !== "Commands" ? "↩ to open" : "↩ to run";
  const environment = context?.session.environment;
  const alternateKey = primaryModifierLabel === "⌘" ? "⌘↩" : "Ctrl+↩";
  return (
    <Sheet
      className="command-palette"
      showClose={false}
      title={scope === "tables" ? "Open Quickly" : "Commands"}
      subtitle="Current connection · no automatic SQL execution"
      onClose={onClose}
    >
      <div
        className="command-palette-body"
        onKeyDown={(event) => {
          const modifier = event.metaKey || event.ctrlKey;
          const key = event.key.toLowerCase();
          if (modifier && event.shiftKey && (key === "o" || key === "p")) {
            event.preventDefault();
            changeScope(key === "o" ? "tables" : "all");
            return;
          }
          const down =
            event.key === "ArrowDown" ||
            (event.ctrlKey && !event.metaKey && key === "n");
          const up =
            event.key === "ArrowUp" ||
            (event.ctrlKey && !event.metaKey && key === "p");
          if (down || up) {
            event.preventDefault();
            move(down ? 1 : -1);
            return;
          }
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            run(current, modifier);
            return;
          }
          if (
            event.key === "Backspace" &&
            !search &&
            scope !== "all" &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault();
            changeScope("all");
          }
        }}
      >
        <div className="command-search">
          <Search size={20} strokeWidth={1.6} aria-hidden="true" />
          {scope === "tables" && (
            <button
              type="button"
              className="command-scope"
              tabIndex={-1}
              aria-label="Search everything"
              title="Search everything (⌫)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => changeScope("all")}
            >
              Tables
              <X size={10} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
          <input
            data-initial-focus="true"
            aria-label="Find command"
            aria-controls={listId}
            aria-activedescendant={current ? optionId(index) : undefined}
            aria-autocomplete="list"
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={
              scope === "tables"
                ? "Open a table or view"
                : "Open a table, query or command"
            }
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCursor(null);
            }}
          />
          <span className="command-count" aria-hidden="true">
            {total} {total === 1 ? "result" : "results"}
          </span>
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="command-list"
        >
          {groups.map((group) => (
            <div
              role="group"
              aria-labelledby={`${baseId}-${group.title}`}
              className="command-group"
              key={group.title}
            >
              <div
                className="command-group-title"
                id={`${baseId}-${group.title}`}
              >
                {group.title}
              </div>
              {group.items.map((entry) => {
                const i = positionOf.get(entry.key) ?? -1;
                const Icon = sectionIcons[entry.section];
                const { item } = entry;
                return (
                  <button
                    type="button"
                    id={optionId(i)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === i}
                    key={entry.key}
                    disabled={item.disabled}
                    className={`command-option ${i === index ? "selected" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => {
                      if (i !== index && !item.disabled) setCursor(entry.key);
                    }}
                    onClick={(event) =>
                      run(entry, event.metaKey || event.ctrlKey)
                    }
                  >
                    {Icon && (
                      <Icon
                        className="command-icon"
                        size={14}
                        strokeWidth={1.7}
                        aria-hidden="true"
                      />
                    )}
                    <span className="command-label">
                      <span className="command-name">
                        {highlightRuns(item.label, entry.positions).map(
                          (part, at) =>
                            part.match ? (
                              <b key={at}>{part.text}</b>
                            ) : (
                              <span key={at}>{part.text}</span>
                            ),
                        )}
                      </span>
                      {item.detail && (
                        <span className="command-detail">{item.detail}</span>
                      )}
                    </span>
                    {item.meta && (
                      <span className="command-meta">{item.meta}</span>
                    )}
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {!flat.length && (
          <p className="command-empty">
            {search.trim()
              ? `No matches for “${search.trim()}”.`
              : scope === "tables"
                ? "No tables or views in this database yet."
                : "No commands available."}
          </p>
        )}
        <footer className="command-footer">
          {context && (
            <span className="command-session">
              <i
                className={`env-${environment ?? "local"}`}
                aria-hidden="true"
              />
              <b>{context.session.name || context.session.database}</b>
            </span>
          )}
          <span className="command-footer-note">
            {context ? "· " : ""}Never runs SQL
          </span>
          <span className="command-hints" aria-hidden="true">
            ↑↓ to move · {primaryHint}
            {current?.item.alternate
              ? ` · ${alternateKey} ${current.item.alternate.label.toLowerCase()}`
              : ""}{" "}
            · esc to close
          </span>
        </footer>
      </div>
    </Sheet>
  );
}
