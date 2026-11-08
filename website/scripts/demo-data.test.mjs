import assert from "node:assert/strict";
import { createDemoStore, demoProfiles, demoSession } from "../demo/data.ts";

const values = new Map([["unrelated", "keep"]]);
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const base = { schema: "public", table: "team_members" };
const sessionId = demoSession(demoProfiles[0]).id;
const load = (store, extra = {}, id = sessionId) =>
  store.invoke("load_table_page", {
    sessionId: id,
    input: {
      ...base,
      page: 0,
      pageSize: 25,
      filter: null,
      sort: null,
      ...extra,
    },
  });
const save = (store, changes, id = sessionId) =>
  store.invoke("apply_table_changes", {
    sessionId: id,
    input: { ...base, changes },
  });
const update = (row, value, id = "edit") => ({
  id,
  kind: "update",
  key: [{ column: "id", value: row.values[0] }],
  rowVersion: row.rowVersion,
  changes: [{ column: "name", value }],
});

const store = createDemoStore(storage);
const original = load(store).rows[0];
const draft = update(original, "Demo edit");
assert.equal(load(store).rows[0].values[1], "Alex Morgan");
save(store, [draft]);
assert.equal(load(createDemoStore(storage)).rows[0].values[1], "Demo edit");
assert.equal(load(store, { filter: "demo edit" }).rows.length, 1);
assert.equal(
  load(store, { sort: { column: "id", direction: "desc" } }).rows[0].values[0],
  "8",
);
assert.equal(
  load(store, {
    conditions: [{ column: "metadata", operator: "is_null", value: "" }],
  }).rows.length,
  1,
);
assert.equal(
  load(store, { conditions: [{ column: "id", operator: "gt", value: "6" }] })
    .rows.length,
  2,
);
assert.equal(
  load(store, {
    conditions: [{ column: "metadata", operator: "ne", value: "{}" }],
  }).rows.length,
  7,
);
assert.equal(
  load(store, { sort: { column: "metadata", direction: "asc" } }).rows.at(-1)
    .values[4],
  null,
);
assert.equal(
  load(store, { sort: { column: "metadata", direction: "desc" } }).rows[0]
    .values[4],
  null,
);
assert.equal(load(store, {}, demoProfiles[1].id).editable, false);
assert.equal(
  load(store, {}, demoProfiles[1].id).rows[0].values[1],
  "Alex Morgan",
);
assert.throws(() => save(store, [draft], demoProfiles[1].id), /read-only/);
assert.throws(() => save(store, [draft]), /changed or was removed/);
assert.throws(() => store.invoke("run_query", { sessionId }), /not available/);
assert.throws(() => load(store, {}, "other-session"), /Unknown/);
assert.throws(() => load(store, { schema: "private" }), /Only public/);
assert.throws(
  () =>
    load(store, {
      conditions: [{ column: "missing", operator: "eq", value: "" }],
    }),
  /column/,
);

const before = load(store);
assert.throws(
  () =>
    save(store, [
      update(before.rows[0], "Must roll back", "valid"),
      {
        ...update(before.rows[1], "Bad", "invalid"),
        changes: [{ column: "role", value: "admin" }],
      },
    ]),
  /Invalid value/,
);
assert.deepEqual(load(store), before);
assert.throws(
  () =>
    save(store, [
      {
        ...update(before.rows[0], "Bad"),
        changes: [{ column: "id", value: "99" }],
      },
    ]),
  /Identity/,
);
assert.throws(
  () =>
    save(store, [
      {
        ...update(before.rows[0], "Bad"),
        changes: [{ column: "metadata", value: "{" }],
      },
    ]),
  /Invalid value/,
);
assert.throws(
  () => save(store, [{ ...update(before.rows[0], "Bad"), key: [] }]),
  /primary key/,
);
assert.throws(
  () =>
    save(store, [
      update(before.rows[0], "One", "a"),
      update(before.rows[0], "Two", "b"),
    ]),
  /changed or was removed/,
);
assert.throws(
  () =>
    save(
      store,
      Array.from({ length: 50 }, (_, index) => ({
        id: `many-${index}`,
        kind: "insert",
        values: [{ column: "name", value: "Sample" }],
      })),
    ),
  /50 sample rows/,
);
assert.deepEqual(load(store), before);
const inserted = save(store, [
  {
    id: "insert",
    kind: "insert",
    values: [{ column: "name", value: "Sample member" }],
  },
]).rows[0].row;
assert.deepEqual(inserted.values, [
  "9",
  "Sample member",
  "viewer",
  "true",
  "{}",
]);
assert.deepEqual(
  store.invoke("load_table_row", {
    sessionId,
    input: { ...base, key: [{ column: "id", value: "9" }] },
  }).row,
  inserted,
);
save(store, [
  {
    id: "delete",
    kind: "delete",
    key: [{ column: "id", value: "9" }],
    rowVersion: inserted.rowVersion,
  },
]);
assert.equal(load(store).rows.length, 8);
assert.equal(
  save(store, [
    {
      id: "insert-again",
      kind: "insert",
      values: [{ column: "name", value: "Another sample" }],
    },
  ]).rows[0].row.values[0],
  "10",
);

const storedKey = [...values.keys()].find((key) =>
  key.startsWith("opaline.website-demo"),
);
const invalid = JSON.parse(values.get(storedKey));
invalid.rows[1].values[0] = invalid.rows[0].values[0];
values.set(storedKey, JSON.stringify(invalid));
assert.match(createDemoStore(storage).warning(), /could not be read/);
values.set(storedKey, "");
assert.match(createDemoStore(storage).warning(), /could not be read/);
values.set(storedKey, "{broken");
const corrupt = createDemoStore(storage);
assert.match(corrupt.warning(), /could not be read/);
save(corrupt, [update(load(corrupt).rows[0], "Memory only")]);
assert.equal(values.get(storedKey), "{broken");
corrupt.reset();
assert.equal(corrupt.warning(), null);
assert.equal(values.get("unrelated"), "keep");
assert.equal(load(corrupt).rows[0].values[1], "Alex Morgan");
save(corrupt, [update(load(corrupt).rows[0], "Saved after reset")]);
assert.equal(
  load(createDemoStore(storage)).rows[0].values[1],
  "Saved after reset",
);

const quota = createDemoStore({
  ...storage,
  setItem() {
    throw new Error("Quota");
  },
});
save(quota, [update(load(quota).rows[0], "In memory")]);
assert.match(quota.warning(), /memory only/);
assert.equal(load(quota).rows[0].values[1], "In memory");
const ephemeral = createDemoStore(null);
assert.match(ephemeral.warning(), /unavailable/);
save(ephemeral, [update(load(ephemeral).rows[0], "Private session")]);
assert.equal(load(ephemeral).rows[0].values[1], "Private session");

console.log(
  "Demo data: persistence, filtering, atomic edits, read-only boundaries and storage recovery passed.",
);
