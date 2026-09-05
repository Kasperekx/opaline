import { ArrowDownLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { StructureForeignKey } from "../../shared/types/structure";
import { DefinitionDetails, StructureEmpty } from "./StructureDefinitions";

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
      />
    );
  return (
    <div className="structure-definition-list">
      {foreignKeys.map((key) => {
        const outgoing = key.direction === "outgoing";
        return (
          <article
            className="structure-definition-item"
            key={`${key.sourceSchema}.${key.sourceTable}.${key.name}`}
          >
            <header>
              <strong>{key.name}</strong>
              <span className="structure-badge accent">
                {outgoing ? (
                  <ArrowUpRight size={13} />
                ) : (
                  <ArrowDownLeft size={13} />
                )}
                {outgoing ? "References" : "Referenced by"}
              </span>
            </header>
            <div className="structure-relationship">
              <button
                type="button"
                onClick={() => onOpenTable(key.sourceSchema, key.sourceTable)}
              >
                <span>{key.sourceSchema}</span>
                <strong>{key.sourceTable}</strong>
                <code>{key.sourceColumns.join(", ")}</code>
              </button>
              <ArrowRight size={20} aria-label="references" />
              <button
                type="button"
                onClick={() => onOpenTable(key.targetSchema, key.targetTable)}
              >
                <span>{key.targetSchema}</span>
                <strong>{key.targetTable}</strong>
                <code>{key.targetColumns.join(", ")}</code>
              </button>
            </div>
            <dl className="structure-properties inline">
              <div>
                <dt>On update</dt>
                <dd>{key.onUpdate}</dd>
              </div>
              <div>
                <dt>On delete</dt>
                <dd>{key.onDelete}</dd>
              </div>
              {!key.validated && (
                <div>
                  <dt>Status</dt>
                  <dd>Not validated</dd>
                </div>
              )}
            </dl>
            <DefinitionDetails definition={key.definition} />
          </article>
        );
      })}
    </div>
  );
}
