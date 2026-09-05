# Product workspaces and safe connections

## Product model

A workspace groups connections for a product, for example MMO. It is local
organization, with no account, billing, or remote team service.

```
MMO
  Local PostgreSQL       local       read/write
  QA                     staging     read-only
  Live                   production  read/write after warning
Analytics
  Warehouse              production  read/write after warning
```

A saved profile belongs to exactly one workspace. An active connection is a
separate runtime session, identified by an immutable session ID. Every database
command, cancellation, explorer, query tab, table tab, and export carries that
session ID. Switching the visible session never retargets an existing query.

## Desktop layout

- Session strip appears when at least one connection is active: manager, then profiles with
  workspace name, environment color/label, access mode, and disconnect action.
- Connection launcher: product workspaces in a narrow sidebar and a full-width
  searchable connection list. Rows show destination, environment, connection
  status and direct Connect/Open and Edit actions. No permanent inspector or
  duplicate manager heading. Select a row for details in a focused dialog.
- Visible empty states with Create workspace and Add connection actions; no fake
  saved connection on first launch.
- Workspace create/rename; profile create/edit/duplicate/delete. A duplicate gets
  a new identity and requires its own credential choice and connection test.
- Connection editor groups General, Environment/access, and TLS settings. Test
  connection is distinct from save; changing connection settings invalidates the
  test. Save validates again in Rust before persistence.
- At narrow widths, product selection becomes a compact picker and row actions
  reflow below connection information. Details and forms scroll vertically without
  shrinking typography; closing a dialog returns keyboard focus to its trigger.
- Active sessions remain mounted while switching, preserving unsaved row drafts,
  results, filters, and SQL tabs. Query history and restored SQL are profile-scoped.

## Profiles and credentials

Store versioned workspace/profile JSON in the application configuration directory.
The schema contains no password field. Use atomic file replacement and retain the
previous file if persistence fails.

The native credential store owns optional saved passwords: macOS Keychain,
Windows Credential Manager, Linux Secret Service. Keyring calls run outside the
async/UI threads. Never fall back to plaintext. When storage is unavailable, offer
session-only passwords and report the error. Never send a saved password back to
the frontend; Rust resolves it when testing or opening a saved profile.

Profiles can be saved with an empty password (for authentication setups that do
not need one). Session-only passwords are cleared from frontend state after use.
Saved credentials are bound to the connection target: changing host/database/user
requires re-entering the password so an existing secret is not sent to a new host.

## Safety and transport

Environments: local (teal), staging (amber), production (coral). Labels and icons
accompany colors. Production uses read/write by default, per the user's preference. Production write access
requires explicit confirmation when opening the session. Access mode is immutable
for that session; reconnect to change it.

Read-only is enforced in Rust and PostgreSQL, not just by hiding edit controls.
Reject mutation commands; execute accepted read queries inside READ ONLY
transactions. Disallow transaction/session-control SQL that could escape that
boundary. This protects normal database writes; database roles still define the
actual security boundary and access to functions/extensions.

Custom PEM CA certificates are supported with hostname verification and mandatory
TLS. Store only the CA path in the profile; never add the CA to the OS trust store.
Cancellation uses the same TLS trust configuration as the original session.

SSH tunnels are explicitly deferred. The connection model keeps transport separate
so tunnels can be added without changing workspace/profile identities.

## Implementation sequence

1. Build the workspace/profile store and native credential adapter.
2. Replace the single-session backend with a session registry and scoped commands.
3. Add read-only execution and custom CA handling.
4. Build the manager, editor, environment badges, and persistent session strip.
5. Scope frontend database access and stored SQL/history to their connection.
6. Verify profile persistence without secrets, edits/duplicates, session isolation,
   read-only bypass attempts, TLS trust, and responsive UI.

## Acceptance checks

- Create MMO, save Local and Production profiles, restart, and find both profiles.
- A production profile is visibly marked and opens read/write after warning.
- Open two connections, run/cancel queries independently, and switch without
  losing drafts or mixing results.
- Profile JSON never contains a password; credentials survive restart only when
  the user selected native credential storage.
- Failed tests/saves do not overwrite an existing profile or its credential.
- Invalid/missing CA certificates fail clearly and never downgrade to plaintext.
- Workflows remain operable at 760 × 560 and with the large-font preference.
