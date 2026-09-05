import { useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, FileKey2, Loader2, ShieldCheck } from "lucide-react";
import { errorMessage } from "../../shared/lib/database-api";
import { ConnectionDialog } from "./ConnectionDialog";
import { useFormSafety } from "../../shared/safety/useFormSafety";
import { connectionApi } from "./connection-api";
import {
  environments,
  environmentLabels,
  type ProfileInput,
  type ProductWorkspace,
  type ConnectionCatalog,
} from "./connection-types";

export function ProfileEditor({
  initial,
  workspaces,
  onSaved,
  onClose,
}: {
  initial: ProfileInput;
  workspaces: ProductWorkspace[];
  onSaved: (catalog: ConnectionCatalog, input: ProfileInput) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [remember, setRemember] = useState(initial.passwordAction !== "forget");
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const closeSafely = useFormSafety(
    "Connection profile",
    value !== initial || remember !== (initial.passwordAction !== "forget"),
    busy !== null,
  );
  const [tested, setTested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState("");
  const update = <K extends keyof ProfileInput>(
    key: K,
    next: ProfileInput[K],
  ) => {
    setValue((current) => ({ ...current, [key]: next }));
    setTested(false);
    setError(null);
  };
  const input: ProfileInput = {
    ...value,
    passwordAction: remember
      ? value.password === null && initial.passwordAction === "keep"
        ? "keep"
        : "store"
      : "forget",
  };
  const test = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("test");
    setTested(false);
    setError(null);
    try {
      const result = await connectionApi.test(input);
      setServer(result.serverVersion);
      setTested(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!tested || busy) return;
    setBusy("save");
    setError(null);
    try {
      onSaved(await connectionApi.save(input), input);
    } catch (error) {
      setError(errorMessage(error));
      setTested(false);
    } finally {
      setBusy(null);
    }
  };
  const chooseCa = async () => {
    try {
      const path = await open({
        title: "Choose a trusted CA certificate",
        multiple: false,
        directory: false,
        filters: [
          { name: "PEM certificates", extensions: ["pem", "crt", "cer"] },
        ],
      });
      if (typeof path === "string") {
        setValue((current) => ({
          ...current,
          caPath: path,
          sslMode: "require",
        }));
        setTested(false);
        setError(null);
      }
    } catch (error) {
      setError(errorMessage(error));
    }
  };
  return (
    <ConnectionDialog
      title={initial.id ? "Edit connection" : "New connection"}
      subtitle="PostgreSQL · Connection profile"
      busy={!!busy}
      onClose={() => closeSafely(onClose)}
    >
      <form onSubmit={(event) => void test(event)}>
        <fieldset disabled={!!busy} className="profile-fields">
          <div className="profile-form-grid">
            <label>
              Connection name
              <input
                data-initial-focus={true}
                required
                maxLength={255}
                value={value.name}
                placeholder="e.g. MMO · Local"
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <label>
              Workspace
              <select
                value={value.workspaceId}
                onChange={(e) => update("workspaceId", e.target.value)}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Environment
              <select
                value={value.environment}
                onChange={(e) =>
                  update(
                    "environment",
                    e.target.value as ProfileInput["environment"],
                  )
                }
              >
                {environments.map((env) => (
                  <option key={env} value={env}>
                    {environmentLabels[env]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Access
              <select
                value={value.readOnly ? "read" : "write"}
                onChange={(e) => update("readOnly", e.target.value === "read")}
              >
                <option value="write">Read & write</option>
                <option value="read">Read-only</option>
              </select>
            </label>
          </div>
          {value.environment === "production" && (
            <p className="connection-notice production-notice">
              Production connection.{" "}
              {value.readOnly
                ? "Writes will be blocked."
                : "You will be asked to confirm write access each time you connect."}
            </p>
          )}
          <div className="profile-form-grid destination-fields">
            <label className="host-field">
              Host
              <input
                required
                maxLength={255}
                value={value.host}
                spellCheck={false}
                onChange={(e) => update("host", e.target.value)}
              />
            </label>
            <label>
              Port
              <input
                required
                type="number"
                min={1}
                max={65535}
                value={value.port || ""}
                onChange={(e) => update("port", Number(e.target.value))}
              />
            </label>
            <label>
              Database
              <input
                required
                maxLength={255}
                value={value.database}
                onChange={(e) => update("database", e.target.value)}
              />
            </label>
            <label>
              Username
              <input
                required
                maxLength={255}
                value={value.username}
                autoComplete="off"
                onChange={(e) => update("username", e.target.value)}
              />
            </label>
          </div>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              value={value.password ?? ""}
              placeholder={
                initial.passwordAction === "keep"
                  ? "Saved in system vault — leave unchanged"
                  : "Optional"
              }
              onChange={(e) => update("password", e.target.value)}
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                setRemember(e.target.checked);
                setTested(false);
              }}
            />
            <span>
              Save password in the system credential store
              <small>
                {remember
                  ? "Keychain on macOS · Credential Manager on Windows · Secret Service on Linux"
                  : "The profile will not contain a password. Enter it when connecting."}
              </small>
            </span>
          </label>
          <div className="profile-form-grid">
            <label>
              TLS
              <select
                value={value.sslMode}
                onChange={(e) => {
                  update("sslMode", e.target.value as ProfileInput["sslMode"]);
                  if (e.target.value !== "require") update("caPath", null);
                }}
              >
                <option value="prefer">
                  Prefer — allow unencrypted fallback
                </option>
                <option value="require">Require — verified TLS</option>
                <option value="disable">Disable — unencrypted</option>
              </select>
            </label>
            <div className="ca-field">
              <span>Custom CA certificate</span>
              <button
                className="button ghost"
                type="button"
                onClick={() => void chooseCa()}
              >
                <FileKey2 size={16} />
                {value.caPath ? "Change certificate" : "Choose PEM file"}
              </button>
            </div>
          </div>
          {value.caPath && (
            <div className="ca-path">
              <code>{value.caPath}</code>
              <button
                type="button"
                className="button ghost"
                onClick={() => update("caPath", null)}
              >
                Remove
              </button>
            </div>
          )}
          <p className="form-help">
            A custom CA requires verified TLS, including hostname verification.
            SSH tunnelling is planned for a later release.
          </p>
        </fieldset>
        <div className="profile-validation" aria-live="polite">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {tested && (
            <p className="connection-success">
              <Check size={16} />
              Connection verified · {server}
            </p>
          )}
        </div>
        <footer className="connection-dialog-footer">
          <span>
            <ShieldCheck size={16} /> Profiles never contain passwords
          </span>
          <div>
            <button type="submit" className="button ghost" disabled={!!busy}>
              {busy === "test" && <Loader2 size={16} className="spin" />}Test
              connection
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!tested || !!busy}
              title={
                tested ? "Save verified profile" : "Test the connection first"
              }
              onClick={() => void save()}
            >
              {busy === "save" && <Loader2 size={16} className="spin" />}Save
              profile
            </button>
          </div>
        </footer>
      </form>
    </ConnectionDialog>
  );
}
