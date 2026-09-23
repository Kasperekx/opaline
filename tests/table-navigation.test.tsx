import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { relatedFilters } from "../src/features/table/table-relations";
import {
  readTableView,
  tableViewKey,
  validFilters,
} from "../src/features/table/table-view-state";
import { useWorkspaceTabs } from "../src/features/query/useWorkspaceTabs";
import { tableChangePage } from "./table-change-fixture";
import type { StructureForeignKey } from "../src/shared/types/structure";

const relation: StructureForeignKey = {
  name: "composite",
  direction: "outgoing",
  sourceSchema: "public",
  sourceTable: "users",
  sourceColumns: ["id", "counter"],
  targetSchema: "other",
  targetTable: "account",
  targetColumns: ["tenant", "id"],
  onUpdate: "NO ACTION",
  onDelete: "NO ACTION",
  definition: "",
  validated: true,
};
it("follows all components without numeric conversion and rejects NULL or missing keys", () => {
  const filters = relatedFilters(
    relation,
    tableChangePage.columns,
    tableChangePage.rows[0].values,
  );
  expect(filters).toEqual([
    { column: "tenant", operator: "eq", value: "1" },
    { column: "id", operator: "eq", value: "9007199254740993" },
  ]);
  expect(
    relatedFilters(
      relation,
      tableChangePage.columns,
      tableChangePage.rows[1].values,
    ),
  ).toBeNull();
  expect(
    relatedFilters(
      { ...relation, sourceColumns: ["gone", "counter"] },
      tableChangePage.columns,
      tableChangePage.rows[0].values,
    ),
  ).toBeNull();
});
it("opens related results in an independent retained tab", () => {
  const hook = renderHook(() => useWorkspaceTabs("related-test"));
  act(() =>
    hook.result.current.updateSql(
      hook.result.current.activeTabId,
      "select 'unsaved'",
    ),
  );
  const original = hook.result.current.activeTabId;
  const filters = [
    { column: "id", operator: "eq" as const, value: "9007199254740993" },
  ];
  act(() => hook.result.current.openRelatedTable("other", "account", filters));
  const related = hook.result.current.activeTabId;
  expect(related).not.toBe(original);
  expect(hook.result.current.tabs[0]).toMatchObject({
    sql: "select 'unsaved'",
  });
  hook.unmount();
  const restored = renderHook(() => useWorkspaceTabs("related-test"));
  expect(restored.result.current.activeTab).toMatchObject({
    id: related,
    schema: "other",
    initialFilters: filters,
  });
});
it("migrates existing view preferences and isolates profile keys", () => {
  const key = tableViewKey("first", "public", "users");
  localStorage.setItem(
    key,
    JSON.stringify({ page: 1, pageSize: 25, filter: "Ada", sort: null }),
  );
  expect(readTableView(key)).toMatchObject({
    page: 1,
    widths: {},
    conditions: [],
    density: "default",
  });
  expect(
    readTableView(tableViewKey("second", "public", "users")),
  ).toMatchObject({ page: 0, filter: "" });
  expect(
    validFilters([{ column: "id", operator: "raw_sql", value: "1" }]),
  ).toBe(false);
});
