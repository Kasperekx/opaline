# Opaline

Opaline is a calm, open-source PostgreSQL workspace built with Tauri 2, Rust,
React, and TypeScript. The project is currently an early alpha.

The working name is provisional. The product direction is not: a fast,
local-first database client with a precise interface and no required account.

## What works

- product workspaces with multiple saved PostgreSQL profiles
- create, edit, duplicate and test connections before saving
- multiple active connections with isolated queries, cancellation and results
- local, staging and production labels; explicit warning before production writes
- optional connection-level read-only enforcement in Rust and PostgreSQL
- verified TLS with system trust or a custom PEM CA and hostname verification
- optional passwords in macOS Keychain, Windows Credential Manager or Linux Secret Service
- schema, table, view, and column discovery
- SQL editing with PostgreSQL syntax highlighting
- session-scoped schema/table/column autocomplete and undoable, AST-checked SQL formatting
- native SQL file Open / Save / Save as with external-change detection
- per-workspace saved query library and searchable command palette
- execution of selected SQL or the full editor with `Cmd/Ctrl+Enter`
- multi-statement query execution
- cancellable queries with a configurable timeout
- streamed query execution with configurable, bounded result retention
- multiple result-set navigation for multi-statement queries
- multiple renamable query tabs with local session restore
- dedicated table tabs opened directly from the database explorer
- restored table tabs, filters, sorting and last selected workspace
- rectangular cell selection, escaped TSV / lossless JSON copy, column resizing and full-value inspection
- profile moves, guarded workspace removal and credential-free profile import/export
- PostgreSQL custom/plain SQL backups and guarded restore to an existing database
- a read-only Structure inspector with columns, defaults, identity options,
  generated expressions, comments, and enum values
- index definitions including expressions, included columns, partial predicates,
  uniqueness, and validity
- incoming and outgoing foreign keys with column mappings, referential actions,
  and navigation to related tables
- constraint definitions with validation and deferral status
- syntax-highlighted structure DDL with clipboard copy and opening in a SQL tab
- paginated table browsing with per-column sorting and all-column filtering
- double-click / F2 cell editing with type-aware controls for booleans, numbers,
  dates, times, JSON, UUIDs, and PostgreSQL enums
- local cell drafts, review of original/current/pending values, and visible unsaved changes
- row creation with PostgreSQL defaults, identity columns, and `NULL` handling
- contextual copy/inspect actions and row duplication into the local change buffer
- multi-row selection that can be carried across table pages
- one atomic save for mixed inserts, updates and deletions (up to 500 changed rows)
- staged deletion with confirmation, contextual Cmd/Ctrl+S, and Save/Discard/Keep working guards
- CSV and JSON export of the current page or selected rows through a native save dialog
- streamed CSV and JSON export of every row matching the active filter and sort,
  with live progress and cancellation
- optimistic concurrency checks that prevent silent overwrites of changed rows
- automatic read-only mode for views, foreign tables, and tables without a primary key
- local query history with duration, row count, and execution status
- structured PostgreSQL errors with SQLSTATE, detail, hint, and cursor position
- resizable explorer and editor/result panels with keyboard-accessible handles
- font-size and interface-density preferences
- movable, resizable, minimizable, and maximizable desktop window
- macOS, Windows, and Linux project configuration through Tauri 2

## Editing table data

Double-click a cell or press F2. Enter stages the value **locally**; it does not
write to PostgreSQL. Use **Save changes** or **Cmd/Ctrl+S** to save the active
table's entire change set in one transaction. Escape restores the value from
before the current edit; Tab moves between editable cells. In a multiline/JSON
editor, Enter adds a line and Apply or Cmd/Ctrl+Enter stages the value.

Right-click a cell (or press Shift+F10) for Copy, Copy as JSON, Inspect value,
Duplicate row, and staged deletion. Cmd/Ctrl+C copies the selected cells; opening
the menu inside an existing selection preserves that range. These table actions
do not occupy a permanent toolbar.

**Duplicate row** creates an unsaved row from the displayed values, including
local edits. Identity/generated fields and primary keys with defaults are left
to PostgreSQL. Manually assigned primary keys start empty and require a new
value. Other unique fields, such as an email address, are copied and must be
reviewed before saving. Duplication never writes to the database by itself.

Pending values stay in memory when switching tabs/connections. They are not
recovered after a process crash. Review shows original/pending values and offers
a read-only comparison with the current row. Conflicts retain the draft; an
unknown commit outcome disables retries until you verify the database.

See [the editing plan](docs/inline-table-editing-plan.md) and
[verification results](docs/inline-table-editing-verification.md), plus the
[context-menu and duplication checks](docs/table-context-actions-verification.md).

## Before beta

