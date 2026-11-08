import { ChevronRight, Columns3, KeyRound, LockKeyhole } from "lucide-react";
import type { StructureColumn } from "../../shared/types/structure";
import { StructureEmpty } from "./StructureDefinitions";

export function StructureColumns({ columns }: { columns: StructureColumn[] }) {
  if (!columns.length)
    return (
      <StructureEmpty
        title="No columns"
        description="This object has no column definitions."
        Icon={Columns3}
      />
    );
  return (
    <div className="structure-columns-wrap">
      <table className="structure-columns">
        <caption className="sr-only">Column definitions</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Column</th>
            <th scope="col">Type</th>
            <th scope="col">Nullability</th>
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
                  <span className="structure-column-key">
                    {column.primaryKey && (
                      <KeyRound size={13} aria-label="Primary key" />
                    )}
                  </span>
                  <span>{column.name}</span>
                </span>
              </th>
              <td>
                <code className="structure-type">{column.dataType}</code>
                {column.enumValues.length > 0 && (
                  <details className="structure-enum">
                    <summary>
                      <ChevronRight size={10} aria-hidden="true" />
                      {column.enumValues.length} allowed values
                    </summary>
                    <ul>
                      {column.enumValues.map((value) => (
                        <li key={value}>
                          <code>{value || '""'}</code>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {column.collation && (
                  <small>Collation: {column.collation}</small>
                )}
              </td>
              <td>
                {column.nullable ? (
                  <span className="structure-muted">Nullable</span>
                ) : (
                  <span className="structure-required">
                    <LockKeyhole size={11} aria-hidden="true" /> Not null
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
                ) : column.defaultValue === null ? (
                  <span className="structure-absent" aria-label="No default">
                    —
                  </span>
                ) : (
                  <code className="structure-expression">
                    {column.defaultValue}
                  </code>
                )}
              </td>
              <td className="structure-comment">
                {column.comment || (
                  <span className="structure-absent" aria-label="No comment">
                    —
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
