import { KeyRound, LockKeyhole } from "lucide-react";
import type { StructureColumn } from "../../shared/types/structure";

export function StructureColumns({ columns }: { columns: StructureColumn[] }) {
  return (
    <div className="structure-columns-wrap">
      <table className="structure-columns">
        <caption className="sr-only">Column definitions</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Column</th>
            <th scope="col">Type</th>
            <th scope="col">Nullable</th>
            <th scope="col">Default / generation</th>
            <th scope="col">Comment</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.name}>
              <td className="structure-position">{column.position}</td>
              <th scope="row">
                <span className="structure-column-name">
                  {column.primaryKey && (
                    <KeyRound size={13} aria-label="Primary key" />
                  )}
                  <span>{column.name}</span>
                </span>
              </th>
              <td>
                <code className="structure-type">{column.dataType}</code>
                {column.enumValues.length > 0 && (
                  <details className="structure-enum">
                    <summary>{column.enumValues.length} allowed values</summary>
                    <span>{column.enumValues.join(" · ")}</span>
                  </details>
                )}
                {column.collation && (
                  <small>Collation: {column.collation}</small>
                )}
              </td>
              <td>
                {column.nullable ? (
                  <span className="structure-muted">Yes</span>
                ) : (
                  <span className="structure-required">
                    <LockKeyhole size={12} /> No
                  </span>
                )}
              </td>
              <td>
                {column.identity ? (
                  <>
                    <span className="structure-badge accent">
                      Identity ·{" "}
                      {column.identityGeneration === "a"
                        ? "always"
                        : "by default"}
                    </span>
                    <code className="structure-expression">
                      {column.identityOptions}
                    </code>
                  </>
                ) : column.generated ? (
                  <>
                    <span className="structure-badge">
                      Generated ·{" "}
                      {column.generationKind === "v" ? "virtual" : "stored"}
                    </span>
                    <code className="structure-expression">
                      {column.defaultValue}
                    </code>
                  </>
                ) : (
                  <code className="structure-expression">
                    {column.defaultValue ?? "—"}
                  </code>
                )}
              </td>
              <td className="structure-comment">{column.comment ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
