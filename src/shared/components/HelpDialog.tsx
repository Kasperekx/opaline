import { useState } from "react";
import { ConnectionDialog } from "../../features/connections/ConnectionDialog";
import { primaryModifierLabel } from "../lib/platform";
import { version } from "../../../package.json";
import { ProjectLinks } from "./ProjectLinks";
import { buildCommit } from "../lib/build-info";

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState("");
  return (
    <ConnectionDialog
      title="About Opaline & help"
      subtitle={`Opaline ${version} · PostgreSQL`}
      onClose={onClose}
    >
      <div className="safety-content">
        <p>Build: {buildCommit}. Pre-beta · MIT license · local-first.</p>
        <h3>Working with connections</h3>
        <p>
          Click the connection name above the explorer to switch within a
          workspace. Each open session keeps its own SQL and table drafts.
        </p>
        <h3>Keyboard</h3>
        <p>
          <kbd>{primaryModifierLabel} Enter</kbd> runs selected SQL or the whole
          editor. <kbd>{primaryModifierLabel} K</kbd> focuses the current
          explorer. Escape closes dialogs without discarding changes.
          <kbd>{primaryModifierLabel} Shift P</kbd> opens Commands;
          <kbd>{primaryModifierLabel} O</kbd> opens SQL files and
          <kbd>{primaryModifierLabel} S</kbd> saves the active table's pending
          changes or the current SQL file (add Shift for Save as in SQL).
        </p>
        <h3>Transactions & recovery</h3>
        <p>
          Atomic is the default: commit on success, rollback on error. For
          VACUUM or CREATE DATABASE, explicitly enable Autocommit in the SQL
          toolbar. It runs one statement, saves immediately and applies only to
          that tab until reconnect/restart. Read-only sessions cannot enable it.
          Manual BEGIN/COMMIT are not supported. Never automatically retry a
          write after losing its result.
        </p>
        <p>
          SQL drafts and optional history are stored on this device, not
          encrypted by Opaline. Results from at most three SQL tabs per
          connection are retained in memory. The last 20 closed SQL tabs can be
          reopened. Table drafts survive switching, but not a crash.
        </p>
        <p>
          CSV exports preserve text and may contain spreadsheet formulas. Prefer
          JSON when handling untrusted values. Passwords are never included in
          diagnostics.
        </p>
        <h3>SQL files, library & data</h3>
        <p>
          Format is undoable and never runs SQL. Query library belongs to the
          workspace; opening an entry copies it to the explicitly shown
          connection. Files are limited to 1 MiB. External file changes block
          Save; review the other version or use Save as. After restart, file
          tabs become local drafts. Saved query libraries and table filters are
          local and not encrypted.
        </p>
        <p>
          Click a cell, then Shift-click or use Shift with arrow keys to select
          a range. <kbd>{primaryModifierLabel} C</kbd> copies escaped TSV (NULL
          is \\N). Right-click a table cell or press Shift+F10 for Copy, Copy as
          JSON, Inspect value and Duplicate row. Copy as JSON keeps NULL
          distinct from text. Column-edge handles support the keyboard. SQL
          results are read-only; double-click opens their full value.
        </p>
        <p>
          In tables, double-click or F2 edits one cell; Enter stages it locally.
          Save changes writes the entire active table's draft in one
          transaction. Duplicate row creates an unsaved copy of the displayed
          values, including local edits. Primary keys are reset; PostgreSQL
          supplies generated values. Fill in manual keys and check other unique
          fields before saving.
        </p>
        <h3>Backup / Restore</h3>
        <p>
          Use the workspace toolbar, click Create backup and choose where to
          save. PostgreSQL 14–18 clients are included and selected
          automatically, with no separate installation or download. Your active
          connection password is reused. Custom tools are optional under
          Advanced. Restore trusted files into the current database, or choose
          Create a new database on this server. Creation needs CREATEDB
          permission and a new name; existing names are never reused. The new
          database is kept if restore fails. Review the target and all warnings.
          Creation, production and dropping objects require separate approvals.
        </p>
        <p>
          Restore is unavailable in read-only sessions. Maintenance blocks local
          queries and table edits; other applications are not blocked. Cancel is
          a request, not proof of rollback. Reconnect affected sessions and
          inspect the database after restore; writes are never replayed
          automatically.
        </p>
        <button
          className="button secondary"
          onClick={() => {
            const platform = /Mac/.test(navigator.userAgent)
              ? "macOS"
              : /Windows/.test(navigator.userAgent)
                ? "Windows"
                : /Linux/.test(navigator.userAgent)
                  ? "Linux"
                  : "Other";
            void navigator.clipboard
              .writeText(
                JSON.stringify(
                  {
                    app: "Opaline",
                    version,
                    build: buildCommit,
                    platform,
                    engine: "PostgreSQL",
                    runtime: "Tauri 2",
                  },
                  null,
                  2,
                ),
              )
              .then(() =>
                setStatus(
                  "Diagnostics copied. Add reproduction steps; remove private data from screenshots.",
                ),
              )
              .catch(() =>
                setStatus(
                  "Clipboard unavailable. Include the app version and operating system in your report.",
                ),
              );
          }}
        >
          Copy safe diagnostics
        </button>
        <p role="status">{status}</p>
        <ProjectLinks />
      </div>
    </ConnectionDialog>
  );
}
