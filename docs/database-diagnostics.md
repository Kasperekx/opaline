# Database diagnostics

## When a restored database opens in another client but not in Opaline

This does not, by itself, mean that the dump is damaged. Confirm that both clients
use the same database and role. A restore can change object names, types,
ownership or privileges; remembered table filters and sorting may also be stale.

1. Read the error shown above the table. App-generated database operations now
   include a SQLSTATE when PostgreSQL returns one, a readable explanation and a
   suggested next step. Permission, constraint, type, missing-object, lock,
   timeout and connection failures are distinguished.
2. If the table structure changed, use **Reset filters & sorting**. This clears
   the local search, column filters, sorting and page position; it does not alter
   the database. Unsaved edits still require a decision before resetting.
3. **Retry** retries the table read, never a failed write or restore. An unknown
   commit outcome requires checking the database before repeating a write.
4. Expand **Diagnostic context**, then **Copy diagnostic details**. The report
   includes the message, app/build version, PostgreSQL version, database/relation,
   page size and whether filters/sorting are active. Review object names before
   sharing it. Host credentials, SQL and filter/row values are not added to the
   context. No report is sent automatically.

### Confirmed compatibility fixes

- Tables with 100 or more columns could fail even with no active search because
  the generated `concat_ws` call exceeded PostgreSQL's function-argument limit.
  Browse and export now share a variadic-array search expression.
- Numeric sorting could resolve the text projection instead of the original
  column, yielding `1, 10, 2`. Browse and export now order by native source values.
- Covering primary-key `INCLUDE` columns were incorrectly treated as key columns.
  Only actual key attributes now participate in row identity and default sorting.

These are reproduced bugs, not a confirmed diagnosis of an inaccessible remote
installation. Native sorting follows PostgreSQL's type semantics: types without
an ordering operator can require clearing the sort or using an explicit SQL cast.

## Privacy and unknown errors

App-generated database diagnostics are classified using PostgreSQL's stable
[SQLSTATE codes](https://www.postgresql.org/docs/current/errcodes-appendix.html).
They retain server-supplied object identifiers but omit raw server messages,
DETAIL and CONTEXT, which may contain row values, SQL or trigger output. Unknown
codes remain visible with instructions to inspect server logs. The SQL editor's
existing server error display is separate and may contain the user's SQL/data;
review it before sharing.

Backup/restore uses fixed, allowlisted explanations from a bounded stderr tail.
Missing roles/extensions, existing objects, archive incompatibility, permissions,
authentication/TLS, network and storage failures have different guidance. Raw
tool output is never returned. Failure still leaves an uncertain/incomplete target
for inspection; Opaline does not automatically drop it or repeat the restore.

## Regression checks

Run against a **disposable** PostgreSQL instance, never a production server:

```sh
OPALINE_TEST_POSTGRES_PORT=<disposable-port> cargo test --locked --manifest-path src-tauri/Cargo.toml --lib database::table_data
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib backup::diagnostics
npx vitest run tests/error-message.test.ts tests/inline-table.test.tsx tests/work-safety.test.tsx
```

The table-data tests cover a 129-column table, blank/active/literal searches,
CSV/JSON export, native sorting and pagination, covering keys, custom types and
actual PostgreSQL errors without row-value disclosure. They skip live database
checks when the environment variable is unset. The regular CI PostgreSQL job
provides it. `tests/preview.html?scenario=inline-load-error` is a synthetic visual
fixture for permission failures; it does not connect to a database.
