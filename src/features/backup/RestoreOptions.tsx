import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SessionInfo } from "../connections/connection-types";
import type { useBackupTask } from "./useBackupTask";
export function useRestoreOptions() {
  const [trusted, setTrusted] = useState(false);
  const [name, setName] = useState("");
  const [production, setProduction] = useState(false);
  const [nonempty, setNonempty] = useState(false);
  const [clean, setClean] = useState(false);
  const [cleanConsent, setCleanConsent] = useState(false);
  const [owners, setOwners] = useState(false);
  return {
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
  return (
    <>
      <p className="backup-warning">
        <ShieldAlert size={18} />
        <span>
          A dump can execute arbitrary database code. Restore only files from a
          trusted source. The preview is not a security audit.
        </span>
      </p>
      <button
        className="button secondary"
        disabled={task.busy}
        onClick={() => {
          setTrusted(false);
          setName("");
          setClean(false);
          setCleanConsent(false);
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
      <p className="p1-muted">
        Inspection creates a private temporary copy, requiring additional disk
        space. Custom archives up to 100 GiB; UTF-8 SQL scripts up to 64 MiB.
        Format is detected from content.
      </p>
      {task.preview && (
        <>
          <div className="backup-preview-meta">
            <strong>
              {task.preview.format === "custom"
                ? "Custom archive · object inventory"
                : "SQL script · beginning of file"}
            </strong>
            <span>
              {(task.preview.bytes / 1024).toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}{" "}
              KiB · SHA-256 {task.preview.digest.slice(0, 16)}…
            </span>
          </div>
          <textarea
            className="backup-preview"
            aria-label="Dump preview"
            readOnly
            value={task.preview.preview}
          />
          <p className="p1-muted">
            Review extensions, roles, ownership and privileges. Default target:
            an existing empty database; automatic database creation is not
            enabled. All local database operations pause during the job. Other
            applications are not blocked.
          </p>
          <label className="p1-check">
            <input
              type="checkbox"
              checked={trusted}
              onChange={(e) => setTrusted(e.target.checked)}
            />
            I trust this file and its source database code.
          </label>
          <label className="p1-check">
            <input
              type="checkbox"
              checked={nonempty}
              onChange={(e) => {
                setNonempty(e.target.checked);
                setClean(false);
                setCleanConsent(false);
              }}
            />
            Allow restoring into a non-empty database.
          </label>
          {task.preview.format === "custom" && (
            <>
              <label className="p1-check">
                <input
                  type="checkbox"
                  checked={owners}
                  onChange={(e) => setOwners(e.target.checked)}
                />
                Restore original ownership and grants (requires matching roles
                and privileges).
              </label>
              <label className="p1-check">
                <input
                  type="checkbox"
                  checked={clean}
                  disabled={!nonempty}
                  onChange={(e) => {
                    setClean(e.target.checked);
                    setCleanConsent(false);
                  }}
                />
                Drop existing objects included in this archive before restoring.
              </label>
              {clean && (
                <label className="p1-check backup-danger">
                  <input
                    type="checkbox"
                    checked={cleanConsent}
                    onChange={(e) => setCleanConsent(e.target.checked)}
                  />
                  I explicitly approve dropping those objects and their current
                  data.
                </label>
              )}
            </>
          )}
          {session.environment === "production" && (
            <label className="p1-check backup-danger">
              <input
                type="checkbox"
                checked={production}
                onChange={(e) => setProduction(e.target.checked)}
              />
              I approve restoring into PRODUCTION. This is separate from
              connection write access.
            </label>
          )}
          <label>
            Type the target database name: {session.database}
            <input
              value={name}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="p1-muted">
            Custom archives use one transaction and stop on error. SQL scripts
            use psql restricted mode and stop on error, but can contain
            transaction commands: partial changes or external effects are
            possible. Cancellation never means a confirmed rollback.
          </p>
        </>
      )}
    </>
  );
}
