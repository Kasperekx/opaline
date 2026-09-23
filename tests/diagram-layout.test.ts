import { expect, it, vi } from "vitest";
import { diagramFixture } from "./diagram-fixture";
import { buildGraph } from "../src/features/diagram/diagram-model";
import { arrangeGraph } from "../src/features/diagram/diagram-layout";

// Exercise the real layout engine in-process. Browser QA covers the worker.
vi.mock("elkjs/lib/elk-api", async () => {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  return {
    default: class extends ELK {
      constructor() {
        super();
      }
      terminateWorker() {
        /* In-process test engine has no worker to terminate. */
      }
    },
  };
});

it("routes real graph ports, preserves saved positions, and places new tables outside them", async () => {
  const graph = buildGraph(diagramFixture, new Set(), false);
  const first = arrangeGraph(graph.nodes, graph.edges, {});
  const result = await first.promise;
  first.cancel();
  expect(result.nodes).toHaveLength(6);
  expect(Object.keys(result.paths)).toHaveLength(5);
  expect(
    Object.values(result.paths).every(
      (path) => path.startsWith("M") && !path.includes("NaN"),
    ),
  ).toBe(true);
  const saved = { [result.nodes[0].id]: { x: 123, y: 456 } };
  const second = arrangeGraph(graph.nodes, graph.edges, saved);
  const refreshed = await second.promise;
  second.cancel();
  expect(refreshed.nodes[0].position).toEqual(saved[result.nodes[0].id]);
  expect(refreshed.nodes.slice(1).every((node) => node.position.x >= 563)).toBe(
    true,
  );
});

it("lays out 500 tables without missing nodes or invalid coordinates", async () => {
  const snapshot = {
    omittedTables: 0,
    tables: Array.from({ length: 500 }, (_, i) => ({
      ...diagramFixture.tables[0],
      name: `table_${i}`,
    })),
    foreignKeys: Array.from({ length: 300 }, (_, i) => ({
      ...diagramFixture.foreignKeys[0],
      sourceTable: `table_${i}`,
      targetTable: `table_${i + 1}`,
      sourceColumns: ["id"],
    })),
  };
  const graph = buildGraph(snapshot, new Set(), false);
  const task = arrangeGraph(graph.nodes, graph.edges, {});
  const result = await task.promise;
  task.cancel();
  expect(result.nodes).toHaveLength(500);
  expect(Object.keys(result.paths)).toHaveLength(300);
  expect(
    result.nodes.every(
      (node) =>
        Number.isFinite(node.position.x) && Number.isFinite(node.position.y),
    ),
  ).toBe(true);
}, 30000);
