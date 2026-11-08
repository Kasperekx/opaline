import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "../src/features/query/CommandPalette";
import {
  fuzzyMatch,
  rankPalette,
  requestPaletteScope,
  type CommandAction,
} from "../src/features/query/command-palette-model";
import { useWorkspaceCommands } from "../src/features/query/useWorkspaceCommands";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => vi.fn()),
}));

const table = (
  name: string,
  extra: Partial<CommandAction> = {},
): CommandAction => ({
  id: `object:${name}`,
  label: name,
  section: "Tables",
  detail: "public",
  qualified: `public.${name}`,
  run: vi.fn(),
  ...extra,
});
const labels = (items: CommandAction[], query: string, scope = "all") =>
  rankPalette(items, query, scope as "all").groups.flatMap((group) =>
    group.items.map((entry) => entry.item.label),
  );

describe("palette ranking", () => {
  it("ranks prefix over word start over acronym over substring over subsequence", () => {
    const prefix = fuzzyMatch("ord", "orders")!.score;
    const wordStart = fuzzyMatch("ord", "customer_orders")!.score;
    const acronym = fuzzyMatch("oi", "order_items")!.score;
    const substring = fuzzyMatch("rde", "orders")!.score;
    const subsequence = fuzzyMatch("odr", "orders")!.score;
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(acronym);
    expect(acronym).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(subsequence);
    expect(fuzzyMatch("xyz", "orders")).toBeNull();
    expect(fuzzyMatch("oi", "order_items")!.positions).toEqual([0, 6]);
    // camelCase humps count as word starts.
    expect(fuzzyMatch("Items", "orderItems")!.score).toBeGreaterThan(acronym);
  });

  it("prefers the shorter name on ties and puts the best section first", () => {
    const items = [
      table("users_archive"),
      table("users"),
      table("superusers"),
      { label: "Use read-only mode", run: vi.fn() },
    ];
    expect(labels(items, "users")).toEqual([
      "users",
      "users_archive",
      "superusers",
    ]);
    const { groups } = rankPalette(
      [...items, { label: "Format SQL", run: vi.fn() }],
      "form",
      "all",
    );
    expect(groups[0]!.title).toBe("Commands");
    expect(labels(items, "public.us")).toContain("users");
  });

  it("shows recent items, then commands by use, on an empty query", () => {
    const items: CommandAction[] = [
      { label: "Format SQL", run: vi.fn() },
      { label: "Query history", run: vi.fn(), uses: 3 },
      table("orders", { lastUsed: 2 }),
      table("users", { lastUsed: 5 }),
      table("sessions"),
    ];
    const { groups } = rankPalette(items, "", "all");
    expect(groups.map((group) => group.title)).toEqual(["Recent", "Commands"]);
    expect(groups[0]!.items.map((entry) => entry.item.label)).toEqual([
      "users",
      "orders",
    ]);
    expect(groups[1]!.items[0]!.item.label).toBe("Query history");
    // Scoped to tables: recent first, then everything else alphabetically.
    expect(labels(items, "", "tables")).toEqual([
      "users",
      "orders",
      "sessions",
    ]);
  });
});

describe("command palette", () => {
  it("groups results, bolds matches and opens with Return or the alternate with Cmd+Return", async () => {
    const user = userEvent.setup();
    const openOrders = vi.fn();
    const editOrders = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette
        onClose={onClose}
        commands={[
          { label: "Open SQL file", run: vi.fn() },
          table("orders", {
            run: openOrders,
            meta: "48.3K rows",
            alternate: { label: "Edit structure", run: editOrders },
          }),
          table("order_items"),
        ]}
      />,
    );
    const field = screen.getByRole("combobox", { name: "Find command" });
    await user.type(field, "ord");
    const tables = screen.getByRole("group", { name: "Tables" });
    const options = within(tables).getAllByRole("option");
    expect(options[0]!.querySelector("b")!.textContent).toBe("ord");
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    expect(within(options[0]!).getByText("48.3K rows")).toBeTruthy();
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(editOrders).toHaveBeenCalledOnce();
    expect(openOrders).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("skips disabled rows with the arrows and runs the highlighted one", async () => {
    const user = userEvent.setup();
    const second = vi.fn();
    render(
      <CommandPalette
        onClose={vi.fn()}
        commands={[
          { label: "Save SQL file", run: vi.fn() },
          { label: "Save SQL file as…", run: vi.fn(), disabled: true },
          { label: "Save the world later", run: second },
        ]}
      />,
    );
    await user.type(
      screen.getByRole("combobox", { name: "Find command" }),
      "sav",
    );
    await user.keyboard("{ArrowDown}{Enter}");
    expect(second).toHaveBeenCalledOnce();
  });

  it("opens scoped to tables and Backspace widens the scope", async () => {
    const user = userEvent.setup();
    requestPaletteScope("tables");
    render(
      <CommandPalette
        onClose={vi.fn()}
        commands={[{ label: "Format SQL", run: vi.fn() }, table("users")]}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Open Quickly" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Commands" })).toBeNull();
    screen.getByRole("combobox", { name: "Find command" }).focus();
    await user.keyboard("{Backspace}");
    expect(screen.getByRole("group", { name: "Commands" })).toBeTruthy();
  });
});

describe("workspace palette items", () => {
  it("opens tables through the explorer path and maps Shift+Cmd+O to tables", () => {
    const selectObject = vi.fn();
    const openCommands = vi.fn();
    const object = {
      schema: "public",
      name: "users",
      objectType: "table",
      estimatedRows: 2184,
    };
    let items: CommandAction[] = [];
    function Harness() {
      items = useWorkspaceCommands({
        active: true,
        hasQuery: false,
        workspace: {
          objects: [
            object,
            { ...object, name: "active_users", objectType: "view" },
          ],
          selectObject,
          tabs: { tabs: [], activeTab: null, openSchema: vi.fn() },
        },
        documents: {},
        completions: {},
        onOpenCommands: openCommands,
      } as unknown as Parameters<typeof useWorkspaceCommands>[0]);
      return null;
    }
    render(<Harness />);
    const users = items.find((item) => item.label === "users")!;
    expect(users.section).toBe("Tables");
    expect(users.meta).toBe("2,184 rows");
    expect(items.find((item) => item.label === "active_users")!.section).toBe(
      "Views",
    );
    act(() => users.run());
    expect(selectObject).toHaveBeenCalledExactlyOnceWith(object);

    fireEvent.keyDown(window, { key: "O", shiftKey: true, metaKey: true });
    expect(openCommands).toHaveBeenCalledOnce();
    render(<CommandPalette onClose={vi.fn()} commands={items} />);
    expect(screen.getByRole("dialog", { name: "Open Quickly" })).toBeTruthy();
  });
});
