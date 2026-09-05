# Opaline macOS testing guide

Status: pre-beta stabilization. No public beta has been published yet.
CI installers are **unsigned test artifacts**, not notarized releases.
Apple Silicon and Intel have separate build jobs; this is not proof of clean-machine
acceptance or compatibility with every macOS version. Minimum macOS is not declared yet.

## Installation and updates

Use only a build identified by the maintainer with its exact commit, architecture
and checksum. Choose Apple Silicon for an Apple chip, Intel for an Intel processor.
Do not mix architectures or assume Rosetta is required. The final release will
include its installation requirements; do not disable Gatekeeper or system security
to test an unverified package. No PostgreSQL, Docker, Node or Rust installation is
needed by the packaged app: PostgreSQL client tools are included.

There is currently no in-app updater. Before replacing a test build, finish or
discard table changes, save important SQL to files and export connection profiles.
Profile export does not include passwords, CA files, query libraries or history.
Quit the app normally, then replace the application without deleting its data.
Configuration, library and history should remain, but update/rollback acceptance
is still an open release gate. Keep a local backup of the app data and CA files;
these may contain sensitive SQL. Never upload them to an issue. Do not downgrade
across configuration formats without maintainer guidance.

## First connection

1. Create a workspace for your product.
2. Add a PostgreSQL profile, choose Local/Staging/Production and access mode.
3. Test the connection, then save. Optional remembered passwords go to Keychain.
4. Connect. For remote servers choose verified required TLS and the correct CA.
5. Open a table from the explorer, or run a harmless query with Cmd+Enter.

The connection name above the explorer switches profiles within the workspace.
Each session has its own tabs and drafts. Opening a connection or restoring a tab
does not execute SQL. First testing should use disposable local/staging data and
a role with only the required privileges, not real production data.

## Editing and SQL

- Double-click/F2 edits a table cell. Enter stages locally; Escape cancels that edit.
- Save changes/Cmd+S writes the active table's pending changes together.
- Right-click/Shift+F10 offers Copy, Inspect, Duplicate row and staged deletion.
  Duplication resets primary keys; inspect other UNIQUE fields before saving.
- SQL runs default to **Atomic**: commit on success, rollback on error.
- **Autocommit** in the SQL toolbar needs confirmation for that tab. It runs one
  statement and saves immediately, allowing VACUUM/CREATE DATABASE. Select one
  statement if the editor contains a script. Manual BEGIN/COMMIT are unsupported.
  New/reopened tabs and reconnect/restart return to Atomic.
- If a write response or COMMIT is lost, inspect the database before retrying.
  Opaline never retries writes automatically. Table drafts survive tab switches,
  but are memory-only and do not survive crashes or Force Quit. Normal window
  close, Cmd+Q and Quit from the application menu/Dock must offer protection for
  pending changes; Force Quit and system termination cannot be intercepted.
- SQL files are at most 1 MiB UTF-8. Cmd+O opens; Cmd+S saves; Cmd+Shift+S saves as.
  Format is undoable and does not execute SQL.

## Backup and restore

Backup / Restore → Create backup → choose a file. The matching bundled client is
automatic. The active password is reused; Advanced overrides are optional.

For restore, select the current database or **Create a new database on this server**.
Inspect a trusted dump, type the exact target name and acknowledge the relevant
warnings. Creating a database requires CREATEDB privileges, a new name of at most
63 UTF-8 bytes and separate consent. Existing names are refused, never reused.
Creation is outside the restore transaction: after failure the new database is
kept for inspection, not dropped. The original profile is unchanged; add a profile
for the new database after success.

Only same-major PostgreSQL 14–18 operations are supported. Custom archives are
limited to 100 GiB, plain UTF-8 SQL to 64 MiB; these limits are not promises of
tested performance at maximum size. Partial dumps can omit dependencies; cluster
roles/tablespaces are not included. Required extensions and roles must be available.
Dump code is trusted code, not sandboxed. Cancellation is not proof of rollback.

## Suggested pilot tasks

1. Create two profiles in one workspace and switch while keeping different SQL drafts.
2. Modify, duplicate and delete synthetic rows; inspect pending changes, save and verify.
3. Cause a UNIQUE conflict from another client, then confirm the draft survives.
4. Back up a disposable database and restore into a new database; compare rows and structure.
5. Run VACUUM with explicit autocommit, then reconnect and check Atomic is the default.
6. Resize to 760 × 560, enlarge the font, and complete tasks using the keyboard.
7. Restart with saved SQL and verify recovery. With pending table changes, test
   the close button, Cmd+Q, application-menu Quit and Dock Quit separately:
   Keep working retains the draft; Discard exits without writing; Save and continue
   exits only after a confirmed save. Repeat Quit while the dialog is open and
   test a failed save. Use only synthetic records for these checks.

## Report a problem

Use **Help → Report a bug** or [GitHub Issues](https://github.com/Kasperekx/opaline/issues/new/choose).
Include app version, artifact commit, macOS version, architecture, PostgreSQL major,
steps, expected outcome and actual outcome. Safe diagnostics are copied only when
you request them; review before submitting. Redact screenshots and use synthetic data.
For suspected vulnerabilities follow [SECURITY.md](../SECURITY.md), not public Issues.

## Remaining release gates

See [beta readiness](beta-readiness.md). Signing/notarization, exact minimum macOS,
clean-machine installation/update, extended failure/performance/accessibility checks,
private security reporting and owner-approved pilot/release are still required.
Windows, Linux, SSH, Kafka and Docker-log integrations are outside the first beta.
