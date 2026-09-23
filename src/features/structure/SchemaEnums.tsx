import { Plus, X } from "lucide-react";
import type { EnumDraft, EnumType } from "../../shared/types/structure";
import { qualifiedRelationName as qualifiedName } from "../../shared/lib/database-object";

export function SchemaEnums({
  catalog,
  changes,
  schema,
  onChange,
}: {
  catalog: EnumType[];
  changes: EnumDraft[];
  schema: string;
  onChange: (changes: EnumDraft[]) => void;
}) {
  const update = (index: number, patch: Partial<EnumDraft>) =>
    onChange(
      changes.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  return (
    <details className="schema-enums">
      <summary>
        Enum types{changes.length > 0 ? ` · ${changes.length} drafts` : ""}
      </summary>
      <p className="schema-editor-hint">
        Shared across this database. Renaming a value affects every column using
        that type. Changes are staged for SQL review, not saved immediately.
      </p>
      <div className="schema-enum-actions">
        <label>
          Edit existing type
          <select
            value=""
            onChange={(event) => {
              const type = catalog.find(
                (item) =>
                  qualifiedName(item.schema, item.name) === event.target.value,
              );
              if (type)
                onChange([
                  ...changes,
                  {
                    schema: type.schema,
                    name: type.name,
                    original: type,
                    values: [...type.values],
                  },
                ]);
            }}
          >
            <option value="">Choose an enum…</option>
            {catalog
              .filter(
                (item) =>
                  !changes.some(
                    (c) => c.schema === item.schema && c.name === item.name,
                  ),
              )
              .map((item) => (
                <option
                  key={item.oid}
                  value={qualifiedName(item.schema, item.name)}
                >
                  {item.schema}.{item.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className="button secondary"
          onClick={() =>
            onChange([
              ...changes,
              { schema, name: "", original: null, values: [""] },
            ])
          }
        >
          <Plus size={15} />
          New enum type
        </button>
      </div>
      {changes.map((item, index) => (
        <section
          className="schema-enum-draft"
          key={index}
          aria-label={`Enum draft ${index + 1}`}
        >
          <div className="schema-enum-actions">
            <label>
              Schema
              <input
                aria-label={`Enum ${index + 1} schema`}
                readOnly={!!item.original}
                value={item.schema}
                onChange={(e) => update(index, { schema: e.target.value })}
              />
            </label>
            <label>
              Type name
              <input
                aria-label={`Enum ${index + 1} name`}
                readOnly={!!item.original}
                value={item.name}
                placeholder="e.g. order_status"
                onChange={(e) => update(index, { name: e.target.value })}
              />
            </label>
            <button
              className="icon-button"
              aria-label={`Discard enum draft ${index + 1}`}
              onClick={() => onChange(changes.filter((_, i) => i !== index))}
            >
              <X size={15} />
            </button>
          </div>
          <ol className="schema-enum-values">
            {item.values.map((value, position) => (
              <li key={position}>
                <label>
                  <span>
                    Value {position + 1}
                    {item.original?.values[position] !== undefined &&
                    item.original.values[position] !== value
                      ? ` · was “${item.original.values[position]}”`
                      : ""}
                  </span>
                  <input
                    aria-label={`Enum ${index + 1} value ${position + 1}`}
                    value={value}
                    placeholder="Empty string is a valid label"
                    onChange={(e) =>
                      update(index, {
                        values: item.values.map((v, i) =>
                          i === position ? e.target.value : v,
                        ),
                      })
                    }
                  />
                </label>
                {position >= (item.original?.values.length ?? 0) && (
                  <button
                    className="icon-button"
                    aria-label={`Remove new value ${position + 1} from enum ${index + 1}`}
                    onClick={() =>
                      update(index, {
                        values: item.values.filter((_, i) => i !== position),
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          <button
            className="button ghost"
            onClick={() => update(index, { values: [...item.values, ""] })}
          >
            <Plus size={15} />
            Add value
          </button>
        </section>
      ))}
      <p className="schema-editor-hint">
        Existing values cannot be removed or reordered here. Added values go at
        the end. Apply additions to an existing enum before using them as column
        defaults.
      </p>
    </details>
  );
}
