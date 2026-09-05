import { expect, it } from "vitest";
import {
  buildChanges,
  changeError,
  changeSetSummary,
  existingRowChange,
  duplicateRowChange,
  newRowChange,
  rowErrors,
} from "../src/features/table/table-change-set";
import { tableChangePage as page } from "./table-change-fixture";

it("builds one update per row using the original key and version, even when the key changes", () => {
  const row = existingRowChange(page.columns, page.rows[0]);
  row.values[0] = "3";
  row.values[1] = "Edited";
  expect(buildChanges(page.columns, [row])).toEqual([
    {
      kind: "update",
      id: row.id,
      key: [{ column: "id", value: "1" }],
      rowVersion: "10",
      changes: [
        { column: "id", value: "3" },
        { column: "name", value: "Edited" },
      ],
    },
  ]);
});
it("excludes no-op rows, distinguishes NULL and empty text, and does not parse large numbers", () => {
  const row = existingRowChange(page.columns, page.rows[0]);
  expect(buildChanges(page.columns, [row])).toEqual([]);
  row.values[2] = "";
  row.values[5] = "90071992547409931234";
  expect(buildChanges(page.columns, [row])[0]).toMatchObject({
    changes: [
      { column: "note", value: "" },
      { column: "counter", value: "90071992547409931234" },
    ],
  });
  row.values[2] = null;
  row.values[5] = page.rows[0].values[5];
  expect(changeSetSummary(page.columns, [row]).rows).toHaveLength(0);
});
it("new rows omit DEFAULT and managed columns but preserve explicit NULL", () => {
  const row = newRowChange(page.columns);
  row.values[0] = "3";
  row.values[1] = "New";
  row.values[2] = null;
  expect(buildChanges(page.columns, [row])[0]).toMatchObject({
    kind: "insert",
    values: [
      { column: "id", value: "3" },
      { column: "name", value: "New" },
      { column: "note", value: null },
      { column: "enabled", value: "false" },
      { column: "counter", value: null },
    ],
  });
});
it("deletions suppress pending updates and validation without destroying the draft", () => {
  const row = existingRowChange(page.columns, page.rows[0]);
  row.values[0] = "not an integer";
  row.deleted = true;
  expect(buildChanges(page.columns, [row])[0]).toMatchObject({
    kind: "delete",
    key: [{ column: "id", value: "1" }],
  });
  expect(rowErrors(page.columns, row).every((error) => !error)).toBe(true);
  row.deleted = false;
  expect(() => buildChanges(page.columns, [row])).toThrow("highlighted");
});
it("validates JSON without losing its numeric precision", () => {
  const row = existingRowChange(page.columns, page.rows[0]);
  row.values[4] = '{"n":900719925474099312345}';
  expect(buildChanges(page.columns, [row])[0]).toMatchObject({
    changes: [{ column: "payload", value: '{"n":900719925474099312345}' }],
  });
  row.values[4] = "{";
  expect(() => buildChanges(page.columns, [row])).toThrow();
});
it("treats unstructured transport errors as unknown rather than inviting a duplicate write", () => {
  expect(changeError(new Error("IPC closed")).kind).toBe("unknown");
  expect(
    changeError({ kind: "rejected", message: "Not saved", rowId: "a" }),
  ).toEqual({ kind: "rejected", message: "Not saved", rowId: "a" });
});

it("duplicates editable values losslessly without sharing row identity or source arrays", () => {
  const values = [...page.rows[0].values];
  values[1] = "Staged name";
  values[2] = "";
  const first = duplicateRowChange(page.columns, values);
  const second = duplicateRowChange(page.columns, values);
  expect(first.original).toBeNull();
  expect(first.id).not.toBe(second.id);
  expect(first.values).toEqual([
    "",
    "Staged name",
    "",
    "true",
    '{"id":9007199254740993}',
    "9007199254740993",
  ]);
  expect(rowErrors(page.columns, first)[0]).toContain("primary key");
  first.values[0] = "3";
  expect(buildChanges(page.columns, [first])[0].kind).toBe("insert");
  first.values[1] = "Changed copy";
  expect(values[1]).toBe("Staged name");
});
it("resets generated fields and defaulted primary keys while keeping ordinary defaults' displayed values", () => {
  const columns = page.columns.map((column, i) => ({
    ...column,
    primaryKey: i === 0 || i === 5,
    identity: i === 0,
    generated: i === 4,
    defaultValue: i === 5 ? "nextval('sequence')" : column.defaultValue,
  }));
  const copy = duplicateRowChange(columns, page.rows[0].values);
  expect(copy.values).toEqual([
    undefined,
    "Ada",
    null,
    "true",
    undefined,
    undefined,
  ]);
  expect(buildChanges(columns, [copy])[0]).toMatchObject({
    kind: "insert",
    values: [
      { column: "name", value: "Ada" },
      { column: "note", value: null },
      { column: "enabled", value: "true" },
    ],
  });
});
it("resets every component of a manual composite primary key", () => {
  const columns = page.columns.map((column, i) => ({
    ...column,
    primaryKey: i < 2,
  }));
  const copy = duplicateRowChange(columns, page.rows[0].values);
  expect(copy.values.slice(0, 2)).toEqual(["", ""]);
  expect(rowErrors(columns, copy).slice(0, 2).every(Boolean)).toBe(true);
});
it("does not silently pick the first enum or boolean for a duplicated manual key", () => {
  const columns = page.columns.map((column, i) => ({
    ...column,
    primaryKey: i === 1 || i === 3,
    enumValues: i === 1 ? ["Ada", "Grace"] : [],
  }));
  const copy = duplicateRowChange(columns, page.rows[0].values);
  expect(copy.values[1]).toBe("");
  expect(copy.values[3]).toBe("");
  expect(rowErrors(columns, copy).filter(Boolean)).toHaveLength(2);
});
