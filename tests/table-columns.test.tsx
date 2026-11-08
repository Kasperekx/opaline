import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";
import { SessionProvider } from "../src/features/connections/SessionContext";
import { newProfile } from "../src/features/connections/connection-types";
import { TableDataView } from "../src/features/table/TableDataView";
import { rankColumns } from "../src/features/table/TableColumnsPopover";
import {
  readTableView,
  tableViewKey,
} from "../src/features/table/table-view-state";
import type {
  ColumnInfo,
  TablePageRequest,
} from "../src/shared/types/database";
import { tableChangePage } from "./table-change-fixture";

function mount() {
  const page = structuredClone(tableChangePage);
  const load = vi.fn(async (input: TablePageRequest) => ({
    ...structuredClone(page),
    page: input.page,
  }));
  mockIPC((command, args) => {
    if (command === "load_table_page")
      return load((args as { input: TablePageRequest }).input);
  });
  const session = {
    ...newProfile("mmo"),
    id: "session",
    profileId: "columns-profile",
    serverVersion: "test",
    readOnly: false,
    environment: "local" as const,
  };
  render(
    <WorkSafetyProvider>
      <SessionProvider session={session}>
        <TableDataView
          tab={{
            id: "table",
            kind: "table",
            title: "users",
            schema: "public",
            table: "users",
            objectType: "table",
          }}
          active
          onDirtyChange={vi.fn()}
          onOpenQuery={vi.fn()}
        />
      </SessionProvider>
    </WorkSafetyProvider>,
  );
  return { load };
}

const column = (name: string): ColumnInfo =>
  ({ ...tableChangePage.columns[1], name }) as ColumnInfo;

it("ranks columns: prefix, then word start, then substring, then loose", () => {
  const columns = [
    "user_id",
    "username",
    "name",
    "created_at",
    "max_durability",
  ].map(column);
  expect(rankColumns(columns, "name").map((m) => m.column.name)).toEqual([
    "name",
    "username",
  ]);
  expect(rankColumns(columns, "dur")[0].column.name).toBe("max_durability");
  expect(rankColumns(columns, "maxdur").map((m) => m.column.name)).toEqual([
    "max_durability",
  ]);
  expect(rankColumns(columns, "")).toHaveLength(columns.length);
});

it("rejects malformed column view state instead of trusting storage", () => {
  const key = tableViewKey("p", "public", "users");
  localStorage.setItem(
    key,
    JSON.stringify({
      page: 0,
      pageSize: 50,
      filter: "",
      sort: null,
      hiddenColumns: [42],
    }),
  );
  expect(readTableView(key).hiddenColumns).toEqual([]);
  localStorage.setItem(
    key,
    JSON.stringify({
      page: 0,
      pageSize: 50,
      filter: "",
      sort: null,
      hiddenColumns: ["note"],
      searchColumn: "name",
    }),
  );
  expect(readTableView(key)).toMatchObject({
    hiddenColumns: ["note"],
    searchColumn: "name",
  });
});

it("turns 'column:' into a search token and searches only that column", async () => {
  const { load } = mount();
  const user = userEvent.setup();
  await screen.findByRole("gridcell", { name: "Ada" });
  const search = screen.getByRole("textbox", { name: "Filter table rows" });
  await user.type(search, "name:Ada");
  expect(
    screen.getByRole("button", { name: "Search all columns instead of name" }),
  ).toBeTruthy();
  expect((search as HTMLInputElement).value).toBe("Ada");
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filter: null,
        conditions: [{ column: "name", operator: "contains", value: "Ada" }],
      }),
    ),
  );
  // Backspace at the start of the field removes the token again.
  await user.click(search);
  (search as HTMLInputElement).setSelectionRange(0, 0);
  await user.keyboard("{Backspace}");
  expect(
    screen.queryByRole("button", {
      name: "Search all columns instead of name",
    }),
  ).toBeNull();
});

it("hides a column from its menu and brings it back from Columns", async () => {
  mount();
  const user = userEvent.setup();
  await screen.findByRole("gridcell", { name: "Ada" });
  await user.click(
    screen.getByRole("button", { name: "Column options for note" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Hide column" }));
  expect(screen.queryByRole("button", { name: "Sort by note" })).toBeNull();
  expect(
    readTableView(tableViewKey("columns-profile", "public", "users"))
      .hiddenColumns,
  ).toEqual(["note"]);

  await user.click(screen.getByRole("button", { name: "Columns" }));
  const panel = screen.getByRole("dialog", { name: "Columns" });
  expect(within(panel).getByText(/5 of 6 shown/)).toBeTruthy();
  await user.click(within(panel).getByRole("checkbox", { name: "Show note" }));
  expect(screen.getByRole("button", { name: "Sort by note" })).toBeTruthy();
});

it("jumps to a column from Columns with the keyboard", async () => {
  mount();
  const user = userEvent.setup();
  await screen.findByRole("gridcell", { name: "Ada" });
  await user.click(screen.getByRole("button", { name: "Columns" }));
  const find = screen.getByRole("combobox", { name: "Find column" });
  await user.type(find, "count");
  expect(
    within(screen.getByRole("listbox", { name: "Table columns" })).getAllByRole(
      "option",
    )[0].textContent,
  ).toContain("counter");
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("dialog", { name: "Columns" })).toBeNull();
  await waitFor(() =>
    expect(
      (document.activeElement as HTMLElement | null)?.dataset.gridColumn,
    ).toBe("5"),
  );
});
