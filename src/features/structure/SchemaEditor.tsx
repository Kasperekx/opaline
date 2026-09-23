import { useEffect, useRef, useState } from "react";
import { Plus, RotateCcw, Trash2, Columns3 } from "lucide-react";
import type { SchemaTab } from "../query/query-types";
import type {
  ColumnDraft,
  RelationStructure,
  SchemaChange,
  SchemaPlan,
  EnumType,
} from "../../shared/types/structure";
import { useDatabaseSession } from "../connections/SessionContext";
import { EnvironmentBadge } from "../connections/EnvironmentBadge";
import { useWorkRisk } from "../../shared/safety/WorkSafety";
import { useOperationLock } from "../../shared/hooks/useOperationLock";
import { errorMessage } from "../../shared/lib/database-api";
import { useRelationStructure } from "./useRelationStructure";
import "./schema-editor.css";
import { ColumnDefault } from "./ColumnDefault";
import { SchemaConstraints } from "./SchemaConstraints";
import { SchemaEnums } from "./SchemaEnums";
import { qualifiedRelationName } from "../../shared/lib/database-object";

const types = [
  "text",
  "boolean",
  "smallint",
  "integer",
  "bigint",
  "numeric",
  "real",
  "double precision",
  "uuid",
  "date",
  "timestamp",
  "timestamptz",
  "json",
  "jsonb",
  "bytea",
];
const newColumn = (): ColumnDraft => ({
  original: null,
  name: "",
  dataType: "text",
  nullable: true,
  primaryKey: false,
  defaultValue: null,
  defaultMode: "drop",
  identity: false,
  removed: false,
});
type Props = {
  tab: SchemaTab;
  online: boolean;
  canApply: () => boolean;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onApplied: (input: SchemaChange) => void;
  onApplyingChange?: (busy: boolean) => void;
};

export function SchemaEditor(props: Props) {
  const snapshot = useRelationStructure(
    props.tab.schema,
    props.tab.table ?? "",
    !!props.tab.table,
  );
  if (props.tab.table && !snapshot.data)
    return (
      <div
        className="structure-empty"
        role={snapshot.error ? "alert" : "status"}
      >
        {snapshot.error ?? "Loading table structure…"}
        {snapshot.error && (
          <button className="button secondary" onClick={snapshot.refresh}>
            Retry
          </button>
        )}
      </div>
    );
  return (
    <SchemaDraftEditor
      {...props}
      initial={props.tab.table ? snapshot.data : null}
    />
  );
}

