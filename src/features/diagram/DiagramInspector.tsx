import { ArrowDown, ArrowUpRight, X } from "lucide-react";
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
          className="icon-button subtle"
          aria-label="Close diagram details"
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </header>
      {relation ? (
        <>
          <div className="diagram-inspector-title">
            <h2>{relation.name}</h2>
            <p className={relation.validated ? undefined : "is-warning"}>
              Foreign key{relation.validated ? "" : " · not validated"}
            </p>
          </div>
          <div className="diagram-relation-pair">
            <strong>
              <span>{relation.sourceSchema}.</span>
              {relation.sourceTable}
            </strong>
            <code>{relation.sourceColumns.join(", ")}</code>
            <span className="diagram-relation-arrow">
              <ArrowDown size={12} aria-hidden="true" />
              references
            </span>
            <strong>
              <span>{relation.targetSchema}.</span>
              {relation.targetTable}
            </strong>
            <code>{relation.targetColumns.join(", ")}</code>
          </div>
          <dl>
            <div>
              <dt>On delete</dt>
              <dd>{relation.onDelete}</dd>
            </div>
            <div>
              <dt>On update</dt>
              <dd>{relation.onUpdate}</dd>
            </div>
          </dl>
          <p>Column pairs follow the order shown above.</p>
          {onEdit && (
            <button
              className="button secondary diagram-inspector-end"
              onClick={onEdit}
            >
              Edit relationship
            </button>
          )}
        </>
      ) : (
        table && (
          <>
            <div className="diagram-inspector-title">
              <h2>{table.data.table.name}</h2>
              <p>
                {table.data.table.schema} · {table.data.table.objectType}
              </p>
            </div>
            <div className="diagram-inspector-actions">
              <button className="button secondary" onClick={onOpen}>
                Open table <ArrowUpRight size={13} />
              </button>
              {(onEdit || onDrop) && (
                <div>
                  {onEdit && (
                    <button className="button secondary" onClick={onEdit}>
                      Edit structure
                    </button>
                  )}
                  {onDrop && (
                    <button
                      className="button secondary diagram-drop"
                      onClick={onDrop}
                    >
                      Drop table…
                    </button>
                  )}
                </div>
              )}
              {table.data.table.columns.length > 12 && (
                <button className="button ghost" onClick={onToggleColumns}>
                  {table.data.expanded
                    ? "Collapse columns on canvas"
                    : "Show all columns on canvas"}
                </button>
              )}
            </div>
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
