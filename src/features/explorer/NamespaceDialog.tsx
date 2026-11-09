import {
  Database,
  Folder,
  FolderMinus,
  FolderPen,
  FolderPlus,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Sheet, SheetFooter } from "../../shared/components/Sheet";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useDatabaseSession } from "../connections/SessionContext";
import type { NamespaceKind } from "../../shared/types/structure";
import {
  useNamespaceChange,
  type NamespaceChangeOptions,
} from "./useNamespaceChange";
import { useSqlHighlight } from "../structure/sql-highlight";
import "./namespace-dialog.css";

export type NamespaceDialogMode = NamespaceKind;

const copy = {
  create: {
    title: "New schema",
    description:
      "Organize tables and other database objects in a separate schema.",
    action: "Create schema",
    progress: "Creating…",
  },
  rename: {
    title: "Rename schema",
    description:
      "Choose a new name. Open tabs in Opaline will follow the change.",
    action: "Rename schema",
    progress: "Renaming…",
  },
  drop: {
    title: "Delete schema",
    description:
      "Review what will be deleted before making a permanent change.",
    action: "Delete schema",
    progress: "Deleting…",
  },
};

export function NamespaceDialog({
  open,
  ...props
}: NamespaceChangeOptions & { open: boolean }) {
  return open ? (
    <NamespaceForm
      key={`${props.sessionId}:${props.mode}:${props.initialName ?? ""}`}
      {...props}
    />
  ) : null;
}

