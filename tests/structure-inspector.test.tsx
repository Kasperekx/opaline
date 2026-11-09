import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { SessionProvider } from "../src/features/connections/SessionContext";
import { newProfile } from "../src/features/connections/connection-types";
import type { TableTab } from "../src/features/query/query-types";
import { StructureInspector } from "../src/features/structure/StructureInspector";
import type { RelationStructure } from "../src/shared/types/structure";
import { showcaseStructure } from "./schema-showcase-fixture";

// Exercise the SQL value and editability contract without CodeMirror's browser
// layout machinery; the surrounding inspector and all IPC remain real.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    readOnly,
    editable,
  }: {
    value: string;
    readOnly?: boolean;
    editable?: boolean;
  }) => (
    <textarea
      aria-label="SQL preview"
      value={value}
      readOnly={readOnly || editable === false}
      onChange={() => {}}
    />
  ),
}));

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterAll(() => {
  if (originalScrollIntoView)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function mount(
  options: {
    snapshot?: RelationStructure;
    load?: (args: unknown) => RelationStructure | Promise<RelationStructure>;
  } = {},
) {
  const snapshot = options.snapshot ?? showcaseStructure("public", "players");
  const inspect = vi.fn((args: unknown) =>
    options.load ? options.load(args) : snapshot,
  );
  const commands: string[] = [];
  mockIPC((command, args) => {
    commands.push(command);
    if (command === "inspect_relation") return inspect(args);
    throw new Error(`Unexpected database operation: ${command}`);
  });
  const onOpenQuery = vi.fn();
  const onOpenTable = vi.fn();
  const onEditStructure = vi.fn();
  const session = {
    ...newProfile("structure-tests"),
    id: "structure-session",
    profileId: "structure-profile",
    serverVersion: "17",
  };
  const subject = (relation: RelationStructure, activeSession = session) => {
    const tab: TableTab = {
      kind: "table",
      id: "structure-tab",
      title: relation.name,
      schema: relation.schema,
      table: relation.name,
      objectType: relation.objectType,
    };
    return (
      <SessionProvider session={activeSession}>
        <StructureInspector
          tab={tab}
          onOpenQuery={onOpenQuery}
          onOpenTable={onOpenTable}
          onEditStructure={onEditStructure}
        />
      </SessionProvider>
    );
  };
  const view = render(subject(snapshot));
  return {
    inspect,
    commands,
    onOpenQuery,
    onOpenTable,
    onEditStructure,
    changeRelation: (relation: RelationStructure) =>
      view.rerender(subject(relation)),
    changeSession: (id: string) =>
      view.rerender(subject(snapshot, { ...session, id })),
  };
}

it("loads the explicit session and supports all five sections with arrow, Home and End keys", async () => {
  const user = userEvent.setup();
  const { inspect } = mount();
  await screen.findByRole("table", { name: "Column definitions" });
  expect(inspect).toHaveBeenCalledWith({
    sessionId: "structure-session",
    schema: "public",
    table: "players",
  });
  const tablist = screen.getByRole("tablist", { name: "Structure sections" });
  const labels = ["Columns", "Indexes", "Foreign keys", "Constraints", "DDL"];
  const tabs = labels.map((label) =>
    within(tablist).getByRole("tab", { name: new RegExp(`^${label}\\b`) }),
  );
  expect(within(tablist).getAllByRole("tab")).toHaveLength(5);
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  tabs[0].focus();
  for (const [key, index] of [
    ["{ArrowRight}", 1],
    ["{End}", 4],
    ["{Home}", 0],
    ["{ArrowLeft}", 4],
    ["{ArrowRight}", 0],
  ] as const) {
    await user.keyboard(key);
    expect(document.activeElement).toBe(tabs[index]);
    expect(tabs[index].getAttribute("aria-selected")).toBe("true");
    expect(tabs[index].tabIndex).toBe(0);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  }
});

it("preserves column nullability, defaults, comments and enum values", async () => {
  const user = userEvent.setup();
  const snapshot = showcaseStructure("public", "players");
  snapshot.columns = snapshot.columns.map((column) =>
    column.name === "class"
      ? {
          ...column,
          dataType: "public.player_class",
          defaultValue: "'Ranger'::public.player_class",
          enumValues: ["Ranger", "Guardian", "Mage"],
        }
      : { ...column, nullable: column.name === "name" },
  );
  mount({ snapshot });
  const table = await screen.findByRole("table", {
    name: "Column definitions",
  });
  const row = (name: string) =>
    within(table)
      .getByRole("rowheader", { name: new RegExp(`\\b${name}\\b`) })
      .closest("tr")!;
  expect(row("id").textContent).toContain("gen_random_uuid()");
  expect(row("id").textContent).toContain("Unique player identifier");
  expect(within(row("id")).getByText("Not null")).toBeTruthy();
  expect(within(row("name")).getByText("Nullable")).toBeTruthy();
  expect(row("class").textContent).toContain("public.player_class");
  expect(row("class").textContent).toContain("'Ranger'::public.player_class");
  await user.click(within(row("class")).getByText("3 allowed values"));
  for (const value of ["Ranger", "Guardian", "Mage"])
    expect(row("class").textContent).toContain(value);
});

it("filters metadata, clears empty results and resets the query when switching tabs", async () => {
  const user = userEvent.setup();
  const snapshot = showcaseStructure("public", "players");
  mount({ snapshot });
  await screen.findByRole("table", { name: "Column definitions" });
  const columnsTab = screen.getByRole("tab", { name: /^Columns\b/ });
  const fullCount = columnsTab.textContent;
  await user.type(
    screen.getByRole("textbox", { name: "Filter columns" }),
    "account_id",
  );
  expect(
    screen.getAllByRole("rowheader").map((cell) => cell.textContent),
  ).toEqual(["account_id"]);
  expect(columnsTab.textContent).toBe(fullCount);
  await user.clear(screen.getByRole("textbox", { name: "Filter columns" }));
  await user.type(
    screen.getByRole("textbox", { name: "Filter columns" }),
    "does-not-exist",
  );
  const emptyPanel = within(screen.getByRole("tabpanel"));
  expect(emptyPanel.getByText("No matching columns")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear filter" }));
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Filter columns" }),
  );
  expect(screen.getAllByRole("rowheader")).toHaveLength(
    snapshot.columns.length,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Filter columns" }),
    "account_id",
  );
  await user.click(screen.getByRole("tab", { name: /^Indexes\b/ }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Filter indexes",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  await user.click(columnsTab);
  expect(
    (
      screen.getByRole("textbox", {
        name: "Filter columns",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  expect(screen.getAllByRole("rowheader")).toHaveLength(
    snapshot.columns.length,
  );
});

it("reveals and copies exact index and constraint definitions without database writes", async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const snapshot = showcaseStructure("public", "players");
  const index = snapshot.indexes[1];
  index.includedColumns = ["name"];
  index.predicate = "(level > 1)";
  index.valid = false;
  const constraint = snapshot.constraints[snapshot.constraints.length - 1];
  constraint.validated = false;
  constraint.deferrable = true;
  constraint.initiallyDeferred = true;
  const { commands } = mount({ snapshot });
  await screen.findByRole("table", { name: "Column definitions" });
  await user.click(screen.getByRole("tab", { name: /^Indexes\b/ }));
  const indexTable = screen.getByRole("table", { name: "Indexes" });
  expect(indexTable.textContent).toContain("Invalid");
  expect(indexTable.textContent).toContain(index.predicate);
  const showIndex = within(indexTable).getByRole("button", {
    name: `Show SQL definition for ${index.name}`,
  });
  expect(showIndex.getAttribute("aria-expanded")).toBe("false");
  await user.click(showIndex);
  expect(showIndex.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText(index.definition)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Copy definition" }));
  expect(copy).toHaveBeenLastCalledWith(index.definition);
  await user.click(screen.getByRole("tab", { name: /^Constraints\b/ }));
  const constraintTable = screen.getByRole("table", { name: "Constraints" });
  expect(constraintTable.textContent).toContain("Not validated");
  expect(constraintTable.textContent?.toLowerCase()).toContain("deferred");
  await user.click(
    within(constraintTable).getByRole("button", {
      name: `Show SQL definition for ${constraint.name}`,
    }),
  );
  expect(screen.getByText(constraint.definition)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Copy definition" }));
  expect(copy).toHaveBeenLastCalledWith(constraint.definition);
  expect(commands).toEqual(["inspect_relation"]);
});

it("opens both ends of a cross-schema foreign key with their exact identifiers", async () => {
  const user = userEvent.setup();
  const snapshot = showcaseStructure("public", "accounts");
  const { onOpenTable, commands } = mount({ snapshot });
  await screen.findByRole("table", { name: "Column definitions" });
  await user.click(screen.getByRole("tab", { name: /^Foreign keys\b/ }));
  const table = screen.getByRole("table", { name: "Foreign keys" });
  const row = within(table).getByText("purchase_account_fkey").closest("tr")!;
  expect(row.textContent).toContain("Referenced by");
  await user.click(
    within(row).getByRole("button", { name: "Open table billing.purchases" }),
  );
  expect(onOpenTable).toHaveBeenLastCalledWith("billing", "purchases");
  await user.click(
    within(row).getByRole("button", { name: "Open table public.accounts" }),
  );
  expect(onOpenTable).toHaveBeenLastCalledWith("public", "accounts");
  expect(commands).toEqual(["inspect_relation"]);
});

it("keeps DDL read-only and copies or opens the exact SQL without executing it", async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const snapshot = showcaseStructure("public", "players");
  const { onOpenQuery, commands } = mount({ snapshot });
  await screen.findByRole("table", { name: "Column definitions" });
  await user.click(screen.getByRole("tab", { name: /^DDL\b/ }));
  const preview = screen.getByRole("textbox", {
    name: "SQL preview",
  }) as HTMLTextAreaElement;
  expect(preview.readOnly).toBe(true);
  expect(preview.value).toBe(snapshot.ddl);
  await user.type(preview, "DROP TABLE public.players;");
  expect(preview.value).toBe(snapshot.ddl);
  expect(screen.queryByRole("textbox", { name: /^Filter / })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Copy DDL" }));
  expect(copy).toHaveBeenCalledWith(snapshot.ddl);
  await user.click(screen.getByRole("button", { name: "Open in SQL editor" }));
  expect(onOpenQuery).toHaveBeenCalledExactlyOnceWith(
    snapshot.ddl,
    "players DDL",
  );
  expect(commands).toEqual(["inspect_relation"]);
});

it("offers structure editing only for a loaded table", async () => {
  const snapshot = showcaseStructure("public", "players");
  const pending = deferred<RelationStructure>();
  const { onEditStructure, inspect, changeRelation } = mount({
    load: () => pending.promise,
  });
  expect(screen.queryByRole("button", { name: "Edit structure" })).toBeNull();
  await act(async () => pending.resolve(snapshot));
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit structure" }),
  );
  expect(onEditStructure).toHaveBeenCalledOnce();
  const view = {
    ...showcaseStructure("public", "accounts"),
    objectType: "View",
  };
  inspect.mockReturnValueOnce(view);
  changeRelation(view);
  await screen.findByRole("rowheader", { name: "email" });
  expect(screen.queryByRole("button", { name: "Edit structure" })).toBeNull();
});

it("shows loading and allows an initial failed inspection to be retried", async () => {
  const pending = deferred<RelationStructure>();
  const { inspect } = mount({ load: () => pending.promise });
  expect(screen.getByRole("status").textContent).toMatch(/loading structure/i);
  expect(
    (
      screen.getByRole("button", {
        name: "Refresh structure",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await act(async () => pending.reject("Catalog unavailable"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Catalog unavailable",
  );
  expect(
    screen.queryByRole("table", { name: "Column definitions" }),
  ).toBeNull();
  inspect.mockReturnValueOnce(showcaseStructure("public", "players"));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(inspect).toHaveBeenCalledTimes(2);
});

it("retains a same-relation snapshot when refresh fails and replaces it on retry", async () => {
  const { inspect } = mount();
  await screen.findByRole("table", { name: "Column definitions" });
  inspect.mockRejectedValueOnce("Catalog timed out");
  fireEvent.click(screen.getByRole("button", { name: "Refresh structure" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Showing the previous snapshot");
  expect(screen.getByRole("rowheader", { name: "account_id" })).toBeTruthy();
  const refreshed = showcaseStructure("public", "players");
  refreshed.comment = "Fresh catalog snapshot";
  inspect.mockReturnValueOnce(refreshed);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Fresh catalog snapshot");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("hides the prior relation immediately and ignores its late refresh response", async () => {
  const { inspect, changeRelation } = mount();
  await screen.findByRole("table", { name: "Column definitions" });
  const oldRefresh = deferred<RelationStructure>();
  inspect.mockReturnValueOnce(oldRefresh.promise);
  fireEvent.click(screen.getByRole("button", { name: "Refresh structure" }));
  expect(screen.getByRole("rowheader", { name: "account_id" })).toBeTruthy();
  const nextLoad = deferred<RelationStructure>();
  inspect.mockReturnValueOnce(nextLoad.promise);
  const accounts = showcaseStructure("public", "accounts");
  changeRelation(accounts);
  expect(screen.queryByRole("rowheader", { name: "account_id" })).toBeNull();
  expect(
    screen.queryByRole("table", { name: "Column definitions" }),
  ).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/loading structure/i);
  await act(async () => nextLoad.resolve(accounts));
  await screen.findByRole("rowheader", { name: "email" });
  const stale = showcaseStructure("public", "players");
  stale.comment = "Stale relation response";
  await act(async () => oldRefresh.resolve(stale));
  expect(screen.getByRole("rowheader", { name: "email" })).toBeTruthy();
  expect(screen.queryByRole("rowheader", { name: "account_id" })).toBeNull();
  expect(screen.queryByText("Stale relation response")).toBeNull();
});

it("hides the previous session's structure even when the relation name is unchanged", async () => {
  const { inspect, changeSession } = mount();
  await screen.findByRole("table", { name: "Column definitions" });
  const pending = deferred<RelationStructure>();
  inspect.mockReturnValueOnce(pending.promise);
  changeSession("other-session");
  expect(
    screen.queryByRole("table", { name: "Column definitions" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit structure" })).toBeNull();
  expect(inspect).toHaveBeenLastCalledWith({
    sessionId: "other-session",
    schema: "public",
    table: "players",
  });
  const next = showcaseStructure("public", "players");
  next.comment = "Structure from the other database";
  await act(async () => pending.resolve(next));
  await screen.findByText("Structure from the other database");
  expect(
    screen.getByRole("table", { name: "Column definitions" }),
  ).toBeTruthy();
});

it("handles empty metadata and unavailable DDL without offering SQL actions", async () => {
  const user = userEvent.setup();
  const snapshot = {
    ...showcaseStructure("public", "players"),
    columns: [],
    indexes: [],
    constraints: [],
    foreignKeys: [],
    ddl: null,
  };
  const { onOpenQuery } = mount({ snapshot });
  await screen.findByText("No columns");
  expect(screen.queryAllByRole("rowheader")).toHaveLength(0);
  for (const [section, message] of [
    ["Indexes", "No indexes"],
    ["Foreign keys", "No foreign keys"],
    ["Constraints", "No table constraints"],
    ["DDL", "DDL preview unavailable"],
  ]) {
    await user.click(
      screen.getByRole("tab", { name: new RegExp(`^${section}\\b`) }),
    );
    expect(screen.getByText(message)).toBeTruthy();
  }
  expect(screen.queryByRole("button", { name: "Copy DDL" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Open in SQL editor" }),
  ).toBeNull();
  expect(onOpenQuery).not.toHaveBeenCalled();
});