function SchemaDraftEditor({
  tab,
  initial,
  online,
  canApply,
  onDirtyChange,
  onApplied,
  onApplyingChange,
}: Props & { initial: RelationStructure | null }) {
  const { session, api } = useDatabaseSession();
  const [enumCatalog, setEnumCatalog] = useState<EnumType[]>([]);
  const [enumError, setEnumError] = useState<string | null>(null);
  const [enumRevision, setEnumRevision] = useState(0);
  useEffect(() => {
    let current = true;
    api
      .listEnumTypes()
      .then((types) => {
        if (current) {
          setEnumCatalog(types ?? []);
          setEnumError(null);
        }
      })
      .catch((e) => {
        if (current) setEnumError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, [api, enumRevision]);
  const [baseline] = useState<SchemaChange>(() => ({
    schema: tab.schema,
    table: tab.table ?? "",
    original: tab.table,
    expected: initial,
    columns: initial
      ? initial.columns.map((c) => ({
          original: c.name,
          name: c.name,
          dataType: c.dataType,
          nullable: c.nullable,
          primaryKey: c.primaryKey,
          defaultValue: c.defaultValue,
          defaultMode: "keep",
          identity: c.identity,
          removed: false,
        }))
      : [
          {
            ...newColumn(),
            name: "id",
            dataType: "bigint",
            nullable: false,
            primaryKey: true,
            identity: true,
          },
        ],
    dropTable: false,
    constraints: [],
    enumChanges: [],
  }));
  const [draft, setDraft] = useState<SchemaChange>(() => ({
    ...baseline,
    dropTable: !!tab.drop,
  }));
  const enumOptions = [
    ...enumCatalog,
    ...(draft.enumChanges ?? []).filter(
      (item) => !item.original && item.name && item.schema,
    ),
  ];
  const [plan, setPlan] = useState<SchemaPlan | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [constraintEditing, setConstraintEditing] = useState(false);
  const [constraintRevision, setConstraintRevision] = useState(0);
  const editorRef = useRef<HTMLElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (plan) reviewRef.current?.focus();
  }, [plan]);
  const lock = useOperationLock();
  const dirty =
    constraintEditing || JSON.stringify(draft) !== JSON.stringify(baseline);
  const editable =
    !session.readOnly &&
    (!initial || initial.objectType === "Table") &&
    !unknown;
  const target = `${draft.schema}.${draft.original ?? draft.table}`;
  const discard = () => {
    setDraft(baseline);
    setPlan(null);
    setConfirmation("");
    setError(null);
    setConstraintEditing(false);
    setConstraintRevision((v) => v + 1);
  };
  useWorkRisk({
    sessionId: session.id,
    tabId: tab.id,
    label: `${target}: structure draft`,
    dirty: dirty || unknown,
    busy,
    discard,
    warning: unknown
      ? "Commit outcome is unknown. Inspect the database before retrying."
      : undefined,
  });
  useEffect(() => {
    onDirtyChange(tab.id, dirty || unknown);
    return () => onDirtyChange(tab.id, false);
  }, [dirty, unknown, onDirtyChange, tab.id]);
  const change = (patch: Partial<SchemaChange>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setPlan(null);
    setConfirmation("");
    setError(null);
  };
  const columnChange = (index: number, patch: Partial<ColumnDraft>) =>
    change({
      columns: draft.columns.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    });
  const review = () =>
    void lock(async () => {
      setBusy(true);
      setError(null);
      try {
        setPlan(await api.previewSchemaChange(draft));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    });
  const apply = () =>
    void lock(async () => {
      if (!plan || !editable || !online) return;
      if (!canApply()) {
        setError(
          "Save or discard other pending work and wait for running operations before changing the schema.",
        );
        return;
      }
      setBusy(true);
      setError(null);
      try {
        onApplyingChange?.(true);
        await api.applySchemaChange(draft, confirmation);
        onApplied(draft);
      } catch (e) {
        const failure = e as { kind?: string; message?: string };
        setError(failure?.message ?? errorMessage(e));
        // A transport/IPC failure may have happened after commit. Never offer a blind retry.
        if (failure?.kind !== "rejected") setUnknown(true);
      } finally {
        onApplyingChange?.(false);
        setBusy(false);
      }
    });
  return (
    <section
      ref={editorRef}
      className="schema-editor"
      aria-label="Table structure editor"
      aria-busy={busy}
    >
      <header className="schema-editor-header">
        <Columns3 size={19} />
        <div>
          <h1>{tab.table ? "Edit table structure" : "New table"}</h1>
          <p>
            {session.name} · {session.database}
          </p>
        </div>
        <EnvironmentBadge
          environment={session.environment}
          readOnly={session.readOnly}
        />
      </header>
      <div className="schema-editor-body">
        {!editable && (
          <p role="status">
            {unknown
              ? "Verify the database, then close and reopen this editor. Automatic retry is disabled."
              : session.readOnly
                ? "This connection is read-only."
                : "Use SQL to edit views, partitions and foreign tables."}
          </p>
        )}
        <fieldset disabled={!editable || busy}>
          <div className="schema-editor-identity">
            <label>
              Schema
              <input
                aria-label="Table schema"
                value={draft.schema}
                readOnly={!!initial}
                onChange={(e) => change({ schema: e.target.value })}
              />
            </label>
            <label>
              Table name
              <input
                aria-label="Table name"
                value={draft.table}
                disabled={draft.dropTable}
                placeholder="e.g. orders"
                onChange={(e) => change({ table: e.target.value })}
              />
            </label>
          </div>
          {draft.dropTable ? (
            <div className="schema-drop-summary">
              <h2>Drop {target}</h2>
              <p>
                This permanently removes the table, its data, indexes and table
                constraints. There is no undo after applying.
              </p>
              <p>
                External dependencies are not removed automatically. PostgreSQL
                will reject the operation when they prevent a restricted drop.
              </p>
              <button
                className="button secondary"
                onClick={() => change({ dropTable: false })}
              >
                Keep table
              </button>
            </div>
          ) : (
            <>
              <div className="schema-section-heading">
                <h2>
                  Columns{" "}
                  <span>{draft.columns.filter((c) => !c.removed).length}</span>
                </h2>
                <button
                  className="button ghost"
                  onClick={() => {
                    change({ columns: [...draft.columns, newColumn()] });
                    requestAnimationFrame(() =>
                      editorRef.current
                        ?.querySelector<HTMLInputElement>(
                          `[aria-label="Column ${draft.columns.length + 1} name"]`,
                        )
                        ?.focus(),
                    );
                  }}
                >
                  <Plus size={15} />
                  Add column
                </button>
              </div>
              <div className="schema-columns-scroll">
                <table className="schema-columns">
                  <colgroup>
                    <col />
                    <col />
                    <col className="schema-boolean-column" />
                    <col className="schema-boolean-column" />
                    <col className="schema-boolean-column" />
                    <col />
                    <col className="schema-action-column" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Nullable</th>
                      <th>Primary key</th>
                      <th>Identity</th>
                      <th>Default</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.columns.map((column, index) => (
                      <tr
                        key={index}
                        data-state={
                          column.removed
                            ? "removed"
                            : column.original === null
                              ? "added"
                              : column.original !== column.name
                                ? "changed"
                                : undefined
                        }
                      >
                        <td>
                          <input
                            aria-label={`Column ${index + 1} name`}
                            disabled={column.removed}
                            value={column.name}
                            placeholder="column_name"
                            onChange={(e) =>
                              columnChange(index, { name: e.target.value })
                            }
                          />
                          {column.original &&
                            column.original !== column.name && (
                              <small>Was {column.original}</small>
                            )}
                        </td>
                        <td>
                          <select
                            aria-label={`Column ${index + 1} type`}
                            disabled={
                              column.removed ||
                              (!!column.original &&
                                (column.identity ||
                                  !!initial?.columns.find(
                                    (c) => c.name === column.original,
                                  )?.generated))
                            }
                            value={column.dataType}
                            onChange={(e) =>
                              columnChange(index, {
                                dataType: e.target.value,
                                enumType: (() => {
                                  const selected = enumOptions.find(
                                    (item) =>
                                      qualifiedRelationName(
                                        item.schema,
                                        item.name,
                                      ) === e.target.value,
                                  );
                                  return selected
                                    ? {
                                        schema: selected.schema,
                                        name: selected.name,
                                      }
                                    : null;
                                })(),
                                identity: column.original
                                  ? column.identity
                                  : false,
                              })
                            }
                          >
                            {!types.includes(column.dataType) &&
                              !enumOptions.some(
                                (item) =>
                                  qualifiedRelationName(
                                    item.schema,
                                    item.name,
                                  ) === column.dataType,
                              ) && <option>{column.dataType}</option>}
                            {types.map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                            {enumOptions.length > 0 && (
                              <optgroup label="Enum types">
                                {enumOptions.map((item, i) => (
                                  <option
                                    key={i}
                                    value={qualifiedRelationName(
                                      item.schema,
                                      item.name,
                                    )}
                                  >
                                    {item.schema}.{item.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Column ${index + 1} nullable`}
                            checked={column.nullable}
                            disabled={
                              !!initial?.columns.find(
                                (c) => c.name === column.original,
                              )?.generated ||
                              column.primaryKey ||
                              column.identity ||
                              column.removed
                            }
                            onChange={(e) =>
                              columnChange(index, {
                                nullable: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Column ${index + 1} primary key`}
                            checked={column.primaryKey}
                            disabled={!!initial || column.removed}
                            onChange={(e) =>
                              columnChange(index, {
                                primaryKey: e.target.checked,
                                nullable: e.target.checked
                                  ? false
                                  : column.nullable,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Column ${index + 1} identity`}
                            checked={column.identity}
                            disabled={
                              !!column.original ||
                              column.removed ||
                              !["smallint", "integer", "bigint"].includes(
                                column.dataType,
                              )
                            }
                            onChange={(e) =>
                              columnChange(index, {
                                identity: e.target.checked,
                                defaultValue: null,
                                defaultMode: "drop",
                                nullable: e.target.checked
                                  ? false
                                  : column.nullable,
                              })
                            }
                          />
                        </td>
                        <td>
                          <ColumnDefault
                            column={column}
                            index={index}
                            originalDefault={
                              initial?.columns.find(
                                (c) => c.name === column.original,
                              )?.defaultValue ?? null
                            }
                            disabled={
                              column.removed ||
                              column.identity ||
                              !!initial?.columns.find(
                                (c) => c.name === column.original,
                              )?.generated
                            }
                            onChange={(patch) => columnChange(index, patch)}
                          />
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`${column.removed ? "Restore" : "Remove"} column ${index + 1}`}
                            onClick={() =>
                              column.original
                                ? columnChange(index, {
                                    removed: !column.removed,
                                  })
                                : change({
                                    columns: draft.columns.filter(
                                      (_, i) => i !== index,
                                    ),
                                  })
                            }
                          >
                            {column.removed ? (
                              <RotateCcw size={15} />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="schema-editor-hint">
                Literal defaults are values, not SQL. Keep existing preserves
                the original expression. Type changes use PostgreSQL assignment
                casts; unsupported conversions are rejected.
              </p>
              <SchemaConstraints
                key={constraintRevision}
                draft={draft}
                onEditingChange={setConstraintEditing}
                onChange={(constraints) => change({ constraints })}
              />
              {enumError && (
                <p role="alert" className="schema-editor-error">
                  {enumError}{" "}
                  <button
                    className="button ghost"
                    onClick={() => setEnumRevision((v) => v + 1)}
                  >
                    Reload enum types
                  </button>
                </p>
              )}
              <SchemaEnums
                catalog={enumCatalog}
                schema={draft.schema}
                changes={draft.enumChanges ?? []}
                onChange={(enumChanges) => change({ enumChanges })}
              />
              {initial && (
                <button
                  className="button danger schema-drop-action"
                  disabled={
                    constraintEditing ||
                    !!draft.constraints?.length ||
                    !!draft.enumChanges?.length
                  }
                  onClick={() => change({ dropTable: true })}
                >
                  <Trash2 size={15} />
                  Drop table…
                </button>
              )}
            </>
          )}
        </fieldset>
        {error && (
          <p className="schema-editor-error" role="alert">
            {error}
          </p>
        )}
        {plan && (
          <section
            ref={reviewRef}
            tabIndex={-1}
            className="schema-review"
            aria-label="Review schema changes"
          >
            <h2>Review changes</h2>
            <p>
              {session.host}:{session.port} / {session.database} ·{" "}
              {session.environment}
            </p>
            <pre tabIndex={0}>{plan.sql}</pre>
            {plan.destructive && (
              <>
                <p className="schema-editor-error">
                  This change can remove data or constraints, convert stored
                  values, or enable cascading changes. There is no undo after
                  commit. Dropping a column also removes its dependent indexes
                  and constraints.
                </p>
                <label>
                  Type {target} to confirm
                  <input
                    aria-label="Confirm table name"
                    autoComplete="off"
                    spellCheck={false}
                    value={confirmation}
                    disabled={busy}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
              </>
            )}
            {session.environment === "production" && (
              <p className="schema-editor-error">
                Production database — applying changes affects the live schema.
              </p>
            )}
            <p className="schema-editor-hint">
              Changes may briefly block other database operations. Lock waits
              are limited; failed changes are rolled back before commit.
            </p>
          </section>
        )}
      </div>
      <footer className="schema-editor-footer">
        <span role="status">
          {unknown
            ? "Outcome unknown"
            : dirty
              ? "Unsaved structure changes"
              : "Changes stay local until applied"}
        </span>
        <button
          className="button ghost"
          disabled={!dirty || busy || unknown}
          onClick={discard}
        >
          Discard
        </button>
        {plan ? (
          <button
            className="button primary"
            disabled={
              !editable ||
              constraintEditing ||
              !online ||
              busy ||
              (plan.destructive && confirmation !== target)
            }
            onClick={apply}
          >
            {busy ? "Applying…" : "Apply changes"}
          </button>
        ) : (
          <button
            className="button primary"
            disabled={
              !editable || busy || constraintEditing || (!dirty && !!initial)
            }
            onClick={review}
          >
            {busy ? "Preparing…" : "Review SQL"}
          </button>
        )}
      </footer>
    </section>
  );
}
