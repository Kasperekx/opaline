import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { SchemaConstraints } from "../src/features/structure/SchemaConstraints";
import { ColumnDefault } from "../src/features/structure/ColumnDefault";
import { SessionProvider } from "../src/features/connections/SessionContext";
import { newProfile } from "../src/features/connections/connection-types";
import type { ColumnDraft, SchemaChange } from "../src/shared/types/structure";
import { diagramFixture } from "./diagram-fixture";

const column: ColumnDraft = {
  original: "id",
  name: "id",
  dataType: "bigint",
  nullable: false,
  primaryKey: true,
  defaultValue: null,
  identity: false,
  removed: false,
};
const base: SchemaChange = {
  schema: "public",
  table: "items",
  original: "items",
  expected: null,
  columns: [column],
  dropTable: false,
  constraints: [],
};
function mount(draft: SchemaChange = base) {
  mockIPC((command) => {
    if (command === "database_diagram") return diagramFixture;
    throw new Error("No database writes allowed");
  });
  const onChange = vi.fn();
  const editing = vi.fn();
  function Harness() {
    const [value, setValue] = useState(draft);
    return (
      <SessionProvider
        session={{
          ...newProfile("w"),
          id: "s",
          profileId: "p",
          serverVersion: "16",
        }}
      >
        <SchemaConstraints
          draft={value}
          onEditingChange={editing}
          onChange={(constraints) => {
            onChange(constraints);
            setValue({ ...value, constraints });
          }}
        />
      </SessionProvider>
    );
  }
  render(<Harness />);
  return { onChange, editing };
}
it("stages an ordered index locally and lets the user undo it", () => {
  const { onChange, editing } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Index" }));
  expect(editing).toHaveBeenLastCalledWith(true);
  fireEvent.change(screen.getByLabelText("Constraint name"), {
    target: { value: "items_idx" },
  });
  fireEvent.change(screen.getByLabelText("Source column 1"), {
    target: { value: "id" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Stage index" }));
  expect(onChange).toHaveBeenLastCalledWith([
    { kind: "createIndex", name: "items_idx", columns: ["id"], unique: false },
  ]);
  expect(editing).toHaveBeenLastCalledWith(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Undo change items_idx" }),
  );
  expect(onChange).toHaveBeenLastCalledWith([]);
});
it("stages FK replacement atomically and Undo restores both sides", async () => {
  const fk = diagramFixture.foreignKeys[0];
  const columns = fk.sourceColumns.map((name) => ({
    ...column,
    original: name,
    name,
  }));
  const draft: SchemaChange = {
    ...base,
    columns,
    expected: {
      relationOid: 1,
      schema: fk.sourceSchema,
      name: fk.sourceTable,
      objectType: "Table",
      owner: "postgres",
      comment: null,
      columns: [],
      indexes: [],
      constraints: [],
      foreignKeys: [{ ...fk, direction: "outgoing" }],
      ddl: null,
      ddlNotes: [],
    },
  };
  const { onChange } = mount(draft);
  fireEvent.click(
    screen.getByRole("button", { name: `Edit relationship ${fk.name}` }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Referenced table") as HTMLSelectElement).value,
    ).toBe(JSON.stringify([fk.targetSchema, fk.targetTable])),
  );
  fireEvent.change(screen.getByLabelText("On delete"), {
    target: { value: "CASCADE" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Stage relationship" }));
  expect(onChange.mock.lastCall?.[0]).toMatchObject([
    { kind: "dropForeignKey", name: fk.name },
    { kind: "addForeignKey", name: fk.name, onDelete: "CASCADE" },
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: `Undo change ${fk.name}` }),
  );
  expect(onChange).toHaveBeenLastCalledWith([]);
});
it("does not silently replace advanced FK semantics", () => {
  const fk = diagramFixture.foreignKeys[0];
  mount({
    ...base,
    expected: {
      schema: "public",
      name: "items",
      objectType: "Table",
      owner: "postgres",
      comment: null,
      columns: [],
      indexes: [],
      constraints: [],
      ddl: null,
      ddlNotes: [],
      foreignKeys: [{ ...fk, direction: "outgoing", validated: false }],
    },
  });
  expect(
    (
      screen.getByRole("button", {
        name: `Edit relationship ${fk.name}`,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("keeps an SQL default distinct from an empty-string literal", () => {
  const change = vi.fn();
  function Harness() {
    const [value, setValue] = useState<ColumnDraft>({
      ...column,
      defaultValue: "nextval('items_id_seq'::regclass)",
    });
    return (
      <ColumnDefault
        column={value}
        originalDefault="nextval('items_id_seq'::regclass)"
        index={0}
        disabled={false}
        onChange={(patch) => {
          change(patch);
          setValue({ ...value, ...patch });
        }}
      />
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Column 1 default action"), {
    target: { value: "literal" },
  });
  expect(change).toHaveBeenLastCalledWith({
    defaultMode: "literal",
    defaultValue: "",
  });
  fireEvent.change(screen.getByLabelText("Column 1 default action"), {
    target: { value: "keep" },
  });
  expect(change).toHaveBeenLastCalledWith({
    defaultMode: "keep",
    defaultValue: "nextval('items_id_seq'::regclass)",
  });
});
