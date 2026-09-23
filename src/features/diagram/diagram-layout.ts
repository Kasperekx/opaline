import ELK, { type ElkNode, type ELK as ElkEngine } from "elkjs/lib/elk-api";
import workerUrl from "elkjs/lib/elk-worker.min.js?url";
import type { TableNode, RelationEdge, DiagramLayout } from "./diagram-model";
import { columnHandle, HEADER_HEIGHT, ROW_HEIGHT } from "./diagram-model";

export function arrangeGraph(
  nodes: TableNode[],
  edges: RelationEdge[],
  saved: DiagramLayout["positions"],
) {
  let elk: ElkEngine | undefined;
  let cancelled = false;
  const promise = Promise.resolve()
    .then(() => {
      if (cancelled) throw new Error("Layout cancelled");
      elk = new ELK({ workerUrl });
      return elk.layout<ElkNode>({
        id: "database",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.spacing.nodeNode": "64",
          "elk.layered.spacing.nodeNodeBetweenLayers": "140",
          "elk.separateConnectedComponents": "true",
        },
        children: nodes.map((node) => ({
          id: node.id,
          width: node.width,
          height: node.height,
          layoutOptions: { "elk.portConstraints": "FIXED_POS" },
          ports: [
            ...node.data.displayedColumns.flatMap((column, index) =>
              (["in", "out"] as const).map((side) => ({
                id: JSON.stringify([node.id, columnHandle(column.name, side)]),
                x: side === "in" ? 0 : node.width,
                y: HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2,
                width: 0,
                height: 0,
                layoutOptions: {
                  "elk.port.side": side === "in" ? "WEST" : "EAST",
                },
              })),
            ),
            ...["in", "out"].map((side) => ({
              id: JSON.stringify([node.id, `overflow-${side}`]),
              x: side === "in" ? 0 : node.width,
              y: (node.height ?? 0) - 16,
              width: 0,
              height: 0,
              layoutOptions: {
                "elk.port.side": side === "in" ? "WEST" : "EAST",
              },
            })),
          ],
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [JSON.stringify([edge.source, edge.sourceHandle])],
          targets: [JSON.stringify([edge.target, edge.targetHandle])],
        })),
      });
    })
    .then((graph) => {
      const positions = new Map(
        graph.children?.map((node) => [
          node.id,
          { x: node.x ?? 0, y: node.y ?? 0 },
        ]),
      );
      const existing = nodes.filter((node) => saved[node.id]);
      const offset = existing.length
        ? Math.max(
            ...existing.map((node) => saved[node.id].x + (node.width ?? 300)),
          ) + 140
        : 0;
      const placed = nodes.map((node) => {
        const computed = positions.get(node.id) ?? { x: 0, y: 0 };
        return {
          ...node,
          position: saved[node.id] ?? { x: computed.x + offset, y: computed.y },
        };
      });
      const matchesLayout = placed.every((node) => {
        const computed = positions.get(node.id);
        return (
          computed &&
          Math.abs(computed.x - node.position.x) < 1 &&
          Math.abs(computed.y - node.position.y) < 1
        );
      });
      const paths = matchesLayout
        ? Object.fromEntries(
            (graph.edges ?? []).map((edge) => [
              edge.id,
              edge.sections
                ?.map((section) =>
                  [
                    section.startPoint,
                    ...(section.bendPoints ?? []),
                    section.endPoint,
                  ]
                    .map((point, i) => `${i ? "L" : "M"}${point.x},${point.y}`)
                    .join(" "),
                )
                .join(" ") ?? "",
            ]),
          )
        : {};
      return { nodes: placed, paths };
    });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      elk?.terminateWorker();
    },
  };
}
