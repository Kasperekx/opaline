import {
  act,
  render,
  renderHook,
  screen,
  fireEvent,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DiagramInspector } from "../src/features/diagram/DiagramInspector";
import {
  buildGraph,
  neighborhood,
  parseLayout,
  tableId,
} from "../src/features/diagram/diagram-model";
import { useWorkspaceTabs } from "../src/features/query/useWorkspaceTabs";
import { diagramFixture } from "./diagram-fixture";

it("shows relationship actions and lets keyboard users close the inspector", () => {
  const close = vi.fn();
  const open = vi.fn();
  const toggle = vi.fn();
  const view = render(
    <DiagramInspector
      relation={diagramFixture.foreignKeys[0]}
      onClose={close}
      onOpen={open}
      onToggleColumns={toggle}
    />,
  );
  expect(screen.getByText("CASCADE")).toBeTruthy();
  expect(screen.getByText("account_id")).toBeTruthy();
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Close diagram details" }),
    { key: "Escape" },
  );
  expect(close).toHaveBeenCalledOnce();
  view.rerender(
    <DiagramInspector
      table={buildGraph(diagramFixture, new Set(), false).nodes[0]}
      onClose={close}
      onOpen={open}
      onToggleColumns={toggle}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open table" }));
  expect(open).toHaveBeenCalledOnce();
});

it("keeps unconnected tables, cross-schema and composite relationships without inventing links", () => {
  const snapshot = structuredClone(diagramFixture);
  snapshot.foreignKeys[0].sourceColumns.push("name");
  snapshot.foreignKeys[0].targetColumns.push("display_name");
  const graph = buildGraph(snapshot, new Set(), false);
  expect(graph.nodes).toHaveLength(6);
  expect(graph.edges).toHaveLength(5);
  expect(graph.edges[0].data?.relation.sourceColumns).toEqual([
    "account_id",
    "name",
  ]);
  expect(neighborhood(tableId(snapshot.tables[0]), graph.edges).size).toBe(3);
  expect(tableId({ schema: "a.b", name: "c" })).not.toBe(
    tableId({ schema: "a", name: "b.c" }),
  );
});
it("groups partitions, retains self references, and reports unavailable targets", () => {
  const snapshot = structuredClone(diagramFixture);
  snapshot.tables.push({
    ...snapshot.tables[0],
    name: "partition_1",
    parent: { schema: "public", name: "accounts" },
  });
  snapshot.foreignKeys.push({
    ...snapshot.foreignKeys[0],
    name: "self",
    targetTable: "players",
  });
  snapshot.foreignKeys.push({
    ...snapshot.foreignKeys[0],
    name: "unavailable",
    targetTable: "secret",
  });
  const collapsed = buildGraph(snapshot, new Set(), false);
  expect(collapsed.nodes).toHaveLength(6);
  expect(collapsed.nodes[0].data.partitionCount).toBe(1);
  expect(collapsed.edges.some((edge) => edge.source === edge.target)).toBe(
    true,
  );
  expect(collapsed.unavailableRelations).toBe(1);
  expect(buildGraph(snapshot, new Set(), true).nodes).toHaveLength(7);
});
it("uses explicit overflow ports until long tables are expanded", () => {
  const snapshot = structuredClone(diagramFixture);
  const source = snapshot.tables[1];
  source.columns = Array.from({ length: 20 }, (_, i) => ({
    name: `c${i}`,
    dataType: "text",
    nullable: true,
    primaryKey: false,
  }));
  snapshot.foreignKeys[0].sourceColumns = ["c19"];
  expect(buildGraph(snapshot, new Set(), false).edges[0].sourceHandle).toBe(
    "overflow-out",
  );
  expect(
    buildGraph(snapshot, new Set([tableId(source)]), false).edges[0]
      .sourceHandle,
  ).not.toBe("overflow-out");
});
it("validates local positions and viewport", () => {
  expect(
    parseLayout({
      positions: { good: { x: 0, y: 12 }, bad: { x: "bad", y: 4 } },
      viewport: { x: 0, y: 0, zoom: -1 },
    }),
  ).toEqual({ positions: { good: { x: 0, y: 12 } }, viewport: undefined });
});
it("opens a single diagram tab and restores it without losing SQL drafts", () => {
  const hook = renderHook(() => useWorkspaceTabs("diagram-test"));
  act(() =>
    hook.result.current.updateSql(
      hook.result.current.activeTabId,
      "select 'draft'",
    ),
  );
  act(() => hook.result.current.openDiagram());
  act(() =>
    hook.result.current.openDiagram({ schema: "public", name: "players" }),
  );
  expect(hook.result.current.tabs).toHaveLength(2);
  expect(hook.result.current.activeTab?.kind).toBe("diagram");
  hook.unmount();
  const restored = renderHook(() => useWorkspaceTabs("diagram-test"));
  expect(restored.result.current.activeTab).toEqual({
    kind: "diagram",
    id: "database-diagram",
    title: "Diagram",
  });
  expect(restored.result.current.tabs[0]).toMatchObject({
    sql: "select 'draft'",
  });
});