function NamespaceForm(props: NamespaceChangeOptions) {
  const { mode, online, readOnly, onClose } = props;
  const { session } = useDatabaseSession();
  const draft = useNamespaceChange(props);
  const labels = copy[mode];
  const fieldId = useId();
  const helpId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const reviewActionRef = useRef<HTMLButtonElement>(null);
  const dropOptionRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const sqlRef = useRef<HTMLElement>(null);
  const { plan, busy, unknown } = draft;
  useSqlHighlight(sqlRef, plan?.sql);

  useEffect(() => {
    if (plan) (confirmRef.current ?? reviewActionRef.current)?.focus();
    else if (inputRef.current) {
      inputRef.current.focus();
      if (mode === "rename") inputRef.current.select();
    } else dropOptionRef.current?.focus();
  }, [plan, mode]);

  useEffect(() => {
    if (draft.error) errorRef.current?.focus();
  }, [draft.error]);

  return (
    <Sheet
      title={labels.title}
      icon={
        mode === "drop"
          ? FolderMinus
          : mode === "rename"
            ? FolderPen
            : FolderPlus
      }
      tone={mode === "drop" ? "danger" : "accent"}
      className="namespace-dialog"
      size={520}
      busy={busy}
      onClose={onClose}
    >
      <form
        aria-describedby={descriptionId}
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          if (plan) draft.apply();
          else draft.review();
        }}
      >
        <div className="namespace-content">
          <p className="namespace-description" id={descriptionId}>
            {labels.description}
          </p>

          <div className="namespace-summary">
            <div className="namespace-destination">
              <span className="namespace-glyph" aria-hidden="true">
                <Database size={14} />
              </span>
              <div>
                <strong>{session.database}</strong>
                <span>{session.name}</span>
              </div>
              <EnvironmentBadge
                environment={session.environment}
                readOnly={readOnly}
              />
            </div>
            {mode !== "create" && (
              <div className="namespace-target">
                <span>
                  <Folder size={15} aria-hidden="true" /> Schema
                </span>
                <code>{draft.change.name}</code>
              </div>
            )}
          </div>

          {!plan && mode !== "drop" && (
            <label className="namespace-field" htmlFor={fieldId}>
              <span id={`${fieldId}-label`}>
                {mode === "rename" ? "New name" : "Schema name"}
              </span>
              <input
                ref={inputRef}
                id={fieldId}
                data-initial-focus="true"
                value={mode === "rename" ? draft.newName : draft.name}
                disabled={!draft.editable || busy}
                onChange={(event) => draft.setName(event.target.value)}
                placeholder="e.g. analytics"
                autoComplete="off"
                spellCheck={false}
                aria-labelledby={`${fieldId}-label`}
                aria-describedby={helpId}
              />
              <span className="namespace-help" id={helpId}>
                {mode === "rename"
                  ? "Queries outside Opaline may need the new schema name."
                  : "An empty schema will be created. No existing data is changed."}
              </span>
            </label>
          )}

          {!plan && mode === "drop" && (
            <fieldset
              className="namespace-drop-options"
              disabled={!draft.editable || busy}
            >
              <legend>Deletion behavior</legend>
              <div className="namespace-drop-list">
                <label>
                  <input
                    ref={dropOptionRef}
                    data-initial-focus="true"
                    type="radio"
                    name="drop-mode"
                    value="restrict"
                    checked={draft.dropMode === "restrict"}
                    onChange={() => draft.setDropMode("restrict")}
                  />
                  <span>
                    <strong>Only if empty</strong>
                    <span>Keep the schema if it contains any objects.</span>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="drop-mode"
                    value="cascade"
                    checked={draft.dropMode === "cascade"}
                    onChange={() => draft.setDropMode("cascade")}
                  />
                  <span>
                    <strong>Include contained objects</strong>
                    <span>Also delete tables, data and dependencies.</span>
                  </span>
                </label>
              </div>
            </fieldset>
          )}

          {mode !== "create" && draft.change.name === "public" && (
            <p className="namespace-notice">
              The default <code>public</code> schema is used by many
              applications. Changing it can break queries that rely on it.
            </p>
          )}
          {mode === "drop" && draft.dropMode === "cascade" && (
            <div className="namespace-notice namespace-notice-danger">
              <TriangleAlert size={15} aria-hidden="true" />
              <p>
                This uses CASCADE. Dependencies in other schemas may also be
                deleted. The SQL preview does not list every affected object.
              </p>
            </div>
          )}
          {plan && (
            <section className="namespace-review" aria-label="SQL preview">
              <div>
                <strong>SQL preview</strong>
                <span>Not applied yet</span>
              </div>
              <pre>
                <code ref={sqlRef}>{plan.sql}</code>
              </pre>
            </section>
          )}
          {plan && mode === "drop" && (
            <>
              {draft.dropMode === "cascade" && (
                <label className="namespace-ack">
                  <input
                    type="checkbox"
                    checked={draft.cascadeAck}
                    disabled={!draft.editable || busy}
                    onChange={(event) =>
                      draft.setCascadeAck(event.target.checked)
                    }
                  />
                  <span>
                    I understand that this also deletes contained objects and
                    their dependencies.
                  </span>
                </label>
              )}
              <label className="namespace-field" htmlFor={fieldId}>
                <span>
                  Type <code>{draft.change.name}</code> to confirm
                </span>
                <input
                  ref={confirmRef}
                  id={fieldId}
                  value={draft.confirmation}
                  disabled={!draft.editable || busy}
                  onChange={(event) =>
                    draft.setConfirmation(event.target.value)
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </>
          )}
          {(!online || readOnly) && (
            <p className="namespace-notice" role="status">
              {readOnly
                ? "This connection is read-only. Schema changes are unavailable."
                : "The connection is offline. Reconnect before changing schemas."}
            </p>
          )}
          {draft.error && (
            <div
              className="namespace-error"
              role="alert"
              ref={errorRef}
              tabIndex={-1}
            >
              <TriangleAlert size={15} aria-hidden="true" />
              <div>
                <strong>
                  {unknown
                    ? "Outcome not confirmed"
                    : "Schema change could not be completed"}
                </strong>
                <p>{draft.error}</p>
                {unknown && (
                  <p>
                    Reconnect and inspect the schema before trying again. This
                    request will not be retried.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <SheetFooter
          start={
            plan &&
            !unknown && (
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={draft.back}
              >
                Back
              </button>
            )
          }
        >
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {unknown ? "Close" : "Cancel"}
          </button>
          {!unknown && (
            <button
              ref={reviewActionRef}
              type="submit"
              className={`button ${plan && mode === "drop" ? "danger" : "primary"}`}
              disabled={
                !draft.editable ||
                busy ||
                (plan ? !draft.confirmReady : !draft.valid)
              }
            >
              {busy && (
                <Loader2 size={15} className="spin" aria-hidden="true" />
              )}
              {busy
                ? plan
                  ? labels.progress
                  : "Reviewing…"
                : plan
                  ? labels.action
                  : "Review SQL"}
            </button>
          )}
        </SheetFooter>
      </form>
    </Sheet>
  );
}
