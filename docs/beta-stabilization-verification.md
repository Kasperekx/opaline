# Beta stabilization evidence — 2026-09-05

## Scope and status

The owner selected **macOS first**, with new-database restore and explicit
autocommit before beta. Windows/Linux follow later. This report is evidence for
specific checks, **not a declaration that every P0 or the public beta is ready**.
No release/tag, paid account, certificate purchase or automatic update was created.

## Repository and remote checks

- Public repository: [Kasperekx/opaline](https://github.com/Kasperekx/opaline), `main`.
- `5d1c42f`: audited initial project push. Staged snapshot and all 9 earlier commits
  scanned with Gitleaks 8.30.1, no findings. Generated clients, build output,
  node_modules, local profiles/keys/dumps are ignored. Screenshots use synthetic data.
- First CI run failed before jobs because a job-level `env` used an unavailable
  `job.services` context. `0c9bb0f` moved that context into the PostgreSQL test steps.
- [Run 33973985827](https://github.com/Kasperekx/opaline/actions/runs/33973985827):
  frontend, secret scan, PostgreSQL 14–18, bundled backup, Linux build and macOS ARM
  build passed. Global Rust audit and Windows client preparation failed.
  Windows remains unqualified; its preparation failure was **not fixed** here.
- `ce8bfc4`: macOS target-specific security gates and separate macOS 15 ARM/Intel
  packaging jobs. [Run 33974863022](https://github.com/Kasperekx/opaline/actions/runs/33974863022)
  completed successfully (all 12 jobs, including both macOS packages). This pass
  applies to `ce8bfc4`, not automatically to later feature commits.
- Current workflow includes actual ignored table-change/session suites, real
  PostgreSQL 14–18 jobs, secret scanning and target dependency audits. macOS artifacts
  carry the commit, version, architecture and SHA-256 in `build-info.json` and Help
  shows the CI commit. Artifacts are unsigned testing builds, retained for 7 days.

## New behavior and safeguards

### Explicit autocommit

Atomic remains the default. A query-tab selector asks for explicit consent before
enabling autocommit and identifies the target. Exactly one statement may be run;
comments and quoted/dollar-quoted semicolons do not create false boundaries.
Manual transaction-control statements are blocked. PostgreSQL remains the SQL parser.
Read-only sessions cannot use autocommit. New/reopened tabs, reconnect and restart
do not inherit it. Successful writes are immediate; any error invalidates the
session and tells the user to inspect before retrying. Dropped Atomic query futures
also invalidate/abort the transport so unfinished transactions are not reused.

### Restore into a new database

The user chooses a destination mode, a new 1–63 UTF-8-byte name and separately
confirms creation, trusted dump and (when relevant) production. Exact target-name
confirmation is required. Existing names, clean/drop and non-empty reuse are refused
in creation mode. Identifiers and libpq parameters are escaped independently.
CREATE DATABASE uses template0/UTF-8 and the current role's privileges. The source
connection/profile remains unchanged. If restore fails the new database is kept,
never automatically dropped; creation cannot be rolled back with the restore.
Unconfirmed creation aborts the source session and warns about unknown outcome.
Cancellation is scoped to the random job marker, role and actual target database.

### UI, help and feedback

- Reopen closed query is an icon with an accessible label, not wrapping toolbar text.
- Active tabs scroll into view; arrow/Home/End keys navigate; F2 renames.
- Editor toolbar height follows its wrapped content, including Compact density.
- Help reflects the implemented editing, backup and transaction behavior.
- Report a bug and Tester guide open only two exact allowlisted GitHub URLs.
  No diagnostics are attached or reports submitted automatically. JS automatic
  link-opening injection is disabled. A failed browser launch shows the URL.
- Public bug/feature templates and a tester guide are included. A private
  vulnerability-reporting channel still requires owner configuration.

## Automated verification

- Frontend: 106 Vitest tests; TypeScript, ESLint, Prettier and Vite build pass.
- Security-gate unit tests: 3 Node tests pass; a compiled unsafe dependency fails
  while excluded-platform findings remain visible; malformed evidence fails closed.
- Rust format/Clippy checks pass locally. The default library suite contains
  opt-in and environment-conditional database tests: a default pass alone is not
  evidence that those tests exercised PostgreSQL.
- Local relocated-bundle matrix, isolated disposable Docker servers at random
  high loopback ports, **each of PostgreSQL 14/15/16/17/18**:

  | Suite | Passed per version | What is exercised |
  | --- | ---: | --- |
  | `backup::tests --ignored` | 5 | Custom/SQL round trip into existing and new targets, quoted/Unicode names, existing-name refusal, failed restore keeps target, pre-cancel, file preservation, CLI TLS/restricted SQL |
  | `tls_tests --ignored` | 1 | CA, hostname verification and cancellation with the same trust |
  | `session_tests --ignored` | 7 | Isolation, scoped cancellation, loss/reconnect, read-only, Atomic rollback, VACUUM/CREATE DATABASE in autocommit, dropped query future |
  | `database::table_changes --ignored` | 7 | Mixed writes, conflicts, deferred constraints, unknown commit, dropped save future, RLS/permissions, trigger-returned values and stale schema |
  | `database::` | 17 | Includes four environment-conditional connection/data/structure/export tests and unit tests; the seven ignored table-change tests run separately above |

The script refuses default port 5432 and fails if a suite runs zero tests. It removes
only its own temporary containers/data/certificates. Pre-existing user databases were not used.
The native Keychain round trip is a separate opt-in test and is not claimed here.

## Security findings

After adding the scoped Tauri opener: npm audit reports zero vulnerabilities.
Both macOS target graphs contain 333 reachable packages and no reported vulnerability
or unsoundness; five unmaintained `unic-*` warnings remain. Full-lockfile glib
unsoundness remains a future Linux blocker, not a waived/fixed advisory. See
[audit scope and primary advisory](macos-security-scope.md). C/OpenSSL/PostgreSQL
binary audit, notices and final signed package validation remain release work.

## Visual checks and limits

Synthetic browser fixture at **760 × 560**, Large text and Compact density:
SQL toolbar, explicit autocommit dialog, new-database restore fields/consents and
sticky footer reachable; many tabs scroll, reopen action stays compact. The fixture
cannot execute backup/restore and intentionally throws instead of reporting success.
This is browser layout verification, not native WebKit, VoiceOver or clean-machine QA.

## What still blocks release

Use [B01–B09](beta-readiness.md) for the detailed remaining checklist. In particular:

1. Owner-provided signing/notarization setup and a private security contact.
2. Declare and test the minimum macOS; qualify both architectures with the exact
   final artifact. Local macOS 26 build resources do not prove older OS compatibility.
3. Native install/first-run/update/exit/Keychain, sleep/network-loss and recovery QA.
4. Extended large-data/resource-budget/performance and accessibility measurements;
   complete safety/security/license checks, not just the cases in this report.
5. Inspect the final commit's CI artifacts, run the pilot on non-production data,
   resolve blockers and obtain the owner's explicit release approval.

No checkbox for these gates was marked complete merely because code exists.
