import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";
import { SessionProvider } from "../src/features/connections/SessionContext";
import { newProfile } from "../src/features/connections/connection-types";
import { TableDataView } from "../src/features/table/TableDataView";
import type {
  TableChangesRequest,
  TableRowSnapshot,
} from "../src/shared/types/database";
import { applyFixtureChanges, tableChangePage } from "./table-change-fixture";

function mount(readOnly = false, identity = false) {
  const page = structuredClone(tableChangePage);
  if (identity) {
    page.columns[0].identity = true;
    page.columns[0].defaultValue = "nextval('users_id_seq')";
  }
  page.editable = !readOnly;
  page.insertable = !readOnly;
  const save = vi.fn(async (input: TableChangesRequest) =>
    applyFixtureChanges(page, input),
  );
  const load = vi.fn(async (pageNumber: number) => ({
    ...structuredClone(page),
    page: pageNumber,
  }));
  const compare = vi.fn(async (): Promise<TableRowSnapshot> => ({
    columns: page.columns.map((column) => column.name),
    row: {
      ...page.rows[0],
      values: ["1", "Concurrent name", ...page.rows[0].values.slice(2)],
    },
  }));
  mockIPC((command, args) => {
    if (command === "load_table_page")
      return load((args as { input: { page: number } }).input.page);
    if (command === "load_table_row") return compare();
    if (command === "apply_table_changes")
      return save((args as { input: TableChangesRequest }).input);
  });
  const onDirtyChange = vi.fn();
  const props = {
    tab: {
      id: "table",
      kind: "table" as const,
      title: "users",
      schema: "public",
      table: "users",
      objectType: "table",
    },
    active: true,
    onDirtyChange,
    onOpenQuery: vi.fn(),
  };
  const session = {
    ...newProfile("mmo"),
    id: "session",
    profileId: "profile",
    serverVersion: "test",
    readOnly,
  };
  const view = render(
    <WorkSafetyProvider>
      <SessionProvider session={session}>
        <TableDataView {...props} />
      </SessionProvider>
    </WorkSafetyProvider>,
  );
  return { save, load, compare, page, onDirtyChange, view, props, session };
}
async function editName(value = "Ada edited") {
  const user = userEvent.setup();
  await user.dblClick(await screen.findByRole("gridcell", { name: "Ada" }));
  const field = screen.getByRole("textbox", { name: "Value for name" });
  await user.clear(field);
  await user.type(field, value);
  return user;
}

it("double-click edits one cell, Enter stages it, and the row action column is gone", async () => {
  const { save, onDirtyChange } = mount();
  const user = await editName();
  expect(screen.getAllByRole("textbox", { name: /Value for/ })).toHaveLength(1);
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("textbox", { name: "Value for name" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit row" })).toBeNull();
  expect(
    screen.queryByRole("columnheader", { name: "Row actions" }),
  ).toBeNull();
  expect(screen.getByLabelText("Unsaved change")).toBeTruthy();
  expect(onDirtyChange).toHaveBeenLastCalledWith("table", true);
  expect(save).not.toHaveBeenCalled();
});
it("Escape restores the edit checkpoint without removing other staged changes", async () => {
  const { save } = mount();
  const user = await editName("First edit");
  await user.keyboard("{Enter}");
  await user.dblClick(screen.getByRole("gridcell", { name: /First edit/ }));
  await user.clear(screen.getByRole("textbox", { name: "Value for name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Value for name" }),
    "Cancelled",
  );
  await user.keyboard("{Escape}");
  expect(screen.getByRole("gridcell", { name: /First edit/ })).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});
it("Ctrl+S finalizes the current field and saves only once", async () => {
  const { save, onDirtyChange } = mount();
  const user = await editName();
  await user.keyboard("{Control>}s{/Control}");
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].changes[0]).toMatchObject({
    kind: "update",
    changes: [{ column: "name", value: "Ada edited" }],
  });
  await waitFor(() =>
    expect(onDirtyChange).toHaveBeenLastCalledWith("table", false),
  );
  expect(screen.getByText("Changes saved")).toBeTruthy();
});
it("F2 and Tab edit adjacent cells without a write", async () => {
  const { save } = mount();
  const user = userEvent.setup();
  const cell = await screen.findByRole("gridcell", {
    name: "Ada",
  });
  cell.focus();
  await user.keyboard("{F2}");
  await user.clear(screen.getByRole("textbox", { name: "Value for name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Value for name" }),
    "Tabbed",
  );
  await user.tab();
  expect(screen.getByRole("textbox", { name: "Value for note" })).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});
