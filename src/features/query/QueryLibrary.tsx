import { useCallback, useRef, useState } from "react";
import { ArrowUpRight, BookMarked, Plus, Search, Trash2 } from "lucide-react";
import { ConnectionDialog } from "../connections/ConnectionDialog";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useDatabaseSession } from "../connections/SessionContext";
import { useFormSafety } from "../../shared/safety/useFormSafety";
import { errorMessage } from "../../shared/lib/database-api";
import { useSavedQueries } from "./useSavedQueries";
import "./query-library.css";

export function QueryLibrary({
  sql,
  title,
  onOpen,
  onClose,
}: {
  sql: string;
  title: string;
  onOpen: (sql: string, title: string) => void;
  onClose: () => void;
}) {
  const { session } = useDatabaseSession();
  const library = useSavedQueries(session.workspaceId);
  const [name, setName] = useState(title);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusName = useCallback(
    (node: HTMLInputElement | null) => node?.focus(),
    [],
  );
  const protect = useFormSafety(
    "Bookmark name",
    saving && name !== title,
    false,
  );
  const entries = library.entries.filter((entry) =>
    `${entry.title}\n${entry.sql}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const selected =
    entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const open = () => {
    if (selected)
      protect(() => {
        onOpen(selected.sql, selected.title);
        onClose();
      });
  };
  return (
    <ConnectionDialog
      className="bookmark-dialog"
      title="Bookmarks"
      subtitle="Workspace queries · stored on this device"
      onClose={() => protect(onClose)}
    >
      <div className="bookmark-toolbar">
        <label className="bookmark-search">
          <Search size={16} />
          <input
            ref={searchRef}
            data-initial-focus="true"
            placeholder="Search name or SQL…"
            aria-label="Find saved query"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setDeleting(null);
            }}
          />
        </label>
        <button
          className="button ghost"
          disabled={!sql.trim() || saving || saved}
          title={
            !sql.trim() ? "Open a query with SQL to bookmark it" : undefined
          }
          onClick={() => setSaving(true)}
        >
          <Plus size={15} />
          {saved ? "Bookmarked" : "Bookmark current query"}
        </button>
      </div>
      {saving && (
        <form
          className="bookmark-save"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const id = crypto.randomUUID();
              library.save(name, sql, id);
              setSelectedId(id);
              setSearch("");
              setSaving(false);
              setSaved(true);
              setError(null);
              searchRef.current?.focus();
            } catch (caught) {
              setError(errorMessage(caught));
            }
          }}
        >
          <label>
            Bookmark name
            <input
              ref={focusName}
              aria-label="Saved query name"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button ghost"
            onClick={() =>
              protect(() => {
                setSaving(false);
                setName(title);
                searchRef.current?.focus();
              })
            }
          >
            Cancel
          </button>
          <button className="button primary" disabled={!name.trim()}>
            Save bookmark
          </button>
        </form>
      )}
      {saved && (
        <span className="sr-only" role="status">
          Query bookmarked
        </span>
      )}
      {error && (
        <p role="alert" className="bookmark-error">
          {error}
        </p>
      )}
      <div className="bookmark-body">
        <nav
          className="bookmark-list"
          aria-label="Saved queries"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            if (!items.length) return;
            event.preventDefault();
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        items.length - 1,
                        index + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    );
            items[next].focus();
            items[next].click();
          }}
        >
          <span className="bookmark-count">
            {entries.length} {entries.length === 1 ? "bookmark" : "bookmarks"}
          </span>
          {entries.map((entry) => (
            <button
              key={entry.id}
              aria-pressed={selected?.id === entry.id}
              onClick={() => {
                setSelectedId(entry.id);
                setDeleting(null);
              }}
            >
              <BookMarked size={16} />
              <span>
                <strong>{entry.title}</strong>
                <code>{entry.sql.replace(/\s+/g, " ").slice(0, 100)}</code>
              </span>
            </button>
          ))}
          {!entries.length && (
            <div className="bookmark-empty">
              <BookMarked size={22} />
              <strong>
                {search ? "No matching bookmarks" : "Keep useful queries here"}
              </strong>
              <p>
                {search
                  ? "Try another name or SQL fragment."
                  : "Bookmark a query from the editor to find it again in this workspace."}
              </p>
              {search && (
                <button
                  className="button ghost"
                  onClick={() => {
                    setSearch("");
                    searchRef.current?.focus();
                  }}
                >
                  Clear search
                </button>
              )}
            </div>
          )}
        </nav>
        {selected && (
          <section className="bookmark-preview" aria-label="Bookmark preview">
            <header>
              <span>SQL PREVIEW</span>
              <h3>{selected.title}</h3>
            </header>
            <pre tabIndex={0} aria-label="Saved SQL">
              {selected.sql}
            </pre>
            <footer>
              {deleting === selected.id ? (
                <div
                  className="bookmark-delete"
                  role="group"
                  aria-label="Confirm bookmark deletion"
                >
                  <p>
                    Delete “{selected.title}”? Open query tabs stay unchanged.
                  </p>
                  <button
                    className="button ghost"
                    onClick={() => setDeleting(null)}
                  >
                    Keep bookmark
                  </button>
                  <button
                    className="button danger"
                    onClick={() => {
                      try {
                        library.remove(selected.id);
                        setDeleting(null);
                        setError(null);
                        searchRef.current?.focus();
                      } catch (caught) {
                        setError(errorMessage(caught));
                      }
                    }}
                  >
                    Delete bookmark
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${selected.title}`}
                    onClick={() => setDeleting(selected.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                  <button className="button primary" onClick={open}>
                    Open query <ArrowUpRight size={15} />
                  </button>
                </>
              )}
            </footer>
          </section>
        )}
      </div>
      <div className="bookmark-destination">
        <span>
          Open in{" "}
          <strong title={`${session.host}:${session.port}/${session.database}`}>
            {session.name}
          </strong>
        </span>
        <EnvironmentBadge
          environment={session.environment}
          readOnly={session.readOnly}
        />
        <small>New tab · does not execute SQL</small>
      </div>
    </ConnectionDialog>
  );
}
