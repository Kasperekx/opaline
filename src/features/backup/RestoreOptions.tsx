import { useState } from "react";
import { Check, FileArchive, Info, ShieldAlert } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SessionInfo } from "../connections/connection-types";
import type { useBackupTask } from "./useBackupTask";
import type { RestoreJobs } from "./backup-api";
import { RestoreExecution } from "./RestoreExecution";

export const validNewDatabaseName = (name: string) =>
  name.length > 0 &&
  name.trim() === name &&
  new TextEncoder().encode(name).length <= 63 &&
  !/\p{Cc}/u.test(name);

export function useRestoreOptions() {
  const [jobs, setJobs] = useState<RestoreJobs>(1);
  const [parallelConsent, setParallelConsent] = useState(false);
  const [createNew, setCreateNew] = useState(false);
  const [newDatabase, setNewDatabase] = useState("");
  const [createConsent, setCreateConsent] = useState(false);
  const [trusted, setTrusted] = useState(false);
  const [name, setName] = useState("");
  const [production, setProduction] = useState(false);
  const [nonempty, setNonempty] = useState(false);
  const [clean, setClean] = useState(false);
  const [cleanConsent, setCleanConsent] = useState(false);
  const [owners, setOwners] = useState(false);
  return {
    jobs,
    setJobs,
    parallelConsent,
    setParallelConsent,
    resetExecution: () => {
      setJobs(1);
      setParallelConsent(false);
    },
    createNew,
    setCreateNew,
    newDatabase,
    setNewDatabase,
    createConsent,
    setCreateConsent,
    trusted,
    setTrusted,
    name,
    setName,
    production,
    setProduction,
    nonempty,
    setNonempty,
    clean,
    setClean,
    cleanConsent,
    setCleanConsent,
    owners,
    setOwners,
  };
}
export function RestoreOptions({
  form,
  task,
  session,
}: {
  form: ReturnType<typeof useRestoreOptions>;
  task: ReturnType<typeof useBackupTask>;
  session: SessionInfo;
}) {
  const {
    createNew,
    setCreateNew,
    newDatabase,
    setNewDatabase,
    createConsent,
    setCreateConsent,
    trusted,
    setTrusted,
    name,
    setName,
    production,
    setProduction,
    nonempty,
    setNonempty,
    clean,
    setClean,
    cleanConsent,
    setCleanConsent,
    owners,
    setOwners,
  } = form;
  const target = createNew ? newDatabase : session.database;
  return (
    <div className="restore-layout">
      <div className="restore-column">
        <section className="backup-section">
          <span className="backup-caption">Backup file</span>
          <div className="backup-group">
            <div className="backup-row restore-file">
              <span className="backup-tile" aria-hidden="true">
                <FileArchive size={16} />
              </span>
              <div className="backup-row-fill">
                {task.preview ? (
                  <>
                    <strong>
                      {task.preview.format === "custom"
                        ? "Custom archive · object inventory"
                        : "SQL script · beginning of file"}
                    </strong>
                    <small>
                      {(task.preview.bytes / 1024).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}{" "}
                      KiB ·{" "}
                      <code>SHA-256 {task.preview.digest.slice(0, 16)}…</code>
                    </small>
                  </>
                ) : (
                  <>
                    <strong>No file inspected yet</strong>
                    <small>Choose a file to see what it contains.</small>
                  </>
                )}
              </div>
              <button
                type="button"
                className="button secondary"
                disabled={task.busy}
                onClick={() => {
                  setTrusted(false);
                  setName("");
                  setClean(false);
                  setCleanConsent(false);
                  setCreateConsent(false);
                  setProduction(false);
                  form.resetExecution();
                  void task.prepare(async () => {
                    const path = await open({
                      multiple: false,
                      title: "Choose a trusted PostgreSQL dump",
                    });
                    return typeof path === "string" ? path : null;
                  });
                }}
              >
                Choose dump and inspect
              </button>
            </div>
            <p className="backup-warning">
              <ShieldAlert size={16} aria-hidden="true" />
              <span>
                A dump can execute arbitrary database code. Restore only files
                from a trusted source. The preview is not a security audit.
              </span>
            </p>
          </div>
          <p className="backup-note">
            Inspection creates a private temporary copy, requiring additional
            disk space. Custom archives up to 100 GiB; UTF-8 SQL scripts up to
            64 MiB. Format is detected from content.
          </p>
        </section>
        {task.preview && (
          <>
            <section className="backup-section">
              <span className="backup-caption">Contents</span>
              <textarea
                className="backup-preview"
                aria-label="Dump preview"
                readOnly
                value={task.preview.preview}
              />
              <p className="backup-note">
                Review extensions, roles, ownership and privileges. Default
                target:{" "}
                {createNew
                  ? "a new database on this server."
                  : "an existing empty database."}{" "}
                All local database operations pause during the job. Other
                applications are not blocked.
              </p>
            </section>
            <p className="backup-callout">
              <Info size={15} aria-hidden="true" />
              <span>
                {task.preview.format === "sql"
                  ? "SQL scripts use psql restricted mode and stop on error, but can contain transaction commands: partial changes or external effects are possible."
                  : form.jobs > 1 && createNew
                    ? "Parallel restore stops on error, but completed work is not rolled back as a whole. Do not use the new database until restore succeeds."
                    : "Custom archives use one transaction and stop on error. External effects from dump code cannot be rolled back."}{" "}
                Cancellation never means a confirmed rollback.
              </span>
            </p>
          </>
        )}
      </div>
      <div className="restore-column">
        <section className="backup-section">
          <span className="backup-caption">Restore into</span>
          <div className="backup-group">
            <div className="backup-row">
              <select
                className="backup-select backup-row-fill"
                aria-label="Restore destination"
                value={createNew ? "new" : "existing"}
                onChange={(event) => {
                  setCreateNew(event.target.value === "new");
                  setName("");
                  setProduction(false);
                  setNonempty(false);
                  setClean(false);
                  setCleanConsent(false);
                  setCreateConsent(false);
                  form.resetExecution();
                }}
              >
                <option value="existing">
                  Current database: {session.database}
                </option>
                <option value="new">
                  Create a new database on this server
                </option>
              </select>
            </div>
            {createNew && (
              <label className="backup-row">
                <span className="backup-row-label short">Name</span>
                <input
                  className="backup-mono"
                  aria-label="New database name"
                  value={newDatabase}
                  autoComplete="off"
                  placeholder="e.g. product_restore"
                  onChange={(event) => {
                    setNewDatabase(event.target.value);
                    setName("");
                    setProduction(false);
                    setCreateConsent(false);
                    form.resetExecution();
                  }}
                  aria-invalid={
                    newDatabase.length > 0 && !validNewDatabaseName(newDatabase)
                  }
                />
              </label>
            )}
          </div>
          {createNew && (
            <p className="backup-note">
              A new UTF-8 database will be created on {session.host}:
              {session.port}, owned by {session.username}. Requires CREATEDB
              permission. Use 1–63 UTF-8 bytes; existing databases are never
              reused.
            </p>
          )}
        </section>
        {task.preview && createNew && task.preview.format === "custom" && (
          <RestoreExecution
            jobs={form.jobs}
            consent={form.parallelConsent}
            onJobsChange={form.setJobs}
            onConsentChange={form.setParallelConsent}
          />
        )}
        {task.preview && (
          <section className="backup-section">
            <span className="backup-caption">Before you restore</span>
            <div className="backup-group">
              {createNew && (
                <label className="backup-check danger">
                  <input
                    type="checkbox"
                    checked={createConsent}
                    onChange={(event) => setCreateConsent(event.target.checked)}
                  />
                  <span>
                    I approve creating this database. If restore fails, the
                    database is kept for inspection, not automatically deleted.
                  </span>
                </label>
              )}
              <label className="backup-check">
                <input
                  type="checkbox"
                  checked={trusted}
                  onChange={(e) => setTrusted(e.target.checked)}
                />
                <span>I trust this file and its source database code.</span>
              </label>
              {!createNew && (
                <label className="backup-check">
                  <input
                    type="checkbox"
                    checked={nonempty}
                    onChange={(e) => {
                      setNonempty(e.target.checked);
                      setClean(false);
                      setCleanConsent(false);
                    }}
                  />
                  <span>Allow restoring into a non-empty database.</span>
                </label>
              )}
              {task.preview.format === "custom" && (
                <>
                  <label className="backup-check">
                    <input
                      type="checkbox"
                      checked={owners}
                      onChange={(e) => setOwners(e.target.checked)}
                    />
                    <span>
                      Restore original ownership and grants (requires matching
                      roles and privileges).
                    </span>
                  </label>
                  {!createNew && (
                    <label className="backup-check">
                      <input
                        type="checkbox"
                        checked={clean}
                        disabled={!nonempty}
                        onChange={(e) => {
                          setClean(e.target.checked);
                          setCleanConsent(false);
                        }}
                      />
                      <span>
                        Drop existing objects included in this archive before
                        restoring.
                      </span>
                    </label>
                  )}
                  {clean && (
                    <label className="backup-check danger">
                      <input
                        type="checkbox"
                        checked={cleanConsent}
                        onChange={(e) => setCleanConsent(e.target.checked)}
                      />
                      <span>
                        I explicitly approve dropping those objects and their
                        current data.
                      </span>
                    </label>
                  )}
                </>
              )}
              {session.environment === "production" && (
                <label className="backup-check danger">
                  <input
                    type="checkbox"
                    checked={production}
                    onChange={(e) => setProduction(e.target.checked)}
                  />
                  <span>
                    I approve restoring into PRODUCTION. This is separate from
                    connection write access.
                  </span>
                </label>
              )}
            </div>
          </section>
        )}
      </div>
      {task.preview && (
        <label className="restore-confirm">
          <span>
            Type <strong>{target}</strong> to confirm
          </span>
          <span className="restore-confirm-field">
            <input
              aria-label={`Type the target database name: ${target}`}
              value={name}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
            {name.length > 0 && name === target && (
              <Check size={14} aria-hidden="true" />
            )}
          </span>
        </label>
      )}
    </div>
  );
}
