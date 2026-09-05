import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useWorkspaceTabs } from "../src/features/query/useWorkspaceTabs";
import { useQueryHistory } from "../src/features/query/useQueryHistory";

it("keeps SQL scoped per profile and flushes the final edit on immediate disconnect", () => {
  const a = renderHook(() => useWorkspaceTabs("local"));
  act(() =>
    a.result.current.updateSql(
      a.result.current.activeTabId,
      "select 'local only'",
    ),
  );
  a.unmount();
  const b = renderHook(() => useWorkspaceTabs("production"));
  expect(
    b.result.current.activeTab.kind === "query" &&
      b.result.current.activeTab.sql,
  ).not.toContain("local only");
  b.unmount();
  const restored = renderHook(() => useWorkspaceTabs("local"));
  expect(
    restored.result.current.activeTab.kind === "query" &&
      restored.result.current.activeTab.sql,
  ).toBe("select 'local only'");
});

it("never mixes profile query history", () => {
  const a = renderHook(() => useQueryHistory("local"));
  act(() =>
    a.result.current.addEntry({
      id: "1",
      title: "Query",
      sql: "SELECT 1",
      database: "postgres",
      executedAt: new Date().toISOString(),
      durationMs: 1,
      rowCount: 1,
      status: "success",
    }),
  );
  const b = renderHook(() => useQueryHistory("prod"));
  expect(b.result.current.entries).toHaveLength(0);
  expect(a.result.current.entries).toHaveLength(1);
});
