import { useId, useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Database,
  Info,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { errorMessage } from "../../shared/lib/database-api";
import { Sheet, SheetFooter } from "../../shared/components/Sheet";
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
  const fieldId = useId();
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
  const workspaceName =
    workspaces.find((w) => w.id === value.workspaceId)?.name ?? "";
  const target = `${value.username || "user"}@${value.host || "host"}:${
    value.port || 5432
  }/${value.database || "database"}`;
  return (
    <Sheet
      title={initial.id ? "Edit connection" : "New connection"}
      subtitle={`PostgreSQL profile${
        workspaceName ? ` in ${workspaceName}` : ""
      }. Test the connection before you save.`}
      icon={Database}
      size={800}
      className="profile-editor-dialog"
      busy={!!busy}
      onClose={() => closeSafely(onClose)}
    >
      <form onSubmit={(event) => void test(event)}>
        <fieldset disabled={!!busy} className="profile-fields">
          <section
            className="profile-identity-section"
            aria-label="Profile identity"
          >
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
            <div
              className="profile-choice"
              role="radiogroup"
              aria-labelledby={`${fieldId}-environment`}
            >
              <span id={`${fieldId}-environment`}>Environment</span>
              <div className="segmented-capsule profile-segments">
                {environments.map((env) => (
                  <label key={env} className={`env-${env}`}>
                    <input
                      type="radio"
                      name={`${fieldId}-environment`}
                      value={env}
                      checked={value.environment === env}
                      onChange={() => update("environment", env)}
                    />
                    <i aria-hidden="true" />
                    {environmentLabels[env]}
                  </label>
                ))}
              </div>
            </div>
            <div
              className="profile-choice"
              role="radiogroup"
              aria-labelledby={`${fieldId}-access`}
            >
              <span id={`${fieldId}-access`}>Access</span>
              <div className="segmented-capsule profile-segments">
                {(
                  [
                    ["write", "Read & write"],
                    ["read", "Read-only"],
                  ] as const
                ).map(([mode, label]) => (
                  <label key={mode}>
                    <input
                      type="radio"
                      name={`${fieldId}-access`}
                      value={mode}
                      checked={value.readOnly === (mode === "read")}
                      onChange={() => update("readOnly", mode === "read")}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {value.environment === "production" && (
              <p className="connection-notice production-notice">
                <TriangleAlert size={13} aria-hidden="true" />
                <span>
                  Production connection.{" "}
                  {value.readOnly
                    ? "Writes will be blocked."
                    : "You will be asked to confirm write access each time you connect."}
                </span>
              </p>
            )}
            <div className={`profile-summary env-${value.environment}`}>
              <strong>
                <i aria-hidden="true" />
                {environmentLabels[value.environment]}
                <span>·</span>
                <em>{value.readOnly ? "Read-only" : "Read & write"}</em>
              </strong>
              <code>{target}</code>
              <p>
                {value.readOnly
                  ? "Read-only access. Changes to data are blocked."
                  : "Read & write access. Table edits stay local until saved."}
              </p>
            </div>
          </section>
          <div className="profile-connection-section">
            <section
              className="profile-section"
              aria-label="Server and credentials"
            >
              <h3>Server</h3>
              <div className="form-group-box">
                <label className="form-row">
                  <span>Host</span>
                  <input
                    required
                    maxLength={255}
                    value={value.host}
                    placeholder="localhost or db.example.com"
                    spellCheck={false}
                    onChange={(e) => update("host", e.target.value)}
                  />
                </label>
                <label className="form-row">
                  <span>Port</span>
                  <input
                    className="port-input"
                    required
                    type="number"
                    min={1}
                    max={65535}
                    value={value.port || ""}
                    onChange={(e) => update("port", Number(e.target.value))}
                  />
                </label>
                <label className="form-row">
                  <span>Database</span>
                  <input
                    required
                    maxLength={255}
                    value={value.database}
                    spellCheck={false}
                    onChange={(e) => update("database", e.target.value)}
                  />
                </label>
                <label className="form-row">
                  <span>Username</span>
                  <input
                    required
                    maxLength={255}
                    value={value.username}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => update("username", e.target.value)}
                  />
                </label>
              </div>
              <h3>Password</h3>
              <div className="form-group-box">
                <label className="form-row">
                  <span>Password</span>
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
                <label className="form-row switch-row">
                  <span>
                    Save password in Keychain
                    <small>
                      {remember
                        ? "Stored securely by your operating system, never in the profile."
                        : "The profile will not contain a password. Enter it when connecting."}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="switch"
                    checked={remember}
                    onChange={(e) => {
                      setRemember(e.target.checked);
                      setTested(false);
                    }}
                  />
                </label>
              </div>
            </section>
            <section
              className="profile-section profile-security-section"
              aria-label="Connection security"
            >
              <h3>Security</h3>
              <div className="form-group-box">
                <label className="form-row">
                  <span>TLS</span>
                  <select
                    value={value.sslMode}
                    onChange={(e) => {
                      update(
                        "sslMode",
                        e.target.value as ProfileInput["sslMode"],
                      );
                      if (e.target.value !== "require") update("caPath", null);
                    }}
                  >
                    <option value="prefer">Prefer TLS — allow fallback</option>
                    <option value="require">Require — verified TLS</option>
                    <option value="disable">Disable — unencrypted</option>
                  </select>
                </label>
                <div className="form-row ca-field">
                  <span>Custom CA</span>
                  {value.caPath ? (
                    <code className="ca-path" title={value.caPath}>
                      {value.caPath}
                    </code>
                  ) : (
                    <em className="ca-path is-empty">System trust store</em>
                  )}
                  <button
                    className={
                      "button compact " + (value.caPath ? "ghost" : "secondary")
                    }
                    type="button"
                    onClick={() => void chooseCa()}
                  >
                    {value.caPath ? "Change certificate" : "Choose PEM file"}
                  </button>
                  {value.caPath && (
                    <button
                      type="button"
                      className="button compact ghost ca-remove"
                      onClick={() => update("caPath", null)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <p className="form-help">
                {value.sslMode === "require"
                  ? "Verified TLS checks the server certificate and hostname. Your custom CA is used when selected."
                  : value.sslMode === "disable"
                    ? "Traffic is not encrypted. Use only on networks you trust."
                    : "This mode may connect without encryption. Choose Require for verified TLS."}
              </p>
            </section>
          </div>
        </fieldset>
        <div
          className={
            "profile-validation" +
            (error ? " is-error" : tested ? " is-verified" : "")
          }
          aria-live="polite"
        >
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {tested && (
            <p className="connection-success">
              <span className="status-glyph" aria-hidden="true">
                <Check size={11} strokeWidth={3} />
              </span>
              <span>
                <strong>Connection verified</strong> · {server}
              </span>
            </p>
          )}
          {!tested && !error && (
            <p className="profile-test-hint">
              {busy === "test" ? (
                <Loader2 size={15} className="spin" aria-hidden="true" />
              ) : (
                <Info size={15} aria-hidden="true" />
              )}
              {busy === "test"
                ? "Checking the server and credentials…"
                : "Test the connection to enable saving. Your data will not be modified."}
            </p>
          )}
        </div>
        <SheetFooter
          start={
            <>
              <ShieldCheck size={12} aria-hidden="true" /> Profiles never
              contain passwords
            </>
          }
        >
          <button
            type="button"
            className="button secondary"
            disabled={!!busy}
            onClick={() => closeSafely(onClose)}
          >
            Cancel
          </button>
          <button type="submit" className="button secondary" disabled={!!busy}>
            {busy === "test" && <Loader2 size={14} className="spin" />}Test
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
            {busy === "save" && <Loader2 size={14} className="spin" />}Save
            profile
          </button>
        </SheetFooter>
      </form>
    </Sheet>
  );
}
