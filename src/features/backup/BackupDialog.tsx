import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Database,
  HardDriveDownload,
  History,
  Loader2,
} from "lucide-react";
import { Sheet, SheetFooter } from "../../shared/components/Sheet";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useDatabaseSession } from "../connections/SessionContext";
import type { DatabaseObject } from "../../shared/types/database";
import { backupApi } from "./backup-api";
import { BackupOptions, useBackupOptions } from "./BackupOptions";
import {
  RestoreOptions,
  useRestoreOptions,
  validNewDatabaseName,
} from "./RestoreOptions";
import { useBackupTask } from "./useBackupTask";
import { BackupAdvanced } from "./BackupAdvanced";
import "./backup.css";

const formatElapsed = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function BackupDialog({
  objects,
  workspaceName,
  onClose,
}: {
  objects: DatabaseObject[];
  workspaceName: string;
  onClose: () => void;
}) {
  const { session } = useDatabaseSession();
  const task = useBackupTask(session.id);
  const [mode, setMode] = useState<"backup" | "restore">("backup");
  const backupForm = useBackupOptions();
  const { format, content, scope, selection } = backupForm;
  const [password, setPassword] = useState("");
  const restoreForm = useRestoreOptions();
  const { trusted, name, production, nonempty, clean, cleanConsent, owners } =
    restoreForm;
  const { createNew, newDatabase, createConsent } = restoreForm;
  const restoreJobs =
    createNew && task.preview?.format === "custom" ? restoreForm.jobs : 1;
  const targetDatabase =
    mode === "restore" && createNew ? newDatabase : session.database;
  const readyRestore =
    task.preview &&
    trusted &&
    name === targetDatabase &&
    (!createNew || (validNewDatabaseName(newDatabase) && createConsent)) &&
    (!clean || (cleanConsent && nonempty)) &&
    (restoreJobs === 1 || restoreForm.parallelConsent) &&
    (session.environment !== "production" || production);
  return (
    <Sheet
      className={`backup-dialog ${mode}`}
      icon={mode === "backup" ? HardDriveDownload : History}
      size={mode === "backup" ? "medium" : "large"}
      showClose={false}
      title={
        mode === "backup"
          ? `Back up ${session.database}`
          : createNew
            ? "Restore into a new database"
            : `Restore into ${session.database}`
      }
      subtitle={
        mode === "backup"
          ? "Saves one database to a file, using this connection’s credentials and TLS settings. Nothing on the server is changed."
          : "Restores a trusted dump on this server. Opaline pauses its own database operations while the job runs; other applications are not blocked."
      }
      accessory={
        <div
          className="segmented-capsule backup-mode"
          role="group"
          aria-label="Maintenance operation"
        >
          <button
            type="button"
            aria-pressed={mode === "backup"}
            disabled={task.busy}
            onClick={() => setMode("backup")}
          >
            Backup
          </button>
          <button
            type="button"
            aria-pressed={mode === "restore"}
            disabled={task.busy || session.readOnly}
            title={
              session.readOnly
                ? "Restore requires write access"
                : "Restore a trusted dump"
            }
            onClick={() => setMode("restore")}
          >
            Restore database
          </button>
        </div>
      }
      busy={task.busy}
      onClose={onClose}
    >
      <div className="backup-panel">
        {task.error && (
          <p className="backup-error" role="alert">
            {task.error}
          </p>
        )}
        {task.busy && (
          <div
            className={`backup-progress${task.cancelling ? " cancelling" : ""}`}
            role="status"
          >
            <div className="backup-progress-head">
              {task.progress && (
                <span className="backup-elapsed">
                  <small>Elapsed</small>
                  <strong>{formatElapsed(task.progress.elapsedMs)}</strong>
                </span>
              )}
              <span className="backup-stage">
                <Loader2 className="spin" size={14} aria-hidden="true" />
                {task.progress?.stage ?? "Preparing…"}
              </span>
            </div>
            <span className="backup-progress-track" aria-hidden="true">
              <span />
            </span>
          </div>
        )}
        {task.result && (
          <div className="backup-outcome">
            <span className="backup-outcome-icon" aria-hidden="true">
              <Check size={16} strokeWidth={2.25} />
            </span>
            <p role="status">
              {task.result.message} ·{" "}
              {(task.result.durationMs / 1000).toFixed(1)}s
            </p>
          </div>
        )}
        {task.log.length > 0 && (
          <details className="backup-activity">
            <summary>Task activity · no raw SQL or credentials</summary>
            <ul>
              {task.log.map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ul>
          </details>
        )}
        <section className="backup-section">
          <span className="backup-caption">
            {mode === "backup" ? "Source" : "Target"}
          </span>
          <div className="backup-target">
            <span
              className={`backup-tile env-${session.environment}`}
              aria-hidden="true"
            >
              <Database size={16} />
            </span>
            <div>
              <span>
                <strong>
                  {targetDatabase || "New database"}
                  {mode === "restore" && createNew ? " · new" : ""}
                </strong>{" "}
                <small>
                  on {workspaceName} / {session.name}
                </small>
              </span>
              <code>
                {session.username}@{session.host}:{session.port}
              </code>
            </div>
            <EnvironmentBadge
              environment={session.environment}
              readOnly={session.readOnly}
            />
          </div>
          {session.readOnly && (
            <p className="backup-note">
              Restore requires write access. Backups only read.
            </p>
          )}
        </section>
        <fieldset className="backup-fields" disabled={task.busy}>
          {mode === "backup" ? (
            <BackupOptions form={backupForm} objects={objects} />
          ) : (
            <RestoreOptions form={restoreForm} task={task} session={session} />
          )}
        </fieldset>
        <BackupAdvanced
          task={task}
          password={password}
          onPasswordChange={setPassword}
        />
      </div>
      <SheetFooter>
        <button
          className="button secondary"
          disabled={task.busy}
          onClick={onClose}
        >
          Close
        </button>
        {task.running ? (
          <button
            className="button danger"
            disabled={task.cancelling}
            onClick={() => void task.cancel()}
          >
            {task.cancelling ? "Cancellation requested…" : "Cancel task"}
          </button>
        ) : (
          <button
            className={`button ${mode === "backup" ? "primary" : "danger"}`}
            data-initial-focus="true"
            disabled={
              task.busy ||
              (mode === "backup"
                ? scope !== "database" && !selection.length
                : !readyRestore || session.readOnly)
            }
            onClick={() => {
              const suppliedPassword = password || null;
              setPassword("");
              if (mode === "backup")
                void task.run(async (onProgress) => {
                  const path = await save({
                    defaultPath: `database.${format === "custom" ? "dump" : "sql"}`,
                    filters: [
                      {
                        name: "PostgreSQL dump",
                        extensions: [format === "custom" ? "dump" : "sql"],
                      },
                    ],
                  });
                  if (!path) return null;
                  return backupApi.dump(
                    session.id,
                    {
                      toolsId: task.tools?.id ?? null,
                      path,
                      format,
                      content,
                      schemas: scope === "schemas" ? selection : [],
                      tables:
                        scope === "tables"
                          ? selection.map((value) => {
                              const [schema, table] = JSON.parse(value) as [
                                string,
                                string,
                              ];
                              return { schema, table };
                            })
                          : [],
                      password: suppliedPassword,
                    },
                    onProgress,
                  );
                });
              else if (task.preview) {
                const preparedId = task.preview.id;
                void task.run(
                  (onProgress) =>
                    backupApi.restore(
                      session.id,
                      {
                        jobs: restoreJobs,
                        confirmParallel:
                          restoreJobs > 1 && restoreForm.parallelConsent,
                        preparedId,
                        newDatabase: createNew ? newDatabase : null,
                        confirmCreate: createNew && createConsent,
                        password: suppliedPassword,
                        trustedFile: trusted,
                        confirmDatabase: name,
                        confirmProduction: production,
                        allowNonempty: nonempty,
                        clean,
                        confirmClean: cleanConsent,
                        preserveOwnership: owners,
                      },
                      onProgress,
                    ),
                  true,
                );
              }
            }}
          >
            {mode === "backup"
              ? "Create backup"
              : createNew
                ? "Create database & restore"
                : "Restore to this database"}
          </button>
        )}
      </SheetFooter>
    </Sheet>
  );
}
