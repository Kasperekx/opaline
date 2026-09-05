import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { HardDriveDownload, Loader2 } from "lucide-react";
import { ConnectionDialog } from "../connections/ConnectionDialog";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useDatabaseSession } from "../connections/SessionContext";
import type { DatabaseObject } from "../../shared/types/database";
import { backupApi } from "./backup-api";
import { BackupOptions, useBackupOptions } from "./BackupOptions";
import { RestoreOptions, useRestoreOptions } from "./RestoreOptions";
import { useBackupTask } from "./useBackupTask";
import { BackupAdvanced } from "./BackupAdvanced";
import "./backup.css";

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
  const readyRestore =
    task.preview &&
    trusted &&
    name === session.database &&
    (!clean || (cleanConsent && nonempty)) &&
    (session.environment !== "production" || production);
  return (
    <ConnectionDialog
      className="backup-dialog"
      title="Backup / Restore"
      subtitle={`${workspaceName} / ${session.name} · ${session.environment} · ${session.host}:${session.port} / ${session.database}`}
      busy={task.busy}
      onClose={onClose}
    >
      <div className="p1-panel backup-panel">
        <div className="backup-target">
          <HardDriveDownload size={23} />
          <div>
            <small>
              {workspaceName} / {session.name}
            </small>
            <strong>{session.database}</strong>
            <span>
              {session.host}:{session.port} · {session.username}
            </span>
          </div>
          <EnvironmentBadge
            environment={session.environment}
            readOnly={session.readOnly}
          />
        </div>
        <div
          className="backup-mode"
          role="group"
          aria-label="Maintenance operation"
        >
          <button
            aria-pressed={mode === "backup"}
            disabled={task.busy}
            onClick={() => setMode("backup")}
          >
            Backup
          </button>
          <button
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
        {task.error && (
          <p className="p1-error" role="alert">
            {task.error}
          </p>
        )}
        {task.busy && (
          <div className="backup-progress" role="status">
            <Loader2 className="spin" size={18} />
            <span>{task.progress?.stage ?? "Preparing…"}</span>
            {task.progress && (
              <span>{Math.floor(task.progress.elapsedMs / 1000)}s</span>
            )}
          </div>
        )}
        {task.result && (
          <p className="backup-success" role="status">
            {task.result.message} · {(task.result.durationMs / 1000).toFixed(1)}
            s
          </p>
        )}
        {task.log.length > 0 && (
          <details>
            <summary>Task activity · no raw SQL or credentials</summary>
            <ul>
              {task.log.map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <footer className="dialog-actions">
        <button className="button ghost" disabled={task.busy} onClick={onClose}>
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
                        preparedId,
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
            {mode === "backup" ? "Create backup" : "Restore to this database"}
          </button>
        )}
      </footer>
    </ConnectionDialog>
  );
}
