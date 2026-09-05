import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { sqlDocumentApi } from "../src/features/query/sql-document-api";
import { useSqlDocuments } from "../src/features/query/useSqlDocuments";
import { useWorkspaceTabs } from "../src/features/query/useWorkspaceTabs";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";

function renderDocuments() {
  const editor = {
    current: { getSubmission: () => undefined, replaceDocument: vi.fn() },
  };
  const hook = renderHook(
    () => {
      const tabs = useWorkspaceTabs("format-regression");
      const documents = useSqlDocuments(tabs, "session", editor);
      return { tabs, documents };
    },
    { wrapper: WorkSafetyProvider },
  );
  act(() => {
    hook.result.current.tabs.updateSql(
      hook.result.current.tabs.activeTabId,
      "select 1;",
    );
  });
  return { hook, editor };
}

it("formats in the editor without a success notice or saving a file", async () => {
  const format = vi
    .spyOn(sqlDocumentApi, "format")
    .mockResolvedValue("select\n  1;");
  const save = vi.spyOn(sqlDocumentApi, "save");
  const { hook, editor } = renderDocuments();

  await act(async () => {
    await hook.result.current.documents.format();
  });

  expect(format).toHaveBeenCalledExactlyOnceWith("select 1;");
  expect(editor.current.replaceDocument).toHaveBeenCalledExactlyOnceWith(
    "select\n  1;",
  );
  expect(hook.result.current.documents.message).toBeNull();
  expect(hook.result.current.documents.busy).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

it("keeps the original document on failure and clears the error after a successful retry", async () => {
  const format = vi
    .spyOn(sqlDocumentApi, "format")
    .mockRejectedValueOnce(new Error("Unable to safely format SQL."));
  const { hook, editor } = renderDocuments();

  await act(async () => {
    await hook.result.current.documents.format();
  });
  expect(editor.current.replaceDocument).not.toHaveBeenCalled();
  expect(hook.result.current.documents.message).toBe(
    "Unable to safely format SQL.",
  );
  expect(hook.result.current.documents.busy).toBe(false);

  format.mockResolvedValue("select\n  1;");
  await act(async () => {
    await hook.result.current.documents.format();
  });
  expect(editor.current.replaceDocument).toHaveBeenCalledOnce();
  expect(hook.result.current.documents.message).toBeNull();
});

it("does not replace edits made in the same tab while formatting is pending", async () => {
  let finish!: (sql: string) => void;
  vi.spyOn(sqlDocumentApi, "format").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { hook, editor } = renderDocuments();
  let pending: Promise<unknown> | undefined;
  act(() => {
    pending = hook.result.current.documents.format();
  });
  act(() => {
    hook.result.current.tabs.updateSql(
      hook.result.current.tabs.activeTabId,
      "select 2;",
    );
  });
  await act(async () => {
    finish("select\n  1;");
    await pending;
  });
  expect(editor.current.replaceDocument).not.toHaveBeenCalled();
  expect(hook.result.current.tabs.activeTab).toMatchObject({
    sql: "select 2;",
  });
  expect(hook.result.current.documents.message).toContain("Editor changed");
});
