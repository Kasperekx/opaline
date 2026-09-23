import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, it, vi } from "vitest";
import { SchemaEditor } from "../src/features/structure/SchemaEditor";
import { SessionProvider } from "../src/features/connections/SessionContext";
import { newProfile } from "../src/features/connections/connection-types";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";
import { useWorkspaceTabs } from "../src/features/query/useWorkspaceTabs";

const snapshot = {
  relationOid: 123,
  schema: "public",
  name: "orders",
  objectType: "Table",
  owner: "postgres",
  comment: null,
  columns: [],
  indexes: [],
  constraints: [],
  foreignKeys: [],
  ddl: "CREATE TABLE orders ();",
  ddlNotes: [],
};
function mount(
  options: {
    existing?: boolean;
    readOnly?: boolean;
    blocked?: boolean;
    unknown?: boolean;
  } = {},
) {
  const apply = vi.fn(),
    done = vi.fn(),
    preview = vi.fn();
  mockIPC((command, args) => {
    if (command === "list_enum_types")
      return [
        {
          schema: "public",
          name: "order_status",
          oid: 99,
          values: ["draft", "ready"],
        },
      ];
    if (command === "inspect_relation") return snapshot;
    if (command === "preview_schema_change") {
      preview(args);
      return {
        sql: options.existing
          ? 'DROP TABLE "public"."orders" RESTRICT;'
          : 'CREATE TABLE "public"."orders" (id bigint);',
        destructive: !!options.existing,
      };
    }
    if (command === "apply_schema_change") {
      apply();
      if (options.unknown)
        throw { kind: "unknown", message: "Commit outcome unknown" };
    }
  });
  render(
    <WorkSafetyProvider>
      <SessionProvider
        session={{
          ...newProfile("w"),
          id: "s",
          profileId: "p",
          serverVersion: "17",
          name: "Development",
          readOnly: !!options.readOnly,
        }}
      >
        <SchemaEditor
          tab={{
            kind: "schema",
            id: "editor",
            schema: "public",
            table: options.existing ? "orders" : null,
            title: "Structure",
            drop: !!options.existing,
          }}
          online
          canApply={() => !options.blocked}
          onDirtyChange={() => {}}
          onApplied={done}
        />
      </SessionProvider>
    </WorkSafetyProvider>,
  );
  return { apply, done, preview };
}
it("stages enum changes and selects a schema-qualified type without writing", async () => {
  const { preview, apply } = mount();
  await screen.findAllByRole("option", { name: "public.order_status" });
  fireEvent.change(screen.getByLabelText("Column 1 type"), {
    target: { value: '"public"."order_status"' },
  });
  fireEvent.click(screen.getByText("Enum types"));
  fireEvent.change(screen.getByLabelText("Edit existing type"), {
    target: { value: '"public"."order_status"' },
  });
  fireEvent.change(screen.getByLabelText("Enum 1 value 1"), {
    target: { value: "pending" },
  });
  expect(screen.queryByLabelText("Remove new value 1 from enum 1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add value" }));
  fireEvent.change(screen.getByLabelText("Enum 1 value 3"), {
    target: { value: "done" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review SQL" }));
  await waitFor(() => expect(preview).toHaveBeenCalledOnce());
  expect(preview.mock.calls[0][0].input.columns[0].enumType).toEqual({
    schema: "public",
    name: "order_status",
  });
  expect(preview.mock.calls[0][0].input.enumChanges[0].values).toEqual([
    "pending",
    "ready",
    "done",
  ]);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Discard enum draft 1" }));
  expect(screen.queryByRole("button", { name: "Apply changes" })).toBeNull();
});
it("offers draft enums in the column picker and keeps new labels removable", async () => {
  mount();
  fireEvent.click(screen.getByText("Enum types"));
  fireEvent.click(screen.getByRole("button", { name: "New enum type" }));
  fireEvent.change(screen.getByLabelText("Enum 1 name"), {
    target: { value: "priority" },
  });
  fireEvent.change(screen.getByLabelText("Enum 1 value 1"), {
    target: { value: "low" },
  });
  expect(
    await screen.findByRole("option", { name: "public.priority" }),
  ).toBeTruthy();
  expect(screen.getByLabelText("Remove new value 1 from enum 1")).toBeTruthy();
});
it("keeps identity, nullability and default controls consistent", () => {
  mount();
  const identity = screen.getByLabelText(
    "Column 1 identity",
  ) as HTMLInputElement;
  const action = screen.getByLabelText(
    "Column 1 default action",
  ) as HTMLSelectElement;
  expect(identity.checked).toBe(true);
  expect(action.disabled).toBe(true);
  fireEvent.click(identity);
  expect(action.disabled).toBe(false);
  fireEvent.change(action, { target: { value: "literal" } });
  const literal = screen.getByLabelText(
    "Column 1 default literal",
  ) as HTMLInputElement;
  fireEvent.change(literal, { target: { value: "42" } });
  fireEvent.click(identity);
  expect(action.value).toBe("drop");
  expect(screen.queryByLabelText("Column 1 default literal")).toBeNull();
  expect(
    (screen.getByLabelText("Column 1 nullable") as HTMLInputElement).checked,
  ).toBe(false);
  fireEvent.change(screen.getByLabelText("Column 1 type"), {
    target: { value: "text" },
  });
  expect(identity.checked).toBe(false);
  expect(identity.disabled).toBe(true);
});
it("stages edits and requires review before applying", async () => {
  const { apply, done } = mount();
  fireEvent.change(screen.getByLabelText("Table name"), {
    target: { value: "orders" },
  });
  fireEvent.keyDown(screen.getByLabelText("Table name"), { key: "Enter" });
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review SQL" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(apply).toHaveBeenCalledOnce();
});
it("invalidates SQL review when the draft changes", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Review SQL" }));
  await screen.findByRole("button", { name: "Apply changes" });
  fireEvent.change(screen.getByLabelText("Table name"), {
    target: { value: "changed" },
  });
  expect(screen.queryByRole("button", { name: "Apply changes" })).toBeNull();
});
it("requires the exact qualified name for destructive changes", async () => {
  const { apply } = mount({ existing: true });
  fireEvent.click(await screen.findByRole("button", { name: "Review SQL" }));
  const button = (await screen.findByRole("button", {
    name: "Apply changes",
  })) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Confirm table name"), {
    target: { value: "public.orders" },
  });
  fireEvent.click(button);
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
});
it("blocks schema writes while other work is pending", async () => {
  const { apply } = mount({ blocked: true });
  fireEvent.click(screen.getByRole("button", { name: "Review SQL" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(apply).not.toHaveBeenCalled();
});
it("locks retries on unknown commit outcome and retains the draft", async () => {
  const { apply, done } = mount({ unknown: true });
  fireEvent.change(screen.getByLabelText("Table name"), {
    target: { value: "orders" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review SQL" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
  await screen.findByText("Commit outcome unknown");
  expect(
    (screen.getByRole("button", { name: "Apply changes" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect((screen.getByLabelText("Table name") as HTMLInputElement).value).toBe(
    "orders",
  );
  expect(apply).toHaveBeenCalledOnce();
  expect(done).not.toHaveBeenCalled();
});
it("disables editing on a read-only connection", () => {
  mount({ readOnly: true });
  expect(
    (screen.getByRole("button", { name: "Review SQL" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("uses one editor per table and preserves tabs opened while DDL was running", () => {
  const hook = renderHook(() => useWorkspaceTabs("schema-tab-test"));
  act(() =>
    hook.result.current.openTable({
      schema: "public",
      name: "orders",
      objectType: "table",
      estimatedRows: 0,
    }),
  );
  act(() => hook.result.current.openSchema("public", "orders"));
  const editorId = hook.result.current.activeTabId;
  act(() => hook.result.current.openSchema("public", "orders"));
  expect(
    hook.result.current.tabs.filter((tab) => tab.kind === "schema"),
  ).toHaveLength(1);
  const applyFinished = hook.result.current.schemaApplied;
  act(() =>
    hook.result.current.addQueryTab("select 'keep me'", "New during apply"),
  );
  act(() => applyFinished(editorId, "public", "orders", "purchases", false));
  expect(
    hook.result.current.tabs.some(
      (tab) => tab.kind === "query" && tab.sql === "select 'keep me'",
    ),
  ).toBe(true);
  expect(
    hook.result.current.tabs.some(
      (tab) => tab.kind === "table" && tab.table === "orders",
    ),
  ).toBe(false);
  expect(hook.result.current.activeTab).toMatchObject({
    kind: "table",
    table: "purchases",
  });
});
