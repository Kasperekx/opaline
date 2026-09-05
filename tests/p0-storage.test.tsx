import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceTabs } from "../src/features/query/useWorkspaceTabs";
import { useQueryHistory } from "../src/features/query/useQueryHistory";
import {
  hasStorageFailures,
  recoverLocalStorage,
  retryLocalWrites,
} from "../src/shared/lib/local-storage";

afterEach(() => {
  vi.restoreAllMocks();
  recoverLocalStorage();
  retryLocalWrites();
});

it("archives a closed query and restores it without execution or old results", () => {
  const hook = renderHook(() => useWorkspaceTabs("archive"));
  act(() =>
    hook.result.current.addQueryTab("select 'recover me'", "Important"),
  );
  act(() => hook.result.current.closeTab(hook.result.current.activeTabId));
  hook.unmount();
  const restored = renderHook(() => useWorkspaceTabs("archive"));
  expect(restored.result.current.canRestore).toBe(true);
  act(() => restored.result.current.restoreClosedTab());
  expect(restored.result.current.activeTab).toMatchObject({
    title: "Important",
    sql: "select 'recover me'",
    result: null,
  });
});
it("keeps the tab and latest SQL when storage is full, then retries", () => {
  const hook = renderHook(() => useWorkspaceTabs("quota"));
  act(() => hook.result.current.addQueryTab("select 2"));
  const fail = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Quota", "QuotaExceededError");
  });
  act(() =>
    hook.result.current.updateSql(
      hook.result.current.activeTabId,
      "select 'latest'",
    ),
  );
  act(() => hook.result.current.closeTab(hook.result.current.activeTabId));
  expect(hook.result.current.tabs).toHaveLength(2);
  expect(hasStorageFailures()).toBe(true);
  fail.mockRestore();
  retryLocalWrites();
  expect(hasStorageFailures()).toBe(false);
  expect(localStorage.getItem("opaline.query-session.v2.quota")).toContain(
    "latest",
  );
});
it.each(["{broken", '{"version":999,"tabs":[]}'])(
  "does not overwrite unreadable or future-version data: %s",
  (raw) => {
    const key = "opaline.query-session.v2.corrupt";
    localStorage.setItem(key, raw);
    const hook = renderHook(() => useWorkspaceTabs("corrupt"));
    expect(localStorage.getItem(key)).toBe(raw);
    expect(hasStorageFailures()).toBe(true);
    act(() => {
      expect(recoverLocalStorage()).toBe(true);
    });
    const backup = Object.keys(localStorage).find((key) =>
      key.includes(".recovery."),
    );
    expect(backup).toBeTruthy();
    expect(localStorage.getItem(backup!)).toBe(raw);
    hook.unmount();
  },
);
it("can stop recording new query history", () => {
  const hook = renderHook(() => useQueryHistory("private", false));
  act(() =>
    hook.result.current.addEntry({
      id: "x",
      title: "private",
      sql: "select 'sensitive'",
      database: "test",
      executedAt: new Date().toISOString(),
      durationMs: 1,
      rowCount: 1,
      status: "success",
    }),
  );
  expect(hook.result.current.entries).toEqual([]);
  expect(localStorage.getItem("opaline.query-history.v2.private")).toBeNull();
});
