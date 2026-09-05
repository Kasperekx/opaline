import { useState } from "react";
import { BookMarked, Search, Trash2 } from "lucide-react";
import { ConnectionDialog } from "../connections/ConnectionDialog";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useDatabaseSession } from "../connections/SessionContext";
import { useFormSafety } from "../../shared/safety/useFormSafety";
import { errorMessage } from "../../shared/lib/database-api";
import { useSavedQueries } from "./useSavedQueries";

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
  const [savedName, setSavedName] = useState(title);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const protect = useFormSafety(
    "Query library name",
    name !== savedName,
    false,
  );
  return (
    <ConnectionDialog
      title="Query library"
      subtitle="Workspace SQL · stored only on this device"
      onClose={() => protect(onClose)}
    >
      <div className="p1-panel">
        <div className="p1-context">
          <BookMarked size={20} />
          <span>
            Open in <strong>{session.name}</strong>
          </span>
          <EnvironmentBadge
            environment={session.environment}
            readOnly={session.readOnly}
          />
        </div>
        <p className="p1-muted">
          Opening creates a draft in this connection. Nothing is executed.
          Switch connection first to choose another target.
        </p>
        <form
          className="p1-inline"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              library.save(name, sql);
              setSavedName(name);
              setSaved(true);
              setError(null);
            } catch (caught) {
              setError(errorMessage(caught));
            }
          }}
        >
          <label>
            Save current SQL
            <input
              value={name}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              aria-label="Saved query name"
            />
          </label>
          <button
            className="button primary"
            disabled={!sql.trim() || !name.trim() || saved}
          >
            {saved ? "Saved to library" : "Save a copy"}
          </button>
        </form>
        <label className="p1-search">
          <Search size={16} />
          <input
            data-initial-focus="true"
            placeholder="Find a saved query…"
            aria-label="Find saved query"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="p1-error">
            {error}
          </p>
        )}
        <div className="p1-list">
          {library.entries
            .filter((entry) =>
              entry.title.toLowerCase().includes(search.toLowerCase()),
            )
            .map((entry) => (
              <article className="p1-library-row" key={entry.id}>
                <button
                  onClick={() => {
                    onOpen(entry.sql, entry.title);
                    onClose();
                  }}
                >
                  <strong>{entry.title}</strong>
                  <code>{entry.sql.slice(0, 160)}</code>
                  <small>Open in {session.name}</small>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${entry.title}`}
                  onClick={() => setDeleting(entry.id)}
                >
                  <Trash2 size={16} />
                </button>
                {deleting === entry.id && (
                  <div className="p1-inline">
                    <span>Delete this saved query? Open drafts are kept.</span>
                    <button
                      className="button ghost"
                      onClick={() => setDeleting(null)}
                    >
                      Keep
                    </button>
                    <button
                      className="button danger"
                      onClick={() => {
                        try {
                          library.remove(entry.id);
                          setDeleting(null);
                        } catch (caught) {
                          setError(errorMessage(caught));
                        }
                      }}
                    >
                      Delete query
                    </button>
                  </div>
                )}
              </article>
            ))}
          {!library.entries.length && (
            <p className="p1-muted">
              Your workspace library is empty. Save a useful query above.
            </p>
          )}
        </div>
      </div>
    </ConnectionDialog>
  );
}
