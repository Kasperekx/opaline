import { ArrowUpRight, X } from "lucide-react";
import type { StructureForeignKey } from "../../shared/types/structure";
import type { TableNode } from "./diagram-model";

export function DiagramInspector({
  table,
  relation,
  onClose,
  onOpen,
  onToggleColumns,
  onEdit,
  onDrop,
}: {
  table?: TableNode;
  relation?: StructureForeignKey;
  onClose: () => void;
  onOpen: () => void;
  onToggleColumns: () => void;
  onEdit?: () => void;
  onDrop?: () => void;
}) {
  return (
    <aside
      className="diagram-inspector"
      aria-label="Diagram details"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <span>{relation ? "Relationship" : "Table"}</span>
        <button
          className="icon-button"
          aria-label="Close diagram details"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      {relation ? (
        <>
          <h2>{relation.name}</h2>
          <p>Foreign key{relation.validated ? "" : " · not validated"}</p>
          <div className="diagram-relation-pair">
            <strong>
              {relation.sourceSchema}.{relation.sourceTable}
            </strong>
            <code>{relation.sourceColumns.join(", ")}</code>
            <span>references ↓</span>
            <strong>
              {relation.targetSchema}.{relation.targetTable}
            </strong>
            <code>{relation.targetColumns.join(", ")}</code>
          </div>
          <dl>
            <dt>On delete</dt>
            <dd>{relation.onDelete}</dd>
            <dt>On update</dt>
            <dd>{relation.onUpdate}</dd>
          </dl>
          <p>Column pairs follow the order shown above.</p>
          {onEdit && (
            <button className="button secondary" onClick={onEdit}>
              Edit relationship
            </button>
          )}
        </>
      ) : (
        table && (
          <>
            <h2>{table.data.table.name}</h2>
            <p>
              {table.data.table.schema} · {table.data.table.objectType}
            </p>
            <button className="button secondary" onClick={onOpen}>
              Open table <ArrowUpRight size={15} />
            </button>
            {onEdit && (
              <button className="button secondary" onClick={onEdit}>
                Edit structure
              </button>
            )}
            {onDrop && (
              <button className="button danger" onClick={onDrop}>
                Drop table…
              </button>
            )}
            {table.data.table.columns.length > 12 && (
              <button className="button ghost" onClick={onToggleColumns}>
                {table.data.expanded
                  ? "Collapse columns on canvas"
                  : "Show all columns on canvas"}
              </button>
            )}
            <h3>Columns</h3>
            <ul>
              {table.data.table.columns.map((column) => (
                <li key={column.name}>
                  <strong>{column.name}</strong>
                  <span>
                    {column.dataType}
                    {column.primaryKey ? " · PK" : ""}
                    {column.nullable ? " · nullable" : " · not null"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </aside>
  );
}