it("invalid input remains a draft and blocks a save", async () => {
  const { save } = mount();
  const user = userEvent.setup();
  await user.dblClick(await screen.findByRole("gridcell", { name: "1" }));
  const field = screen.getByRole("textbox", { name: "Value for id" });
  await user.clear(field);
  await user.type(field, "not-an-integer");
  await user.keyboard("{Enter}");
  expect(screen.getByRole("textbox", { name: "Value for id" })).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: /Save changes/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(save).not.toHaveBeenCalled();
});
it("marking a deletion is reversible and saving requires explicit confirmation", async () => {
  const { save } = mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("checkbox", { name: "Select row 1" }),
  );
  await user.click(screen.getByRole("button", { name: "Mark for deletion" }));
  expect(screen.getByLabelText("Marked for deletion")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  expect(
    await screen.findByRole("dialog", {
      name: /Save changes and delete 1 row/,
    }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await user.click(
    screen.getByRole("button", { name: "Save and delete 1 row" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].changes[0].kind).toBe("delete");
});
it("new rows are staged and preserve server defaults until the batch is saved", async () => {
  const { save } = mount();
  const user = userEvent.setup();
  await screen.findByText("Ada");
  await user.click(screen.getByRole("button", { name: "Add row" }));
  await user.type(screen.getByRole("textbox", { name: "Value for id" }), "3");
  await user.tab();
  await user.type(
    screen.getByRole("textbox", { name: "Value for name" }),
    "New person",
  );
  await user.keyboard("{Enter}");
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText("New row — not saved")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].changes[0]).toMatchObject({ kind: "insert" });
  expect(JSON.stringify(save.mock.calls[0][0])).not.toContain(
    '"column":"payload"',
  );
});
it("known write errors retain drafts; unknown outcomes disable blind retries", async () => {
  const { save, onDirtyChange } = mount();
  save.mockRejectedValueOnce({
    kind: "rejected",
    message: "Concurrent change. Nothing saved.",
    rowId: null,
  });
  const user = await editName();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText(/Concurrent change/);
  expect(onDirtyChange).toHaveBeenLastCalledWith("table", true);
  save.mockRejectedValueOnce({
    kind: "unknown",
    message: "Verify the database before retrying.",
    rowId: null,
  });
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText(/Save outcome unknown/);
  expect(
    (screen.getByRole("button", { name: /Save changes/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.keyboard("{Control>}s{/Control}");
  expect(save).toHaveBeenCalledTimes(2);
});
it("Save and continue writes pending changes before navigating", async () => {
  const { save } = mount();
  const user = await editName();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: "Next page" }));
  await user.click(screen.getByRole("button", { name: "Save and continue" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  await screen.findByText(/Page 2/);
});
it("read-only cells keep the value inspector and never create an editor", async () => {
  const { save } = mount(true);
  const user = userEvent.setup();
  await user.dblClick(await screen.findByRole("gridcell", { name: "Ada" }));
  expect(screen.getByRole("textbox", { name: "Full cell value" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Value for name" })).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
it("context menu reverts a cell without changing other rows", async () => {
  const { save } = mount();
  const user = await editName();
  await user.keyboard("{Enter}");
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: /Ada edited/ }), {
    clientX: 100,
    clientY: 100,
  });
  await user.click(
    screen.getByRole("menuitem", { name: "Revert cell change" }),
  );
  expect(screen.queryByLabelText("Unsaved change")).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

it("untouched cells are not marked invalid", async () => {
  mount();
  const cell = await screen.findByRole("gridcell", { name: "Ada" });
  expect(cell.getAttribute("aria-invalid")).toBeNull();
});
it("multiple changed rows use a single save request", async () => {
  const { save } = mount();
  const user = await editName();
  await user.keyboard("{Enter}");
  await user.dblClick(screen.getByRole("gridcell", { name: "Grace" }));
  await user.clear(screen.getByRole("textbox", { name: "Value for name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Value for name" }),
    "Grace edited",
  );
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].changes).toHaveLength(2);
});
it("undoing deletion restores the earlier cell draft", async () => {
  const { save } = mount();
  const user = await editName();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("checkbox", { name: "Select row 1" }));
  await user.click(screen.getByRole("button", { name: "Mark for deletion" }));
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: /Ada edited/ }));
  await user.click(screen.getByRole("menuitem", { name: "Undo row deletion" }));
  expect(screen.queryByLabelText("Marked for deletion")).toBeNull();
  expect(screen.getByRole("gridcell", { name: /Ada edited/ })).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});
it("a failed Save and continue keeps the page and the draft", async () => {
  const { save } = mount();
  save.mockRejectedValueOnce({
    kind: "rejected",
    message: "Conflict",
    rowId: null,
  });
  const user = await editName();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: "Next page" }));
  await user.click(screen.getByRole("button", { name: "Save and continue" }));
  await screen.findByText(/Save was not completed or confirmed/);
  await user.click(screen.getByRole("button", { name: "Keep working" }));
  expect(screen.getByText(/Page 1/)).toBeTruthy();
  expect(screen.getByRole("gridcell", { name: /Ada edited/ })).toBeTruthy();
});
it("switching away preserves the draft and disables that tab's save shortcut", async () => {
  const { save, view, props, session } = mount();
  const user = await editName();
  await user.keyboard("{Enter}");
  const content = (active: boolean) => (
    <WorkSafetyProvider>
      <SessionProvider session={session}>
        <TableDataView {...props} active={active} />
      </SessionProvider>
    </WorkSafetyProvider>
  );
  view.rerender(content(false));
  await user.keyboard("{Control>}s{/Control}");
  expect(save).not.toHaveBeenCalled();
  view.rerender(content(true));
  expect(screen.getByRole("gridcell", { name: /Ada edited/ })).toBeTruthy();
  await user.keyboard("{Control>}s{/Control}");
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
});
it("JSON editor keeps exact numeric text and Enter only adds a line", async () => {
  const { save } = mount();
  const user = userEvent.setup();
  await user.dblClick(
    await screen.findByRole("gridcell", { name: '{"id":9007199254740993}' }),
  );
  const field = screen.getByRole("textbox", { name: "Value for payload" });
  await user.clear(field);
  await user.type(field, '{{"id":9007199254740995}');
  await user.keyboard("{End}{Enter}");
  expect((field as HTMLTextAreaElement).value).toBe(
    '{"id":9007199254740995}\n',
  );
  expect(
    screen.getByRole("textbox", { name: "Value for payload" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(JSON.stringify(save.mock.calls[0][0])).toContain("9007199254740995");
});
it("comparison fetches current values without changing the draft or original version", async () => {
  const { save, compare } = mount();
  const user = await editName();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: "Review" }));
  await user.click(
    screen.getByRole("button", { name: "Check current database values" }),
  );
  await waitFor(() => expect(compare).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("Database now name").textContent).toBe(
    "Concurrent name",
  );
  expect(screen.getByLabelText("Original name").textContent).toBe("Ada");
  expect(screen.getByLabelText("Pending name").textContent).toBe("Ada edited");
  await user.click(screen.getByRole("button", { name: "Close" }));
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].changes[0]).toMatchObject({ rowVersion: "10" });
});
it("a refresh failure after a confirmed insert keeps its returned values without repeating the write", async () => {
  const { save, load, onDirtyChange } = mount();
  const user = userEvent.setup();
  await screen.findByText("Ada");
  await user.click(screen.getByRole("button", { name: "Add row" }));
  await user.type(screen.getByRole("textbox", { name: "Value for id" }), "3");
  await user.tab();
  await user.type(
    screen.getByRole("textbox", { name: "Value for name" }),
    "Inserted person",
  );
  await user.keyboard("{Enter}");
  load.mockRejectedValueOnce("Refresh unavailable");
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText("Refresh unavailable");
  expect(screen.getByText("Changes saved")).toBeTruthy();
  expect(
    screen.getByRole("gridcell", { name: "Inserted person" }),
  ).toBeTruthy();
  expect(onDirtyChange).toHaveBeenLastCalledWith("table", false);
  await user.keyboard("{Control>}s{/Control}");
  expect(save).toHaveBeenCalledOnce();
});

