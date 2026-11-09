import { useId, useState, type ReactNode } from "react";
import type { DatabaseObject } from "../../shared/types/database";
import type { DumpFormat, DumpOptions } from "./backup-api";
export function useBackupOptions() {
  const [format, setFormat] = useState<DumpFormat>("custom");
  const [content, setContent] = useState<DumpOptions["content"]>("all");
  const [scope, setScope] = useState("database");
  const [selection, setSelection] = useState<string[]>([]);
  return {
    format,
    setFormat,
    content,
    setContent,
    scope,
    setScope,
    selection,
    setSelection,
  };
}

const compactCount = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  detail,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
  detail?: ReactNode;
}) {
  const labelId = useId();
  return (
    <div className="backup-row">
      <span className="backup-row-label" id={labelId}>
        {label}
      </span>
      <div className="segmented-capsule" role="group" aria-labelledby={labelId}>
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {text}
          </button>
        ))}
      </div>
      {detail}
    </div>
  );
}

export function BackupOptions({
  form,
  objects,
}: {
  form: ReturnType<typeof useBackupOptions>;
  objects: DatabaseObject[];
}) {
  const {
    format,
    setFormat,
    content,
    setContent,
    scope,
    setScope,
    selection,
    setSelection,
  } = form;
  const tables = objects.filter((o) => o.objectType === "table");
  const schemas = [...new Set(objects.map((object) => object.schema))];
  const items =
    scope === "schemas"
      ? schemas.map((schema) => {
          const count = tables.filter((t) => t.schema === schema).length;
          return {
            value: schema,
            label: schema,
            meta: `${count} ${count === 1 ? "table" : "tables"}`,
          };
        })
      : tables.map((o) => ({
          value: JSON.stringify([o.schema, o.name]),
          label: `${o.schema}.${o.name}`,
          meta:
            o.estimatedRows >= 0 ? compactCount.format(o.estimatedRows) : "",
        }));
  return (
    <section className="backup-section">
      <span className="backup-caption">Options</span>
      <div className="backup-group">
        <Segmented
          label="Format"
          value={format}
          options={[
            ["custom", "Custom archive (.dump)"],
            ["sql", "Plain SQL (.sql)"],
          ]}
          onChange={setFormat}
        />
        <Segmented
          label="Contents"
          value={content}
          options={[
            ["all", "Structure and data"],
            ["schema", "Structure only"],
            ["data", "Data only"],
          ]}
          onChange={setContent}
        />
        <Segmented
          label="Scope"
          value={scope}
          options={[
            ["database", "Entire database"],
            ["schemas", "Schemas"],
            ["tables", "Tables"],
          ]}
          onChange={(value) => {
            if (value === scope) return;
            setScope(value);
            setSelection([]);
          }}
          detail={
            scope !== "database" && (
              <span className="backup-row-detail">
                {selection.length} of {items.length}{" "}
                {scope === "schemas" ? "schemas" : "tables"}
              </span>
            )
          }
        />
        {scope !== "database" && items.length > 0 && (
          <div className="backup-scope-list">
            {items.map((item) => (
              <label className="backup-scope-item" key={item.value}>
                <input
                  type="checkbox"
                  checked={selection.includes(item.value)}
                  onChange={(event) =>
                    setSelection((values) =>
                      event.target.checked
                        ? [...values, item.value]
                        : values.filter((value) => value !== item.value),
                    )
                  }
                />
                <span>{item.label}</span>
                {item.meta && <small>{item.meta}</small>}
              </label>
            ))}
          </div>
        )}
        <div className="backup-row">
          <span className="backup-row-label">Save to</span>
          <span className="backup-row-detail backup-row-fill">
            You’ll choose a location in the Save dialog
          </span>
          <code>database.{format === "custom" ? "dump" : "sql"}</code>
        </div>
      </div>
      <p className={`backup-note${scope === "database" ? "" : " warning"}`}>
        {scope === "database"
          ? "One database only. Cluster roles and tablespaces are not included."
          : "Partial dumps may omit required dependencies and large objects. They are not guaranteed to restore independently."}
      </p>
    </section>
  );
}
