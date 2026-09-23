# Table structure editor

Create a table from **Connection actions → New table…**, the explorer header, or
the diagram toolbar. Edit or drop an existing table from its explorer menu,
**Structure → Edit structure**, or the diagram's table details.

All entry points open the same document, one per table per connection. Creating
a table supports built-in types, nullable columns, composite primary keys,
integer identity columns and literal defaults. Existing ordinary tables support
table/column renames, adding/removing columns, type/nullability/default changes,
regular BTREE indexes and outgoing foreign keys. All changes are staged together.
Existing SQL defaults remain untouched unless explicitly replaced. Choose a literal
(including an empty string), no default, current timestamp or random UUID.
Type changes use PostgreSQL's assignment cast; unsupported conversions fail rather
than guessing a `USING` expression. Conversions can rewrite a table and require confirmation.
Index/FK edits stage a drop and replacement in the same transaction; Undo restores both.

## Review and apply

- Editing only changes a local draft. Enter never executes DDL.
- **Review SQL** asks Rust to generate the exact SQL. Changing the draft invalidates
  that review. **Apply changes** is a separate, explicit action.
- Destructive changes require the original qualified table name. Production shows
  an additional warning, but does not impose read-only mode.
- Resolve other pending work in this connection before applying a schema change.
  Successful changes refresh the explorer, completion metadata, diagram and table
  views; affected old table tabs are replaced/closed. SQL documents remain intact.
- Drafts are protected by the existing close/disconnect/exit guard. They are
  in-memory only: recovered editor tabs load a new snapshot, never replay DDL.

## Safety

The backend enforces read-only mode and uses the session's operation gate. SQL is
generated from typed operations with quoted identifiers, a bounded built-in type
list and escaped literal defaults, not arbitrary SQL fragments from the form.
Operations run in a transaction with a 5-second lock timeout and 25-second
statement timeout, inside a 30-second operation deadline.

For existing tables, the backend locks the relation, re-reads its metadata and
compares the original snapshot, including its OID. A stale draft is rejected.
Errors before commit roll back the batch; cancellation aborts the transport so a
transaction cannot leak into later work. Unknown commit outcomes disable retries
and require inspection. No automatic retries and no promise of undo after commit.

Drops use `RESTRICT`, not `CASCADE`. PostgreSQL still removes indexes and constraints
belonging to the dropped table/column, and owned sequences when dropping a table.
External dependencies can reject the operation. See the official
[DROP TABLE](https://www.postgresql.org/docs/current/sql-droptable.html) and
[ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) documentation.

## Explicit limits

- No visual editing of views, foreign tables, partitions or inherited tables.
- Use SQL for schema moves, existing primary-key/identity/generated-column changes,
  custom casts, arbitrary default expressions and advanced indexes (partial, expression,
  included columns, concurrent builds). New indexes use ordinary BTREE defaults.
- FK creation uses validated, immediate MATCH SIMPLE constraints. Deferrable,
  unvalidated and MATCH FULL/PARTIAL relationships require SQL for editing.
- At most 100 constraint operations and 32 ordered columns per index/relationship.
- At most 500 columns in this editor. Names are limited to 63 UTF-8 bytes.
- Column name swaps require separate reviewed changes. Other active connections
  are not auto-refreshed; their editor snapshots are checked when applied.

## Verification

`tests/schema-editor.test.tsx` covers staging, review invalidation, destructive
confirmation, pending-work protection, read-only UI and unknown-outcome handling.
The Rust integration check runs against a disposable PostgreSQL instance:

```sh
OPALINE_TEST_POSTGRES_PORT=<port> cargo test --manifest-path src-tauri/Cargo.toml schema_changes
```

It expects database/user `postgres`, password `opaline_test`, and creates/removes
a unique schema. Never run it on a production database. It checks create, rename,
add/drop column, drop table, snapshot conflicts, SQL escaping, rollback of a
partially executed batch and dependent-view protection. It also verifies type/default/
nullability changes and that a failed FK replacement restores removed indexes and FKs.

Verified 2026-09-23 against disposable PostgreSQL 16. The frontend suite additionally
covers constraint staging/undo, untouched SQL defaults and expanded cell editing.
Session and row-write integration checks cover cancellation, stale rows, rollback,
connection loss and unknown commit outcomes. Native macOS release acceptance remains open.
