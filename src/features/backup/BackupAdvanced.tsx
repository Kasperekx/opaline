import { ShieldCheck } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { useBackupTask } from "./useBackupTask";

export function BackupAdvanced({
  task,
  password,
  onPasswordChange,
}: {
  task: ReturnType<typeof useBackupTask>;
  password: string;
  onPasswordChange: (value: string) => void;
}) {
  return (
    <>
      <div className="backup-engine">
        <span className="backup-engine-icon" aria-hidden="true">
          <ShieldCheck size={15} />
        </span>
        <div>
          <span>
            {task.tools
              ? `Custom engine · PostgreSQL ${task.tools.version}`
              : "Built-in engine · selected automatically"}
          </span>
          {task.tools ? (
            <code>{task.tools.directory}</code>
          ) : (
            <small>
              Matched to the server and verified. Nothing to install.
            </small>
          )}
        </div>
      </div>
      <details className="backup-advanced">
        <summary>Advanced settings</summary>
        <fieldset className="backup-fields" disabled={task.busy}>
          <div className="backup-group">
            <label className="backup-row">
              <span className="backup-row-label">Password override</span>
              <input
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Use the active connection password"
              />
            </label>
            <div className="backup-row backup-tools">
              <span className="backup-row-label">Client tools</span>
              <div className="backup-row-fill">
                <span>
                  {task.tools
                    ? `PostgreSQL ${task.tools.version}`
                    : "Automatic engine"}
                </span>
                <small>
                  {task.tools?.directory ??
                    "Opaline selects and verifies the matching bundled version."}
                </small>
              </div>
              {task.tools && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={task.useAutomaticTools}
                >
                  Use automatic engine
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  void task.chooseTools(async () => {
                    const selected = await open({
                      directory: true,
                      multiple: false,
                      title: "Choose trusted PostgreSQL client tools",
                    });
                    return typeof selected === "string" ? selected : null;
                  })
                }
              >
                Use custom tools
              </button>
            </div>
          </div>
          <p className="backup-note">
            PostgreSQL 14–18 tools are included. No installation or download is
            needed. Your active connection credentials and TLS settings are used
            automatically. Custom executables must be trusted and up to date.
            Encrypted connections keep hostname verification and your
            certificate authority; encryption is never downgraded.
          </p>
        </fieldset>
      </details>
    </>
  );
}
