# Security and privacy

Opaline is pre-beta. Do not treat its read-only switch as a sandbox for hostile SQL.
Use a PostgreSQL role with only the permissions needed. Production write access
requires an explicit warning acknowledgment; production is not forced read-only.

Profiles contain connection settings, never passwords. Remembered passwords use the
system credential store. Changing the endpoint or TLS trust configuration requires
entering a password again. Prefer required, verified TLS for remote databases;
the `Prefer` setting can fall back to plaintext.
An active session retains its password in zeroizing Rust-owned memory so backup
can reuse the connection without another password prompt. It is not serialized
or returned to the UI. Memory wiping does not protect against process inspection
and does not promise removal of all temporary copies made by dependencies.

SQL drafts, closed-query recovery and optional history live in the webview's local
storage and are **not encrypted by Opaline**. SQL may contain secrets and personal
data. Disable new history entries in Preferences and clear existing history in
History. Recovery backups remain local. Table drafts and results are memory-only;
table drafts do not survive a crash. Saved-query libraries and table filters are
also local and unencrypted. Do not share the app data directory or backups.

Each SQL Run is an application-owned transaction, committed only on success and
rolled back on error. Cross-run transaction controls and commands requiring
autocommit are unsupported. A lost commit response is an unknown outcome: inspect
the database before retrying. Opaline never automatically replays writes.

Exports are sensitive local files. CSV retains original text, including potential
spreadsheet formulas. Use JSON for untrusted data and review files before sharing.
Export selection is checked against paths approved through the native save dialog.
Temporary exports are private files and are published atomically; this is not a
guarantee against every filesystem or power-loss failure.

SQL files detect external content changes before replacement. File handles are
session-local and not persisted. Native dialog approval is required; a conflict
must be reviewed or saved to a different file.

Database dumps can execute arbitrary database code. The default clients are built
from SHA-256-pinned PostgreSQL sources, bundled with their libraries and verified
against an embedded file manifest before execution. No runtime download or PATH
fallback occurs. Updates arrive with app builds. Custom executables are an explicit,
session-scoped Advanced override and must be trusted. Trust the source dump too.
Restore is not a sandbox. Patched psql restricted
mode blocks client metacommands such as shell execution and reconnection; it does
not neutralize SQL functions/extensions or their external effects. Custom archives
use one transaction; SQL scripts can contain their own transaction controls.
Cancellation, disconnection and lost responses must not be represented as proof
that every effect was rolled back.

Maintenance inherits verified TLS/CA for encrypted sessions and never downgrades
those sessions.
CLI connections use explicit CA/system-root PEM and isolated client cert/key/CRL
paths and OpenSSL configuration; no automatic TLS downgrade is allowed.
Credential files and restore snapshots are private temporary files, removed on
ordinary completion/error/close, not guaranteed after a crash
or forced termination. Dumps, snapshots, SQL and exports can contain sensitive data.
No raw PostgreSQL tool output is recorded in task logs. Restore invalidates local
sessions to the same configured host/port/database so stale results require reconnect.
Host aliases and connections in other applications are not automatically discovered.

Profile transfers use a strict allowlist: no passwords, credential IDs or local CA
paths. Imported profiles have new identities; a missing required CA blocks use.

No automatic telemetry or database-content diagnostics are sent. Help can copy a
small diagnostic summary (app version, OS family, provider/runtime), never SQL,
connection names, hostnames, usernames, passwords or result data.

## Reporting

A public repository and private vulnerability-reporting channel have not yet been
configured. Contact the project owner privately. Do not post real credentials,
customer data, exploit targets or raw application data in a public issue.
Configuring a private reporting channel is a release blocker.

See [P0 verification](docs/p0-verification.md) for known findings and unverified
platforms. The absence of scanner findings is not a security certification.
See [P1 verification](docs/p1-verification.md) for file, profile-transfer and
backup/restore safeguards, limits and outstanding acceptance work.
