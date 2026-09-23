import type { Edge, Node, Viewport, XYPosition } from "@xyflow/react";
import type { DatabaseDiagram, DiagramTable } from "../../shared/types/diagram";
import type { StructureForeignKey } from "../../shared/types/structure";

export const tableId = (table: { schema: string; name: string }) =>
  JSON.stringify([table.schema, table.name]);
export const sourceId = (fk: StructureForeignKey) =>
  tableId({ schema: fk.sourceSchema, name: fk.sourceTable });
export const targetId = (fk: StructureForeignKey) =>
  tableId({ schema: fk.targetSchema, name: fk.targetTable });
export const relationId = (fk: StructureForeignKey) =>
  JSON.stringify([fk.sourceSchema, fk.sourceTable, fk.name]);
export const columnHandle = (name: string, side: "in" | "out") =>
  JSON.stringify([name, side]);
export const NODE_WIDTH = 300;
export const HEADER_HEIGHT = 64;
export const ROW_HEIGHT = 28;
export const FOOTER_HEIGHT = 32;
export type TableNode = Node<
  {
    table: DiagramTable;
    foreignColumns: string[];
    displayedColumns: DiagramTable["columns"];
    expanded: boolean;
    partitionCount: number;
  },
  "table"
>;
export type RelationEdge = Edge<{
  relation: StructureForeignKey;
  path?: string;
}>;
export type DiagramLayout = {
  positions: Record<string, XYPosition>;
  viewport?: Viewport;
};

export function parseLayout(value: unknown): DiagramLayout {
  const empty = { positions: {} };
  if (!value || typeof value !== "object") return empty;
  const candidate = value as Partial<DiagramLayout>;
  const finite = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e8;
  const positions = Object.fromEntries(
    Object.entries(candidate.positions ?? {}).filter(
      ([, p]) => p && finite(p.x) && finite(p.y),
    ),
  );
  const v = candidate.viewport;
  return {
    positions,
    viewport:
      v &&
      finite(v.x) &&
      finite(v.y) &&
      finite(v.zoom) &&
      v.zoom >= 0.05 &&
      v.zoom <= 1.8
        ? v
        : undefined,
  };
}

export function buildGraph(
  snapshot: DatabaseDiagram,
  expanded: ReadonlySet<string>,
  showPartitions: boolean,
) {
  const tableIds = new Set(snapshot.tables.map(tableId));
  const foreignColumns = new Map<string, Set<string>>();
  const partitionCounts = new Map<string, number>();
  for (const table of snapshot.tables) {
    if (table.parent) {
      const id = tableId(table.parent);
      partitionCounts.set(id, (partitionCounts.get(id) ?? 0) + 1);
    }
  }
  for (const fk of snapshot.foreignKeys) {
    const id = sourceId(fk);
    const columns = foreignColumns.get(id) ?? new Set<string>();
    fk.sourceColumns.forEach((name) => columns.add(name));
    foreignColumns.set(id, columns);
  }
  const nodes: TableNode[] = snapshot.tables
    .filter(
      (table) =>
        showPartitions || !table.parent || !tableIds.has(tableId(table.parent)),
    )
    .map((table) => {
      const id = tableId(table);
      const foreign = [...(foreignColumns.get(id) ?? [])];
      const displayedColumns = expanded.has(id)
        ? table.columns
        : table.columns.slice(0, 12);
      return {
        id,
        ariaLabel: `${table.schema}.${table.name}`,
        type: "table",
        position: { x: 0, y: 0 },
        width: NODE_WIDTH,
        height:
          HEADER_HEIGHT + ROW_HEIGHT * displayedColumns.length + FOOTER_HEIGHT,
        data: {
          table,
          foreignColumns: foreign,
          displayedColumns,
          expanded: expanded.has(id),
          partitionCount: partitionCounts.get(id) ?? 0,
        },
      };
    });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: RelationEdge[] = [];
  let unavailableRelations = 0;
  for (const fk of snapshot.foreignKeys) {
    const source = byId.get(sourceId(fk));
    const target = byId.get(targetId(fk));
    if (!tableIds.has(sourceId(fk)) || !tableIds.has(targetId(fk)))
      unavailableRelations++;
    if (!source || !target) continue;
    const handle = (node: TableNode, column: string, side: "in" | "out") =>
      node.data.displayedColumns.some((c) => c.name === column)
        ? columnHandle(column, side)
        : `overflow-${side}`;
    edges.push({
      id: relationId(fk),
      type: "relation",
      source: source.id,
      target: target.id,
      sourceHandle: handle(source, fk.sourceColumns[0], "out"),
      targetHandle: handle(target, fk.targetColumns[0], "in"),
      data: { relation: fk },
      ariaLabel: `${fk.name}: ${fk.sourceSchema}.${fk.sourceTable} to ${fk.targetSchema}.${fk.targetTable}`,
      style: { strokeDasharray: fk.validated ? undefined : "5 4" },
    });
  }
  return { nodes, edges, unavailableRelations };
}

export function neighborhood(id: string, edges: RelationEdge[]) {
  const ids = new Set([id]);
  for (const edge of edges) {
    if (edge.source === id || edge.target === id) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
  }
  return ids;
}
