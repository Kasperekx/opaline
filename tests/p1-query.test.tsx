import {
  act,
  renderHook,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { useWorkspaceTabs } from "../src/features/query/useWorkspaceTabs";
import {
  useSavedQueries,
  writeSavedQueries,
} from "../src/features/query/useSavedQueries";
import { completionSchema } from "../src/features/query/useSqlCompletions";
import {
  gridTsv,
  selectedValues,
} from "../src/shared/components/GridInteractions";
import { ResultsGrid } from "../src/features/query/ResultsGrid";
import { CommandPalette } from "../src/features/query/CommandPalette";
import {
  readTableView,
  tableViewKey,
} from "../src/features/table/table-view-state";
import { writeLocalJson } from "../src/shared/lib/local-storage";
import { useSqlDocuments } from "../src/features/query/useSqlDocuments";
import {
  sqlDocumentApi,
  type SqlDocument,
} from "../src/features/query/sql-document-api";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";
import { StrictMode } from "react";
import { FileWorkRisk } from "../src/features/query/useSqlDocuments";
import { useGridInteractions } from "../src/shared/components/GridInteractions";

it("grid keyboard navigation ignores an inserted draft row", async () => {
  function Grid() {
    const grid = useGridInteractions([["Ada"], ["Grace"]], "fixture");
    return (
      <table>
        <tbody>
          <tr>
            <td>New unsaved row</td>
          </tr>
          <tr>
            <td {...grid.cell(0, 0)}>Ada</td>
          </tr>
          <tr>
            <td {...grid.cell(1, 0)}>Grace</td>
          </tr>
        </tbody>
      </table>
    );
  }
  const user = userEvent.setup();
  render(<Grid />);
  await user.click(screen.getByRole("gridcell", { name: "Ada" }));
  await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
  expect(
    screen.getByRole("gridcell", { name: "Ada" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(
    screen
      .getByRole("gridcell", { name: "Grace" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(document.activeElement).toBe(
    screen.getByRole("gridcell", { name: "Grace" }),
  );
});

it("keeps native file access during StrictMode replay and releases it only when closed", async () => {
  const release = vi
    .spyOn(sqlDocumentApi, "release")
    .mockResolvedValue(undefined);
  const tab = {
    kind: "query" as const,
    id: "file-tab",
    title: "file.sql",
    sql: "select 1",
    lastExecutedSql: null,
    result: null,
    error: null,
    file: { id: "strict-file", path: "/file.sql", savedSql: "select 1" },
  };
  const view = render(
    <StrictMode>
      <WorkSafetyProvider>
        <FileWorkRisk tab={tab} sessionId="s" />
      </WorkSafetyProvider>
    </StrictMode>,
  );
  await act(async () => {});
  expect(release).not.toHaveBeenCalled();
  view.unmount();
  await waitFor(() =>
    expect(release).toHaveBeenCalledExactlyOnceWith("strict-file"),
  );
});

it("restores table tabs and active context without persisting file capabilities or results", () => {
  const hook = renderHook(() => useWorkspaceTabs("p1-table"));
  act(() => {
    hook.result.current.updateQueryTab(
      hook.result.current.activeTabId,
      (tab) => ({
        ...tab,
        sql: "select 42",
        file: {
          id: "native-capability",
          path: "/private/query.sql",
          savedSql: "select 1",
        },
      }),
    );
    hook.result.current.openTable({
      schema: "odd.schema",
      name: "odd.table",
      objectType: "table",
      estimatedRows: 1,
    });
  });
  hook.unmount();
  const restored = renderHook(() => useWorkspaceTabs("p1-table"));
  expect(restored.result.current.activeTab).toMatchObject({
    kind: "table",
    schema: "odd.schema",
    table: "odd.table",
  });
  expect(
    localStorage.getItem("opaline.query-session.v2.p1-table"),
  ).not.toContain("native-capability");
  expect(restored.result.current.tabs[0]).toMatchObject({
    kind: "query",
    sql: "select 42",
    result: null,
  });
});
it("persists table navigation per profile and uses collision-free relation keys", () => {
  const key = tableViewKey("p1", "a.b", "c");
  expect(key).not.toBe(tableViewKey("p1", "a", "b.c"));
  writeLocalJson(key, {
    page: 3,
    pageSize: 25,
    filter: "żółć",
    sort: { column: "id", direction: "desc" },
  });
  expect(readTableView(key)).toMatchObject({ page: 3, filter: "żółć" });
  expect(readTableView(tableViewKey("other", "a.b", "c")).filter).toBe("");
});
it("shares a query library within one workspace but not across products", () => {
  const first = renderHook(() => useSavedQueries("mmo"));
  const second = renderHook(() => useSavedQueries("mmo"));
  const other = renderHook(() => useSavedQueries("analytics"));
  act(() => first.result.current.save("Players", "select 'private'"));
  expect(second.result.current.entries).toHaveLength(1);
  expect(other.result.current.entries).toHaveLength(0);
  act(() => second.result.current.remove(second.result.current.entries[0].id));
  expect(first.result.current.entries).toHaveLength(0);
  expect(() =>
    writeSavedQueries(
      "mmo",
      Array.from({ length: 201 }, (_, i) => ({
        id: String(i),
        title: "x",
        sql: "select 1",
        updatedAt: "now",
      })),
    ),
  ).toThrow("200 queries");
});
it("completion namespaces handle quoted/prototype-like names without mixing schemas", () => {
  const schema = completionSchema(
    [
      {
        schema: "__proto__",
        name: "constructor",
        objectType: "table",
        estimatedRows: 0,
      },
    ],
    [{ schema: "__proto__", table: "constructor", column: "odd column" }],
  );
  expect(schema.__proto__.constructor).toEqual(["odd column"]);
  expect(completionSchema([], [])).toEqual({});
});
it("copies rectangular ranges without numeric conversion and distinguishes NULL from empty text", () => {
  const rows = [
    ["900719925474099312345", null, ""],
    ["line\ntext", "\\N", "tab\ttext"],
  ];
  expect(gridTsv(rows)).toBe(
    "900719925474099312345\t\\N\t\nline\\ntext\t\\\\N\ttab\\ttext",
  );
  expect(
    selectedValues(rows, {
      anchor: { row: 1, column: 2 },
      focus: { row: 0, column: 1 },
    }),
  ).toEqual([
    [null, ""],
    ["\\N", "tab\ttext"],
  ]);
});
it("inspects full values and resets selection when a new result arrives", async () => {
  const user = userEvent.setup();
  const resultSet = {
    columns: ["value"],
    rows: [["large value"]],
    affectedRows: 0,
    truncated: false,
  };
  const view = render(
    <ResultsGrid resultSet={resultSet} busy={false} error={null} />,
  );
  await user.dblClick(screen.getByRole("gridcell", { name: "large value" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Full cell value",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("large value");
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  view.rerender(
    <ResultsGrid
      resultSet={{ ...resultSet, rows: [["new value"]] }}
      busy={false}
      error={null}
    />,
  );
  expect(
    (screen.getByRole("button", { name: "Copy cells" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("filters commands and runs only the explicit keyboard choice", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(
    <CommandPalette
      onClose={vi.fn()}
      commands={[
        { label: "Open SQL file", run: action },
        { label: "Format SQL", run: vi.fn() },
      ]}
    />,
  );
  await user.type(
    screen.getByRole("combobox", { name: "Find command" }),
    "open",
  );
  expect(action).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(action).toHaveBeenCalledOnce();
});
it("a late save keeps edits made while saving and formatting never overwrites another tab", async () => {
  let resolveSave!: (document: SqlDocument) => void;
  vi.spyOn(sqlDocumentApi, "save").mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
  );
  const editor = {
    current: { getSubmission: () => undefined, replaceDocument: vi.fn() },
  };
  const hook = renderHook(
    () => {
      const tabs = useWorkspaceTabs("p1-file");
      const documents = useSqlDocuments(tabs, "s", editor);
      return { tabs, documents };
    },
    { wrapper: WorkSafetyProvider },
  );
  act(() =>
    hook.result.current.tabs.updateSql(
      hook.result.current.tabs.activeTabId,
      "select 1",
    ),
  );
  let pending: Promise<unknown> | undefined;
  act(() => {
    pending = hook.result.current.documents.save();
  });
  await waitFor(() => expect(resolveSave).toBeTypeOf("function"));
  act(() =>
    hook.result.current.tabs.updateSql(
      hook.result.current.tabs.activeTabId,
      "select 2",
    ),
  );
  await act(async () => {
    resolveSave({ id: "f", path: "/query.sql", content: "select 1" });
    await pending;
  });
  expect(hook.result.current.tabs.activeTab).toMatchObject({
    sql: "select 2",
    file: { savedSql: "select 1" },
  });
  let finish!: (sql: string) => void;
  vi.spyOn(sqlDocumentApi, "format").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  act(() => {
    pending = hook.result.current.documents.format();
  });
  act(() => hook.result.current.tabs.addQueryTab("select 'other'"));
  await act(async () => {
    finish("SELECT 2");
    await pending;
  });
  expect(editor.current.replaceDocument).not.toHaveBeenCalled();
  expect(hook.result.current.documents.message).toContain("Editor changed");
});
