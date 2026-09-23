import { useEffect, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type {
  ConstraintChange,
  SchemaChange,
} from "../../shared/types/structure";
import type { DatabaseDiagram } from "../../shared/types/diagram";
import { useDatabaseSession } from "../connections/SessionContext";
import { errorMessage } from "../../shared/lib/database-api";

type Addition = Extract<
  ConstraintChange,
  { kind: "createIndex" | "addForeignKey" }
>;
export function SchemaConstraints({
  draft,
  onChange,
  onEditingChange,
}: {
  draft: SchemaChange;
  onChange: (changes: ConstraintChange[]) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const { api } = useDatabaseSession();
  const changes = draft.constraints ?? [];
  const [form, setForm] = useState<Addition | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<DatabaseDiagram | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRelation = form?.kind === "addForeignKey";
  const editing = !!form;
  useEffect(() => {
    onEditingChange(editing);
    return () => onEditingChange(false);
  }, [editing, onEditingChange]);
  useEffect(() => {
    if (!isRelation) return;
    let current = true;
    setError(null);
    api
      .diagram()
      .then((data) => {
        if (current) setCatalog(data);
      })
      .catch((e) => {
        if (current) setError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, [api, isRelation]);
  const columns = draft.columns.filter((c) => !c.removed && c.name);
  const target =
    form?.kind === "addForeignKey"
      ? catalog?.tables.find(
          (t) => t.schema === form.targetSchema && t.name === form.targetTable,
        )
      : undefined;
  const toggleRemoval = (
    kind: "dropIndex" | "dropForeignKey",
    name: string,
  ) => {
    const exists = changes.some((c) => c.kind === kind && c.name === name);
    onChange(
      exists
        ? changes.filter(
            (c) =>
              c.name !== name ||
              (c.kind !== kind &&
                c.kind !==
                  (kind === "dropIndex" ? "createIndex" : "addForeignKey")),
          )
        : [...changes, { kind, name }],
    );
  };
  const cancel = () => {
    setForm(null);
    setReplacing(null);
  };
  return (
    <section
      className="schema-constraints"
      aria-label="Indexes and relationships"
    >
      <div className="schema-section-heading">
        <h2>Indexes & relationships</h2>
        <div className="schema-constraint-actions">
          <button
            className="button ghost"
            disabled={!!form}
            onClick={() =>
              setForm({
                kind: "createIndex",
                name: "",
                columns: [""],
                unique: false,
              })
            }
          >
            <Plus size={15} />
            Index
          </button>
          <button
            className="button ghost"
            disabled={!!form}
            onClick={() =>
              setForm({
                kind: "addForeignKey",
                name: "",
                columns: [""],
                targetSchema: "",
                targetTable: "",
                targetColumns: [""],
                onDelete: "NO ACTION",
                onUpdate: "NO ACTION",
              })
            }
          >
            <Plus size={15} />
            Relationship
          </button>
        </div>
      </div>
      {draft.expected?.indexes.map((index) => {
        const simple =
          index.method === "btree" &&
          !index.predicate &&
          !index.includedColumns.length &&
          !index.primary &&
          !index.constraintName &&
          index.columns.every((name) =>
            draft.columns.some((c) => c.original === name),
          );
        const removed = changes.some(
          (c) => c.kind === "dropIndex" && c.name === index.name,
        );
        return (
          <div
            className="schema-constraint-row"
            key={`index-${index.name}`}
            data-removed={removed}
          >
            <div>
              <strong>{index.name}</strong>
              <small>
                {index.primary
                  ? "Primary key"
                  : index.unique
                    ? "Unique index"
                    : "Index"}{" "}
                · {index.definition}
              </small>
            </div>
            {simple && (
              <button
                className="button ghost"
                aria-label={`Edit index ${index.name}`}
                disabled={removed || !!form}
                onClick={() => {
                  setReplacing(index.name);
                  setForm({
                    kind: "createIndex",
                    name: index.name,
                    columns: index.columns.map(
                      (name) =>
                        draft.columns.find((c) => c.original === name)!.name,
                    ),
                    unique: index.unique,
                  });
                }}
              >
                Edit
              </button>
            )}
            <button
              className="icon-button"
              aria-label={`${removed ? "Restore" : "Remove"} index ${index.name}`}
              title={
                index.constraintName || index.primary
                  ? "Constraint-owned index; use SQL"
                  : "Stage removal"
              }
              disabled={!!index.constraintName || index.primary || !!form}
              onClick={() => toggleRemoval("dropIndex", index.name)}
            >
              {removed ? <RotateCcw size={15} /> : <Trash2 size={15} />}
            </button>
          </div>
        );
      })}
      {draft.expected?.foreignKeys
        .filter((fk) => fk.direction === "outgoing")
        .map((fk) => {
          const advanced =
            !fk.validated ||
            draft.expected?.constraints.some(
              (c) => c.name === fk.name && c.deferrable,
            ) ||
            /MATCH (FULL|PARTIAL)|DEFERRABLE|NOT VALID/.test(fk.definition);
          const removed = changes.some(
            (c) => c.kind === "dropForeignKey" && c.name === fk.name,
          );
          return (
            <div
              className="schema-constraint-row"
              key={`fk-${fk.name}`}
              data-removed={removed}
            >
              <div>
                <strong>{fk.name}</strong>
                <small>
                  {fk.sourceColumns.join(", ")} → {fk.targetSchema}.
                  {fk.targetTable} ({fk.targetColumns.join(", ")})
                </small>
              </div>
              <button
                className="button ghost"
                aria-label={`Edit relationship ${fk.name}`}
                title={
                  advanced
                    ? "Advanced relationship options require SQL"
                    : "Replace relationship after SQL review"
                }
                disabled={removed || !!form || advanced}
                onClick={() => {
                  setReplacing(fk.name);
                  setForm({
                    kind: "addForeignKey",
                    name: fk.name,
                    columns: fk.sourceColumns.map(
                      (name) =>
                        draft.columns.find((c) => c.original === name)?.name ??
                        name,
                    ),
                    targetSchema: fk.targetSchema,
                    targetTable: fk.targetTable,
                    targetColumns: fk.targetColumns,
                    onDelete: fk.onDelete.toUpperCase(),
                    onUpdate: fk.onUpdate.toUpperCase(),
                  });
                }}
              >
                Edit
              </button>
              <button
                className="icon-button"
                disabled={!!form}
                aria-label={`${removed ? "Restore" : "Remove"} relationship ${fk.name}`}
                onClick={() => toggleRemoval("dropForeignKey", fk.name)}
              >
                {removed ? <RotateCcw size={15} /> : <Trash2 size={15} />}
              </button>
            </div>
          );
        })}
      {changes
        .filter((c) => c.kind === "createIndex" || c.kind === "addForeignKey")
        .map((item) => (
          <div
            className="schema-constraint-row is-pending"
            key={`${item.kind}-${item.name}`}
          >
            <div>
              <strong>{item.name}</strong>
              <small>
                Pending {item.kind === "createIndex" ? "index" : "relationship"}{" "}
                · {item.columns.join(", ")}
                {item.kind === "addForeignKey"
                  ? ` → ${item.targetSchema}.${item.targetTable} (${item.targetColumns.join(", ")})`
                  : ""}
              </small>
            </div>
            <button
              className="button ghost"
              aria-label={`Undo change ${item.name}`}
              onClick={() =>
                onChange(
                  changes.filter(
                    (c) =>
                      c !== item &&
                      !(
                        c.name === item.name &&
                        c.kind ===
                          (item.kind === "createIndex"
                            ? "dropIndex"
                            : "dropForeignKey")
                      ),
                  ),
                )
              }
            >
              Undo
            </button>
          </div>
        ))}
      {!form &&
        !changes.length &&
        !draft.expected?.indexes.length &&
        !draft.expected?.foreignKeys.some(
          (fk) => fk.direction === "outgoing",
        ) && (
          <p className="schema-editor-hint">
            Add an index for lookups or a foreign key to connect this table to
            another.
          </p>
        )}
      {form && (
        <div
          className="schema-constraint-form"
          aria-label={isRelation ? "Relationship draft" : "Index draft"}
        >
          <h3>
            {replacing
              ? isRelation
                ? "Replace relationship"
                : "Replace index"
              : isRelation
                ? "New relationship"
                : "New index"}
          </h3>
          <label>
            Name
            <input
              autoFocus
              aria-label="Constraint name"
              value={form.name}
              readOnly={!!replacing}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          {form.kind === "createIndex" ? (
            <label className="schema-check">
              <input
                type="checkbox"
                checked={form.unique}
                onChange={(e) => setForm({ ...form, unique: e.target.checked })}
              />
              Unique · reject duplicate values
            </label>
          ) : (
            <>
              <label>
                Referenced table
                <select
                  aria-label="Referenced table"
                  value={
                    target ? JSON.stringify([target.schema, target.name]) : ""
                  }
                  onChange={(e) => {
                    const [targetSchema, targetTable] = JSON.parse(
                      e.target.value,
                    ) as [string, string];
                    setForm({
                      ...form,
                      targetSchema,
                      targetTable,
                      targetColumns: form.columns.map(() => ""),
                    });
                  }}
                >
                  <option value="" disabled>
                    {catalog ? "Choose table…" : "Loading tables…"}
                  </option>
                  {catalog?.tables.map((t) => (
                    <option
                      key={JSON.stringify([t.schema, t.name])}
                      value={JSON.stringify([t.schema, t.name])}
                    >
                      {t.schema}.{t.name}
                    </option>
                  ))}
                </select>
              </label>
              {error && (
                <p role="alert" className="schema-editor-error">
                  {error} Cancel and reopen to retry.
                </p>
              )}
            </>
          )}
          {form.columns.map((value, i) => (
            <div className="schema-column-pair" key={i}>
              <label>
                {isRelation ? "Source column" : "Index column"} {i + 1}
                <select
                  aria-label={`Source column ${i + 1}`}
                  value={value}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      columns: form.columns.map((v, n) =>
                        n === i ? e.target.value : v,
                      ),
                    })
                  }
                >
                  <option value="" disabled>
                    Choose column…
                  </option>
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {form.kind === "addForeignKey" && (
                <label>
                  Referenced column {i + 1}
                  <select
                    aria-label={`Referenced column ${i + 1}`}
                    value={form.targetColumns[i]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        targetColumns: form.targetColumns.map((v, n) =>
                          n === i ? e.target.value : v,
                        ),
                      })
                    }
                  >
                    <option value="" disabled>
                      Choose column…
                    </option>
                    {target?.columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                        {c.primaryKey ? " · PK" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="icon-button"
                aria-label={`Remove column pair ${i + 1}`}
                disabled={form.columns.length === 1}
                onClick={() =>
                  setForm({
                    ...form,
                    columns: form.columns.filter((_, n) => n !== i),
                    ...(form.kind === "addForeignKey"
                      ? {
                          targetColumns: form.targetColumns.filter(
                            (_, n) => n !== i,
                          ),
                        }
                      : {}),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="button ghost"
            disabled={form.columns.length >= 32}
            onClick={() =>
              setForm({
                ...form,
                columns: [...form.columns, ""],
                ...(form.kind === "addForeignKey"
                  ? { targetColumns: [...form.targetColumns, ""] }
                  : {}),
              })
            }
          >
            <Plus size={15} />
            Add column {isRelation ? "pair" : ""}
          </button>
          {form.kind === "addForeignKey" && (
            <div className="schema-column-pair">
              {(["onDelete", "onUpdate"] as const).map((key) => (
                <label key={key}>
                  {key === "onDelete" ? "On delete" : "On update"}
                  <select
                    aria-label={key === "onDelete" ? "On delete" : "On update"}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  >
                    {[
                      "NO ACTION",
                      "RESTRICT",
                      "CASCADE",
                      "SET NULL",
                      "SET DEFAULT",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <p className="schema-editor-hint">
            Column order matters. Changes are staged, then reviewed and applied
            together. Creating an index or validating a relationship can block
            writes.
          </p>
          <div className="schema-constraint-actions">
            <button className="button ghost" onClick={cancel}>
              Cancel
            </button>
            <button
              className="button secondary"
              disabled={
                !form.name.trim() ||
                form.columns.some((v) => !v) ||
                (form.kind === "addForeignKey" &&
                  (!target || form.targetColumns.some((v) => !v))) ||
                changes.some(
                  (c) => c.kind === form.kind && c.name === form.name,
                )
              }
              onClick={() => {
                onChange([
                  ...changes,
                  ...(replacing
                    ? [
                        {
                          kind: (form.kind === "createIndex"
                            ? "dropIndex"
                            : "dropForeignKey") as
                            "dropIndex" | "dropForeignKey",
                          name: replacing,
                        },
                      ]
                    : []),
                  form,
                ]);
                cancel();
              }}
            >
              Stage {isRelation ? "relationship" : "index"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