it("removes the permanent tools and instructions while keeping contextual inspection", async () => {
  mount();
  const user = userEvent.setup();
  const cell = await screen.findByRole("gridcell", { name: "Ada" });
  expect(screen.queryByText(/Double-click or F2 to edit/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy cells" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy JSON" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Inspect value" })).toBeNull();
  cell.focus();
  await user.keyboard("{Shift>}{F10}{/Shift}");
  await user.click(screen.getByRole("menuitem", { name: "Inspect value" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Full cell value",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Ada");
});
it("context Copy uses the clicked cell without needing an earlier selection", async () => {
  mount();
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  fireEvent.contextMenu(await screen.findByRole("gridcell", { name: "Grace" }));
  await user.click(
    screen.getByRole("menuitem", { name: /^Copy (?:Ctrl|⌘) C$/ }),
  );
  expect(write).toHaveBeenLastCalledWith("Grace");
  expect(screen.getByText(/Copied escaped TSV/).className).toBe("sr-only");
});
it("right-click within a selected range preserves that range for JSON copying", async () => {
  mount();
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  await user.click(await screen.findByRole("gridcell", { name: "Ada" }));
  await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: "Grace" }));
  await user.click(screen.getByRole("menuitem", { name: "Copy as JSON" }));
  expect(write).toHaveBeenLastCalledWith('[["Ada"],["Grace"]]');
});
it("a right-click outside the selection copies the new cell, and Ctrl+C still works", async () => {
  mount();
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  await user.click(await screen.findByRole("gridcell", { name: "Ada" }));
  await user.keyboard("{Control>}c{/Control}");
  expect(write).toHaveBeenLastCalledWith("Ada");
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: "Grace" }));
  await user.click(screen.getByRole("menuitem", { name: "Copy as JSON" }));
  expect(write).toHaveBeenLastCalledWith('[["Grace"]]');
});
it("clipboard failures remain visible and dismissible without restoring the toolbar", async () => {
  mount();
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
    new Error("Denied"),
  );
  await user.click(await screen.findByRole("gridcell", { name: "Ada" }));
  await user.keyboard("{Control>}c{/Control}");
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Clipboard unavailable"),
  );
  await user.click(
    screen.getByRole("button", { name: "Dismiss clipboard error" }),
  );
  expect(screen.queryByText(/Clipboard unavailable/)).toBeNull();
});
it("Duplicate row copies the displayed draft, resets its key, and sends no write until Save", async () => {
  const { save } = mount();
  const user = await editName("Staged name");
  await user.keyboard("{Enter}");
  fireEvent.contextMenu(screen.getByRole("gridcell", { name: /Staged name/ }));
  await user.click(screen.getByRole("menuitem", { name: "Duplicate row" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText("New row — not saved")).toBeTruthy();
  expect(
    (screen.getByRole("textbox", { name: "Value for id" }) as HTMLInputElement)
      .value,
  ).toBe("");
  await user.type(screen.getByRole("textbox", { name: "Value for id" }), "3");
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const insert = save.mock.calls[0][0].changes.find(
    (change) => change.kind === "insert",
  );
  expect(insert).toMatchObject({
    kind: "insert",
    values: expect.arrayContaining([
      { column: "id", value: "3" },
      { column: "name", value: "Staged name" },
      { column: "note", value: null },
      { column: "counter", value: "9007199254740993" },
    ]),
  });
  expect(save.mock.calls[0][0].changes).toHaveLength(2);
});
it("duplicating generated keys leaves AUTO and uses the existing insert command without the old key", async () => {
  const { save } = mount(false, true);
  const user = userEvent.setup();
  fireEvent.contextMenu(await screen.findByRole("gridcell", { name: "Ada" }));
  await user.click(screen.getByRole("menuitem", { name: "Duplicate row" }));
  expect(screen.getByText("AUTO")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Value for id" })).toBeNull();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const insert = save.mock.calls[0][0].changes[0];
  expect(insert.kind).toBe("insert");
  if (insert.kind === "insert")
    expect(insert.values.some((cell) => cell.column === "id")).toBe(false);
});
it("duplicated drafts can be discarded and read-only sessions cannot duplicate", async () => {
  const { save, view } = mount();
  const user = userEvent.setup();
  fireEvent.contextMenu(await screen.findByRole("gridcell", { name: "Ada" }));
  await user.click(screen.getByRole("menuitem", { name: "Duplicate row" }));
  await user.keyboard("{Escape}");
  fireEvent.contextMenu(screen.getAllByRole("gridcell", { name: "Ada" })[0]);
  await user.click(screen.getByRole("menuitem", { name: "Discard new row" }));
  expect(screen.queryByLabelText("New row — not saved")).toBeNull();
  expect(save).not.toHaveBeenCalled();
  view.unmount();
  mount(true);
  fireEvent.contextMenu(await screen.findByRole("gridcell", { name: "Ada" }));
  expect(
    (
      screen.getByRole("menuitem", {
        name: "Duplicate row",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
