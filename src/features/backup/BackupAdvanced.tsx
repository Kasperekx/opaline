import { FolderOpen, ShieldCheck } from "lucide-react";
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
      <p className="backup-engine">
        <ShieldCheck size={17} aria-hidden="true" />
        <span>
          {task.tools
            ? `Custom engine · PostgreSQL ${task.tools.version}`
            : "Built-in engine · selected automatically"}
        </span>
      </p>
      <details className="backup-advanced">
        <summary>Advanced settings</summary>
        <fieldset className="backup-fields" disabled={task.busy}>
          <p className="p1-muted">
            PostgreSQL 14–18 tools are included. No installation or download is
            needed. Your active connection credentials and TLS settings are used
            automatically.
          </p>
          <label>
            Password override (optional)
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Use the active connection password"
            />
          </label>
          <div className="backup-tools">
            <div>
              <strong>
                {task.tools
                  ? `PostgreSQL ${task.tools.version}`
                  : "Automatic engine"}
              </strong>
              <small>
                {task.tools?.directory ??
                  "Opaline selects and verifies the matching bundled version."}
              </small>
            </div>
            <button
              className="button ghost"
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
              <FolderOpen size={16} />
              Use custom tools
            </button>
            {task.tools && (
              <button className="button ghost" onClick={task.useAutomaticTools}>
                Use automatic engine
              </button>
            )}
          </div>
          <p className="p1-muted">
            Custom executables must be trusted and up to date. Encrypted
            connections keep hostname verification and your certificate
            authority; encryption is never downgraded.
          </p>
        </fieldset>
      </details>
    </>
  );
}
