import { useState } from "react";
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
  const schemas = [...new Set(objects.map((object) => object.schema))];
  return (
    <>
      <div className="backup-options">
        <label>
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as DumpFormat)}
          >
            <option value="custom">Custom archive (.dump)</option>
            <option value="sql">Plain SQL (.sql)</option>
          </select>
        </label>
        <label>
          Contents
          <select
            value={content}
            onChange={(e) =>
              setContent(e.target.value as DumpOptions["content"])
            }
          >
            <option value="all">Structure and data</option>
            <option value="schema">Structure only</option>
            <option value="data">Data only</option>
          </select>
        </label>
      </div>
      <label>
        Scope
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setSelection([]);
          }}
        >
          <option value="database">Entire database</option>
          <option value="schemas">Selected schemas</option>
          <option value="tables">Selected tables</option>
        </select>
      </label>
      {scope !== "database" && (
        <div className="backup-scope-list">
          {(scope === "schemas"
            ? schemas
            : objects
                .filter((o) => o.objectType === "table")
                .map((o) => JSON.stringify([o.schema, o.name]))
          ).map((value) => (
            <label className="p1-check" key={value}>
              <input
                type="checkbox"
                checked={selection.includes(value)}
                onChange={(event) =>
                  setSelection((items) =>
                    event.target.checked
                      ? [...items, value]
                      : items.filter((item) => item !== value),
                  )
                }
              />
              {scope === "schemas"
                ? value
                : (JSON.parse(value) as string[]).join(".")}
            </label>
          ))}
        </div>
      )}
      <p className="p1-muted">
        {scope === "database"
          ? "One database only. Cluster roles and tablespaces are not included."
          : "Partial dumps may omit required dependencies and large objects. They are not guaranteed to restore independently."}
      </p>
    </>
  );
}
