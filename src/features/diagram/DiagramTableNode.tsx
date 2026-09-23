import { memo } from "react";
import {
  Handle,
  Position,
  BaseEdge,
  getSmoothStepPath,
  useStore,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import { KeyRound, Link2, Table2 } from "lucide-react";
import {
  columnHandle,
  type TableNode,
  type RelationEdge,
} from "./diagram-model";

export const DiagramTableNode = memo(function DiagramTableNode({
  data,
  selected,
}: NodeProps<TableNode>) {
  const overview = useStore((state) => state.transform[2] < 0.45);
  return (
    <article
      className={`diagram-table ${selected ? "is-selected" : ""} ${overview ? "is-overview" : ""}`}
    >
      <header>
        <span>
          <Table2 size={15} />
          {data.table.schema}
        </span>
        <strong title={data.table.name}>{data.table.name}</strong>
      </header>
      <div className="diagram-columns">
        {data.displayedColumns.map((column) => (
          <div
            className="diagram-column"
            key={column.name}
            title={`${column.name} · ${column.dataType}${column.nullable ? " · nullable" : " · not null"}`}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={columnHandle(column.name, "in")}
              isConnectable={false}
            />
            <span className="diagram-column-key">
              {column.primaryKey ? (
                <KeyRound size={12} aria-label="Primary key" />
              ) : data.foreignColumns.includes(column.name) ? (
                <Link2 size={12} aria-label="Foreign key" />
              ) : (
                <span>·</span>
              )}
            </span>
            <span className="diagram-column-name">{column.name}</span>
            <small>{column.dataType}</small>
            <Handle
              type="source"
              position={Position.Right}
              id={columnHandle(column.name, "out")}
              isConnectable={false}
            />
          </div>
        ))}
      </div>
      <footer>
        <Handle
          type="target"
          position={Position.Left}
          id="overflow-in"
          isConnectable={false}
        />
        <span>
          {data.table.columns.length} columns
          {data.partitionCount ? ` · ${data.partitionCount} partitions` : ""}
        </span>
        {data.table.columns.length > data.displayedColumns.length && (
          <span>
            +{data.table.columns.length - data.displayedColumns.length} hidden
          </span>
        )}
        <Handle
          type="source"
          position={Position.Right}
          id="overflow-out"
          isConnectable={false}
        />
      </footer>
    </article>
  );
});

export const DiagramRelationEdge = memo(function DiagramRelationEdge(
  props: EdgeProps<RelationEdge>,
) {
  const [normalPath] = getSmoothStepPath({
    ...props,
    borderRadius: 12,
    offset: 30,
  });
  // Self references loop above the table instead of cutting through its columns.
  const path =
    props.data?.path ||
    (props.source === props.target
      ? `M ${props.sourceX},${props.sourceY} C ${props.sourceX + 90},${props.sourceY} ${props.sourceX + 90},${props.sourceY - 110} ${props.sourceX},${props.sourceY - 110} L ${props.targetX - 50},${props.sourceY - 110} Q ${props.targetX - 75},${props.sourceY - 110} ${props.targetX - 75},${props.targetY} L ${props.targetX},${props.targetY}`
      : normalPath);
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={props.style}
      interactionWidth={20}
    />
  );
});