The [beta readiness checklist](docs/beta-readiness.md) is the current remaining
work list, with ordered acceptance gates, scope decisions, and space for product
feedback. Implemented features are not a substitute for release-package testing.

## Stack

- **Desktop shell:** Tauri 2
- **Database core:** Rust, `tokio-postgres`, Rustls, platform certificate verifier
- **Interface:** React 19, TypeScript, Vite, CodeMirror 6
- **Icons:** Lucide

The frontend invokes session-scoped Rust commands. Local profile JSON never
contains passwords; optional saved passwords belong to the OS credential store.
Stored passwords are resolved in Rust and never returned to the frontend.
There is no Opaline server, user account, or telemetry.

The code is organized by responsibility: frontend features live under
`src/features`, shared UI and the typed command boundary under `src/shared`,
while Rust separates Tauri commands, session state, database models, and the
PostgreSQL adapter. This keeps the application shell small and gives future
database providers a clear integration boundary.

## Development

Prerequisites are the standard [Tauri 2 platform dependencies](https://v2.tauri.app/start/prerequisites/),
Node.js 22.13+ (or 24+), and Rustup. The repository pins Rust 1.88 through
`rust-toolchain.toml`.
Building the desktop app also needs the client-build dependencies listed in
[bundled PostgreSQL clients](docs/bundled-postgres.md). These are developer/CI
requirements, not end-user requirements. Tauri's dev/build hooks prepare the
clients automatically; subsequent builds reuse a verified local cache.

```bash
npm install
npm run tauri dev
```

Useful checks:

```bash
npm test
npm run build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

PostgreSQL integration tests run when `OPALINE_TEST_POSTGRES_PORT` is set. Use a
disposable server on `127.0.0.1` with database/user `postgres` and password
`opaline_test`, then run the existing database suite with
`OPALINE_TEST_POSTGRES_PORT=55432 cargo test` from `src-tauri`.
The additional session suite is opt-in:
`OPALINE_TEST_POSTGRES_PORT=55432 cargo test session_tests -- --ignored --test-threads=1`.
Without that variable, the existing database integration tests are skipped.
For the self-contained backup/TLS/session matrix on five disposable server versions,
run `npm run desktop:prepare` followed by `node scripts/test-bundled-postgres.mjs`
(Docker required only for these development tests). See
[bundled PostgreSQL clients](docs/bundled-postgres.md).
The structure test recreates its generated DDL and compares the resulting
metadata; its test schemas are rolled back after the checks.

## Workspaces and connections

Choose **Connections → New workspace**, name a product (for example MMO), then
**New connection**. Choose its environment and access mode, enter the endpoint,
click **Test connection**, then **Save profile**. Changing settings invalidates
the test; Rust tests again before persisting the profile.

**Connect** opens a session; the top strip switches between sessions without
discarding open tabs or drafts. One active session is allowed per saved profile.
Use **Duplicate** for another independently configured profile (credentials are
not copied). Disconnect a profile before editing or deleting it.

Production uses read/write access by default, but opening it requires an explicit
warning acknowledgment. Choose **Read-only** for a protected session. Environment
and access are immutable during a session; reconnect after changing the profile.

Profiles and workspace names live in `connections.json` under Tauri's application
configuration directory. Atomic replacement protects the previous configuration
when a write fails. Vault cleanup failures remain tracked and visible so they
can be retried. Linux secure storage requires an unlocked Secret Service desktop
keyring. There is no fallback to plaintext if secure storage is unavailable.

SQL drafts/history are stored locally per profile. Earlier unscoped queries are
still available under **History → Queries from the earlier app version**; opening
them creates a copy and never executes it. SQL text itself can contain sensitive
data, so avoid embedding passwords or other secrets in saved queries.

The query library is scoped to a workspace and is also stored locally without
encryption. Opening a library entry creates a tab in the explicitly named session;
it never runs SQL. SQL file tabs become local drafts after restart: native file
access is not silently restored. File Open / Save is limited to 1 MiB UTF-8 SQL.
If a file changed externally, Save stops; review the other version or use Save as.

Move a disconnected profile from its details panel. Its identity, drafts, history
and saved credential remain attached to it. Removing a workspace requires moving
its profiles and query library to another workspace, and disconnecting its sessions.
It never cascades into profile deletion. Profile import/export is under the
connection list: imports always create new identities and resolve name collisions
with a visible suffix. Passwords, vault references and local CA paths are excluded.
A profile that used its own CA must be configured with a new CA before connecting.

## Backup / Restore

Open **Backup / Restore** in the active workspace toolbar. The target connection,
environment and database remain explicit. Click **Create backup**, choose a file,
and Opaline selects the matching, integrity-checked bundled client automatically.
PostgreSQL 14–18 are included (14.24 / 15.19 / 16.15 / 17.11 / 18.6); there is no
runtime tool download, PATH search, installation or administrator prompt.
The active connection password is reused in Rust, even when not saved to the OS
vault. Advanced settings offer an optional password override and trusted custom
tools; neither is needed for the normal workflow. Engines stay scoped to sessions.
Dump/restore remain same-major operations, not a cross-version migration wizard.

Backups support custom archives and plain SQL, the whole database or selected
schemas/tables, and structure/data/both. Partial dumps may lack dependencies.
Cluster roles/tablespaces are not included. A native Save dialog approves the
destination; a private sibling file is published only after success.

Restore accepts a trusted custom archive or UTF-8 SQL script into an **existing**
database. Automatic database creation is not implemented. Inspection makes a
private snapshot (extra disk space needed), shows its inventory or SQL beginning,
and binds it to the selected session. The preview is not a security audit.
Read-only sessions cannot restore. Non-empty targets, dropping archive objects
and production each require explicit, independent consent, plus the target name.
Custom restore defaults to skipping original ownership and grants.

Custom restore uses one transaction and stops on error. SQL restore uses patched
psql restricted mode and stops on error; a trusted script can still contain
transaction commands or invoke server-side code with external effects. Cancellation
is not proof of rollback. Reconnect affected sessions and inspect the target before
retrying; queries and writes are never replayed automatically.

Maintenance excludes concurrent local queries/edits, not other applications.
Encrypted sessions use hostname-verified TLS and the profile CA (client system
trust may differ from the desktop app), without plaintext fallback. Passwords go
through a private temporary password file, never command arguments or logs.
Session passwords are retained only in Rust memory and zeroized when their session
is dropped. TLS roots are exported to a private temporary PEM for compatible
hostname-verified TLS with every bundled client version.
Limits and remaining verification: [P1 report](docs/p1-verification.md).

The [design and implementation plan](docs/connection-workspaces.md) describes
the workspace/profile/session boundaries. `tests/preview.html` is a development-only
UI fixture with synthetic data, not a database connection or a production entry.

## Structure inspector

Open a table and choose **Structure**. Switching between Data and Structure
preserves the current data page, selection, and row draft within that table tab.
The inspector loads metadata on first use; **Refresh** retrieves changes made
elsewhere. Inspecting or copying a definition never executes its DDL.

DDL previews cover regular tables, partitioned parent tables, views, and
materialized views. They include columns, constraints, indexes, and table/column
comments. PostgreSQL's own [catalog definition functions](https://www.postgresql.org/docs/current/functions-info.html#FUNCTIONS-INFO-CATALOG-TABLE)
provide expressions and object definitions. Referenced schemas, types,
sequences, and tables must already exist. Materialized views are created with
`WITH NO DATA`.

This is a structure preview, not a full backup: ownership, grants, triggers,
policies, and storage placement are not included. Foreign tables, individual
partitions, and inherited tables expose their metadata but do not yet generate
CREATE DDL. Use `pg_dump` when a complete schema export is required.

## Security notes

Opaline executes SQL using the privileges of the connected PostgreSQL user.
Use a least-privileged database role when connecting to important data.
Read-only sessions reject mutation commands and session/transaction-control SQL;
supported read queries execute in a PostgreSQL READ ONLY transaction that is
always rolled back. Unsupported parser syntax fails closed. This is an accidental
write safeguard, not a sandbox for privileged functions/extensions with external
effects. Database roles are the actual security boundary.

The desktop webview uses an explicit Content Security Policy and only exposes
the scoped capabilities needed for window controls and native file dialogs/exports.

Exports begin only after the user chooses a destination in the native save
dialog. Full-table exports are streamed by Rust into a temporary sibling file,
then safely published at the selected path. Cancelling or failing an export
removes its incomplete file.

TLS `prefer` can fall back to an unencrypted connection. Use `require` for
remote databases. Encrypted connections verify the certificate and hostname
against system trust or the selected custom CA. Custom CA mode requires TLS and
never changes the OS trust store. `disable` is intended for trusted local development.

## Near-term roadmap

The ordered [alpha-to-beta plan](docs/beta-plan.md) is the source of truth for
upcoming work and acceptance criteria:

1. Protect unsaved work, complete workspace navigation, and harden session/transaction handling.
2. Verify data correctness, security, performance, and desktop accessibility.
3. Stabilize the implemented SQL/data workflows and PostgreSQL dump/restore (P1).
4. Validate native platforms, prepare release installers, and run a beta pilot.

SSH tunnels and advanced database tooling remain post-beta unless explicitly
promoted into the release scope. Existing verification results are documented
separately and are not a guarantee of readiness on untested platforms.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before proposing a large change.

## License

MIT © 2026 Opaline contributors
