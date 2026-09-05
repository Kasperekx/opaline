# Feature guide

The detailed behavior behind Opaline's core workflows. For a quick overview and
local setup, start with the [README](../README.md). For the current release scope
and acceptance evidence, see [beta readiness](beta-readiness.md) and the
[stabilization report](beta-stabilization-verification.md).

Opaline is in pre-beta stabilization. These are implemented behaviors, not a
certification of the final release or untested platforms.

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

See [the editing plan](inline-table-editing-plan.md) and
[verification results](inline-table-editing-verification.md), plus the
[context-menu and duplication checks](table-context-actions-verification.md).

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

Restore accepts a trusted custom archive or UTF-8 SQL script into the current
database, or **Create a new database on this server**. Creating needs CREATEDB
permission, a fresh name of 1–63 UTF-8 bytes, typed target confirmation and separate
consent. Existing names are refused. Creation cannot be rolled back with restore;
if restore fails, the database is kept for inspection and is never automatically
dropped. The original profile stays unchanged; add a profile for the new database.
Inspection makes a
private snapshot (extra disk space needed), shows its inventory or SQL beginning,
and binds it to the selected session. The preview is not a security audit.
Read-only sessions cannot restore. Non-empty targets, dropping archive objects
and production each require explicit, independent consent, plus the target name.
Custom restore defaults to skipping original ownership and grants.

SQL runs default to Atomic. Explicitly enable Autocommit in a query tab for VACUUM
or CREATE DATABASE. Only one statement is allowed per run; select it if necessary.
Writes save immediately, without application rollback. New/reopened tabs and
reconnect/restart return to Atomic. Read-only sessions cannot enable autocommit;
manual BEGIN/COMMIT remain unsupported. Verify outcomes before retrying after errors.

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
Limits and remaining verification: [P1 report](p1-verification.md).

The [design and implementation plan](connection-workspaces.md) describes
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
