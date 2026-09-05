# Opaline

Opaline is a calm, open-source PostgreSQL workspace built with Tauri 2, Rust,
React, and TypeScript. The project is currently an early alpha.

The working name is provisional. The product direction is not: a fast,
local-first database client with a precise interface and no required account.

## What works

- PostgreSQL connections over plain TCP or verified TLS
- in-memory credentials for the active session
- schema, table, view, and column discovery
- SQL editing with PostgreSQL syntax highlighting
- execution of selected SQL or the full editor with `Cmd/Ctrl+Enter`
- multi-statement query execution
- cancellable queries with a configurable timeout
- streamed query execution with configurable, bounded result retention
- multiple result-set navigation for multi-statement queries
- multiple renamable query tabs with local session restore
- dedicated table tabs opened directly from the database explorer
- a read-only Structure inspector with columns, defaults, identity options,
  generated expressions, comments, and enum values
- index definitions including expressions, included columns, partial predicates,
  uniqueness, and validity
- incoming and outgoing foreign keys with column mappings, referential actions,
  and navigation to related tables
- constraint definitions with validation and deferral status
- syntax-highlighted structure DDL with clipboard copy and opening in a SQL tab
- paginated table browsing with per-column sorting and all-column filtering
- guarded inline row editing with type-aware controls for booleans, numbers,
  dates, times, JSON, UUIDs, and PostgreSQL enums
- safe single-row editing and deletion for tables with a primary key
- row creation with PostgreSQL defaults, identity columns, and `NULL` handling
- multi-row selection that can be carried across table pages
- atomic bulk update and deletion of up to 500 selected rows
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

## Stack

- **Desktop shell:** Tauri 2
- **Database core:** Rust, `tokio-postgres`, Rustls, platform certificate verifier
- **Interface:** React 19, TypeScript, Vite, CodeMirror 6
- **Icons:** Lucide

The frontend invokes a deliberately small set of Rust commands. PostgreSQL
credentials stay in Rust memory for the lifetime of the connection and are not
written to disk. There is no Opaline server, user account, or telemetry.

The code is organized by responsibility: frontend features live under
`src/features`, shared UI and the typed command boundary under `src/shared`,
while Rust separates Tauri commands, session state, database models, and the
PostgreSQL adapter. This keeps the application shell small and gives future
database providers a clear integration boundary.

## Development

Prerequisites are the standard [Tauri 2 platform dependencies](https://v2.tauri.app/start/prerequisites/),
Node.js 20+, and Rustup. The repository pins Rust 1.88 through
`rust-toolchain.toml`.

```bash
npm install
npm run tauri dev
```

Useful checks:

```bash
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test
```

PostgreSQL integration tests run when `OPALINE_TEST_POSTGRES_PORT` is set. Use a
disposable server on `127.0.0.1` with database/user `postgres` and password
`opaline_test`, then run `OPALINE_TEST_POSTGRES_PORT=55432 cargo test` from
`src-tauri`. Without that variable, database integration tests are skipped.
The structure test recreates its generated DDL and compares the resulting
metadata; its test schemas are rolled back after the checks.

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
Until transaction controls and read-only connection modes land, use a
least-privileged database role when connecting to important data.

The desktop webview uses an explicit Content Security Policy and only exposes
the Tauri window capabilities needed by the custom title bar.

Exports begin only after the user chooses a destination in the native save
dialog. Full-table exports are streamed by Rust into a temporary sibling file,
then safely published at the selected path. Cancelling or failing an export
removes its incomplete file.

TLS `prefer` and `require` modes validate the server using the operating
system's certificate verifier. `disable` is intended for trusted local
development only.

## Near-term roadmap

1. read-only connection safeguards and explicit transaction controls
2. encrypted connection profiles backed by the operating system keychain
3. saved queries, SQL autocomplete, and keyboard command palette
4. SSH tunnels and custom CA certificates
5. signed release builds for macOS, Windows, and Linux

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before proposing a large change.

## License

MIT © 2026 Opaline contributors
