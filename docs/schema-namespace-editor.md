# Schema namespace editor

Create, rename, and drop PostgreSQL schemas (namespaces) from the explorer.

## Entry points

- Explorer header **New schema** (folder-plus)
- Schema folder menu → **Rename schema…** / **Delete schema…**
- Schema folder menu → **New table…** opens the table structure editor in that schema

Empty schemas appear in the explorer (via `list_schemas`), labeled **empty**.

## Review and apply

Editing only changes a local draft in the dialog. **Review SQL** asks Rust to
generate the exact statement. **Back** returns to the draft and invalidates that
review and any typed confirmation. **Create schema**, **Rename schema** or
**Delete schema** is a separate action; reviewing never applies the statement.

All three operations use the shared native dialog shell, graphite/amber tokens,
visible database/environment context, a scrollable body and a fixed action footer.
Rename starts with the current name selected; an unchanged name cannot be submitted.
See the [application design guidelines](design-system.md).

| Action         | SQL                                  |
| -------------- | ------------------------------------ |
| Create         | `CREATE SCHEMA "name"`               |
| Rename         | `ALTER SCHEMA "old" RENAME TO "new"` |
| Drop (default) | `DROP SCHEMA "name" RESTRICT`        |
| Drop (opt-in)  | `DROP SCHEMA "name" CASCADE`         |

## Safety

- Names: 1–63 UTF-8 bytes; system schemas (`pg_*`, `information_schema`) are blocked
- Drops are always destructive: type the exact schema name to enable **Delete schema**
- **Only if empty** is the default; **Include contained objects** opts into CASCADE
- CASCADE also requires acknowledgement that contained objects and dependencies may be deleted, including dependencies in other schemas
- `public` may be renamed or dropped with an extra warning (not a hard ban)
- Resolve other pending work in the connection before applying
- Busy operations block repeat submission and dismissal; unknown outcomes block retry and retain a work-risk warning while the dialog remains open
- Transaction timeouts match the table structure editor (5s lock / 25s statement / 30s operation)
- Successful changes refresh the explorer, completion metadata and diagram; rename remaps open tabs; drop closes object tabs in that schema

## Explicit limits

- No owner or ACL editing
- No moving tables between schemas (`ALTER TABLE … SET SCHEMA`) — use SQL
- No dependency preview before CASCADE; Postgres errors for RESTRICT are shown as-is

## Verification

```sh
cargo test --manifest-path src-tauri/Cargo.toml namespace_changes::tests --lib
```

Frontend: `tests/namespace-dialog.test.tsx` covers creation, rename, review
invalidation, exact typed confirmation, CASCADE gates, errors, unknown outcomes,
read-only/offline states, repeated submits and native dialog dismissal/focus.
The synthetic browser preview mocks namespace SQL and rejects every apply request;
visual QA never changes a database.
