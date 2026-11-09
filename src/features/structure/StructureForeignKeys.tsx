import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  GitFork,
} from "lucide-react";
import type { StructureForeignKey } from "../../shared/types/structure";
import { StructureDefinitionRow, StructureEmpty } from "./StructureDefinitions";

type StructureForeignKeysProps = {
  foreignKeys: StructureForeignKey[];
  onOpenTable: (schema: string, table: string) => void;
};

export function StructureForeignKeys({
  foreignKeys,
  onOpenTable,
}: StructureForeignKeysProps) {
  if (!foreignKeys.length)
    return (
      <StructureEmpty
        title="No foreign keys"
        description="This table does not reference other tables, and no other table references it."
        Icon={GitFork}
      />
    );
  return (
    <div className="structure-metadata-scroll">
      <table
        className="structure-metadata-table foreign-keys"
        aria-label="Foreign keys"
      >
        <thead>
          <tr>
            <th scope="col">Name / direction</th>
            <th scope="col">Relationship</th>
            <th scope="col">Referential actions</th>
            <th scope="col">Validation</th>
            <th scope="col">Definition</th>
          </tr>
        </thead>
        {foreignKeys.map((key) => {
          const outgoing = key.direction === "outgoing";
          return (
            <StructureDefinitionRow
              key={`${key.direction}.${key.sourceSchema}.${key.sourceTable}.${key.name}`}
              name={key.name}
              definition={key.definition}
              columnCount={5}
            >
              <th scope="row">
                <div className="structure-object-name">
                  <code>{key.name}</code>
                </div>
                <span className="structure-object-kind">
                  {outgoing ? (
                    <ArrowUpRight size={12} aria-hidden="true" />
                  ) : (
                    <ArrowDownLeft size={12} aria-hidden="true" />
                  )}
                  {outgoing ? "References" : "Referenced by"}
                </span>
              </th>
              <td>
                <div className="structure-relationship-path">
                  <TableEndpoint
                    schema={key.sourceSchema}
                    table={key.sourceTable}
                    columns={key.sourceColumns}
                    onOpenTable={onOpenTable}
                  />
                  <ArrowRight size={14} aria-label="references" />
                  <TableEndpoint
                    schema={key.targetSchema}
                    table={key.targetTable}
                    columns={key.targetColumns}
                    onOpenTable={onOpenTable}
                  />
                </div>
              </td>
              <td>
                <dl className="structure-foreign-key-actions">
                  <div>
                    <dt>On update</dt>
                    <dd>{key.onUpdate}</dd>
                  </div>
                  <div>
                    <dt>On delete</dt>
                    <dd>{key.onDelete}</dd>
                  </div>
                </dl>
              </td>
              <td>
                <span
                  className={`structure-metadata-status${key.validated ? "" : " warning"}`}
                >
                  {key.validated ? (
                    <Check size={12} aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={12} aria-hidden="true" />
                  )}
                  {key.validated ? "Validated" : "Not validated"}
                </span>
              </td>
            </StructureDefinitionRow>
          );
        })}
      </table>
    </div>
  );
}

function TableEndpoint({
  schema,
  table,
  columns,
  onOpenTable,
}: {
  schema: string;
  table: string;
  columns: string[];
  onOpenTable: StructureForeignKeysProps["onOpenTable"];
}) {
  return (
    <div className="structure-relationship-endpoint">
      <button
        type="button"
        className="structure-table-link"
        aria-label={`Open table ${schema}.${table}`}
        onClick={() => onOpenTable(schema, table)}
      >
        <span>{schema}.</span>
        <strong>{table}</strong>
      </button>
      <code>{columns.join(", ")}</code>
    </div>
  );
}
