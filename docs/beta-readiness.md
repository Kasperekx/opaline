# Opaline beta — remaining work

Date: 2026-09-23. **Stabilization in progress, not approval to publish.**

Current acceptance: [beta candidate](beta-candidate.md). The owner confirmed
there is no Apple Developer account and chose an explicitly unsigned, private
pilot first. Signing/notarization remain deferred, not completed. Current results
and QA package: [Enums and pilot preparation](beta-enum-verification-2026-09-23.md).
Older reports below are historical and do not automatically cover the current code.

Owner decisions: **macOS** for the first beta, Windows/Linux later;
creating a database during restore and explicit autocommit **are required before beta**.
The code is already in the public repository. Technical evidence and remaining
limitations: [stabilization acceptance](beta-stabilization-verification.md).

Goal: a tester installs the app, connects to PostgreSQL, runs SQL, browses and
edits data, and creates a backup without the author's help or a development environment.
Premium UX means clarity and predictable behavior, not more visible buttons.

This is the current remaining-work checklist. The [original P0/P1 plan](beta-plan.md)
preserves the phase history. A checked box means full acceptance, not merely that
code exists. **P0 blocks release; P1 must be delivered or explicitly deferred.**

## Already implemented — do not rebuild

- Workspaces, profiles, environments, multiple active sessions and a connection switcher.
- System credential storage, custom CA/TLS, read-only mode and a production warning.
  Preserve the decision: production writes are available after a warning, without forced read-only.
- SQL editor, autocomplete, formatting/Undo, SQL files, library and history.
- Tables: filtering, sorting, pagination, structure and CSV/JSON export.
- Cell editing, staged batches, diff review, atomic saves and draft protection.
- A cell menu instead of a permanent toolbar; range copying, inspection and row
  duplication as a new draft. PK values reset; the database supplies identity/generated values.
- Backup/restore with bundled PostgreSQL tools, without user installation.
- Relationship diagrams, table navigation and a shared structure editor with DDL review.
- Creating, altering and dropping tables; basic indexes and foreign keys.
- Tab-switching/closing shortcuts, an empty-session view and inline JSON previews.

These features are implemented locally. **This is not acceptance of a signed
release on every platform.** Evidence and limitations: [P0](p0-verification.md),
[P1](p1-verification.md), [backup 14–18](bundled-postgres.md),
[editing](inline-table-editing-verification.md),
[menus and duplication](table-context-actions-verification.md).

## Decisions before stabilization

| ID | Decision | Proposal for review |
| --- | --- | --- |
| D1 | Systems, architectures and oldest OS for the first beta | Confirmed: macOS first; Windows/Linux later. CI builds ARM64 and Intel on macOS 15; minimum OS and both architectures still require package acceptance. |
| D2 | Updates | Manual updates preserving configuration may suffice for the first beta; automatic updates are a separate decision. |
| D3 | Restore into a new database | Confirmed: before beta. Implemented and integration-tested on 14–18; final-package acceptance remains open. |
| D4 | Commands outside transactions | Confirmed: explicit autocommit before beta. Implemented per tab, with confirmation and reset on reconnect/restart; VACUUM/CREATE DATABASE tests on 14–18. |
| D5 | First testers | Backend developers using PostgreSQL, initially with test/local/staging data. Record their three most common tasks. |
| D6 | SSH and other integrations | SSH, Kafka and Docker logs are outside the first beta. Diagrams and the structure editor are implemented and included in acceptance. |
| D7 | Repository, name and contact channel | Repository selected: `Kasperekx/opaline`, connected over SSH. Release name, bug-reporting channel and private security reporting still need agreement. |

**Your decision notes:**

> To be completed.

## Work order

| Order | Task | Priority | Deliverable |
| --- | --- | --- | --- |
| 1 | B01 — everyday UX audit | P0 | A finalized list of layout and interaction defects |
| 2 | B02 — data-change correctness | P0 | Write and conflict tests against a real database |
| 3 | B03 — failures and work preservation | P0 | Native acceptance of restarts, network loss and closing |
| 4 | B04 — complete backup/restore acceptance | P1 + P0 security | A verified workflow without manual tool setup |
| 5 | B05 — security and privacy | P0 | Current audit and resolved known risks |
| 6 | B06 — performance and accessibility | P0 | Measurements, small-window and large-data tests |
| 7 | B07 — repository, CI and version matrix | P0 | Actually passing jobs for the release candidate |
| 8 | B08 — installation, updates and documentation | P0 | A tester-ready package |
| 9 | B09 — private pilot and public-beta decision | P0 | Reports, fixes and an approved release |

B05 and preparation for B07 can start earlier, alongside fixes.
Do not add integrations during stabilization without a shared decision.

## B01 — consistent everyday UX

First, finish the interactions users encounter every day.

- [ ] Walk through workspace → profile → session → SQL → table → edit → save
  → close. Every action has an unambiguous target and predictable result.
- [ ] Review all toolbars and menus: remove unnecessary instructions and duplicate
  actions; align naming, spacing, disabled/hover/focus states and shortcut hints.
- [ ] Fix many-tab and long-name behavior. In the latest screenshot,
  “Reopen closed query” wraps at the end of the toolbar; include this in acceptance.
- [ ] Check wide tables and very long values: no overlapping headers, row jumps
  or inaccessible menus/editors near window edges.
- [ ] Align empty/loading/error/success states. Routine formatting and copying
  must not occupy a large separate area. Save failures must not resemble success.
- [ ] Make connection state, environment and read-only mode clear; explain denied edits.
- [ ] Verify native focus and shortcuts: Cmd/Ctrl+C/S, F2, Enter/Escape, Tab,
  Shift+F10, cell ranges, tab switching and open dialogs.

Acceptance: testers can edit/duplicate a record, review changes, save or discard
without the author's instructions or accidentally writing to another session.

**Your B01 notes:**

> To be completed: screens, messages and behaviors that cause friction.

## B02 — data correctness

The mechanisms exist, but coverage must go beyond a handful of test tables.
Any defect risking data corruption blocks beta.

- [ ] Test types: bigint/numeric without precision loss, UUID, Unicode,
  NULL/empty text/DEFAULT, JSON, enums, dates/time zones, arrays and custom types.
- [ ] Duplication: manual/composite/UUID-default/serial/identity PKs, generated
  columns, other UNIQUE constraints, copied local edits, draft limits and read-only.
- [ ] UPDATE/DELETE/INSERT in one transaction: RLS, missing privileges, FK, UNIQUE,
  deferred constraints, triggers and schema changes during editing.
- [ ] Concurrent updates/deletions/PK changes by another client: retain drafts,
  compare accurately and never overwrite automatically.
- [ ] Uncertain COMMIT, lost responses and refresh failure after success:
  no duplicate INSERT or misleading “not saved” status.
- [ ] Copy/export preserve formats and NULL; clearly distinguish copying drafts
  from copying values read from the database.

Acceptance: integration tests for declared PostgreSQL versions and a regression
test for every discovered defect. Browser previews do not replace these tests.

**Your B02 notes:**

> To be completed.

## B03 — network loss, restarts and work protection

- [ ] Natively test quitting, closing tabs, disconnecting and refreshing with
  local changes: Save / Discard / Keep working.
  Local QA build: fixed Cmd+Q bypassing protection; retests of Cmd+Q, menu Quit,
  window closing and failed saves passed. Dock Quit, other actions and the final
  package still require full acceptance.
- [ ] Sleep/wake, network loss, PostgreSQL restart, timeouts and cancellation
  during writes, reads and exports. No stranded locks or tasks.
- [ ] Reconnect does not automatically run SQL, change a tab's target or lose
  drafts; previous results are marked as potentially stale.
- [ ] Test corrupt configuration, insufficient disk space, access permissions,
  old-format migration and attempts to start a second instance.
- [ ] Locked/unavailable credential store: explain the problem and never
  overwrite an existing profile or password with an empty value.
- [ ] Clearly show and document that record drafts live only in RAM and do not
  survive crashes. Do not promise unimplemented autosave or recovery.

**Your B03 notes:**

> To be completed.

## B04 — user-ready backup and restore

- [ ] On a clean machine without PostgreSQL/Docker/Node/Rust: Backup → choose
  file → completed backup. No Detect tools, PATH setup or client installation.
- [ ] Repeat dump → restore → compare data, structure, sequences and indexes
  using the final package on declared platforms and server versions.
- [ ] Test large backups, insufficient disk space, cancellation, crashes and
  network loss; incomplete backups must not replace existing files.
- [ ] Test partial dumps, dependencies, extensions, roles/privileges, corrupt
  or unsupported files and compression formats.
- [ ] Validate limits in realistic use: currently 64 MiB for plain SQL restore,
  100 GiB for custom archives. Show limits early or revise them after measurement;
  a constant in code is not evidence of testing at that size.
- [ ] Restore still requires a clear target, trusted file and separate consent
  for production/nonempty database/DROP. Never promise rollback of arbitrary SQL scripts.
- [x] Resolve D3 and implement new-database creation: separate consent, unused
  name, no automatic DROP on failure; custom/SQL integration on PostgreSQL 14–18.
  This does not replace the clean-machine acceptance above.

**Your B04 notes:**

> To be completed.

## B05 — security and privacy

- [ ] Repeat JS/Rust and binary audits on the exact release package. The previous
  report identified `glib 0.18.5 / RUSTSEC-2024-0429` and unmaintained dependencies;
  obtain a current assessment and resolve or document risk boundaries.
  This checklist is not a fresh scan and does not validate the old finding's current status.
- [ ] Review IPC, session isolation, CSP, file-access scope, SQL parameterization
  and read-only enforcement in Rust, not merely disabled UI controls.
- [ ] Test TLS/CA, incorrect hostnames, locked Keychain and profile-target changes
  without implicitly reusing the previous password.
- [ ] Scan secrets across repository history and finished artifacts; no user
  data in fixtures, screenshots, logs or reports.
- [ ] Document local unencrypted SQL drafts/history, disabling and clearing
  options, and temporary-file behavior after crashes.
- [ ] Establish a private vulnerability-reporting channel and update SECURITY.md.
- [ ] Check licenses and bundled notices across the distribution, including
  PostgreSQL clients, OpenSSL and dependencies; define their update process.

**Your B05 notes:**

> To be completed.

## B06 — performance, small windows and accessibility

- [ ] Measure startup, RSS after long sessions, large catalogs, multiple connections
  and tabs, wide tables and large results. Record datasets and measurements.
- [ ] Check the global memory budget, not just per-query limits; disconnecting
  sessions and closing tabs should release resources.
- [ ] Minimum window 760 × 560, maximum font size, system scaling/DPI, a second
  monitor and panel resizing: no inaccessible actions.
- [ ] Keyboard-only use, screen readers, contrast, focus-visible and reduced motion.
  Status meaning must not depend solely on color or hover.
- [ ] Large cells and catalogs do not freeze the app; limits are clearly
  communicated and operations can be interrupted.

**Your B06 notes:**

> To be completed.

## B07 — repository, CI and version matrix

- [x] Connect remote repository: `origin` → `git@github.com:Kasperekx/opaline.git`.
  Code and workflow pushed on 2026-09-05 (`5d1c42f` and subsequent fixes).
- [x] Before the first push, check secrets and file scope, prepare a commit and
  push after publication approval. Gitleaks: no findings in staging or history.
- [ ] Run the existing workflow in remote CI and fix actual failures on all
  declared systems. A YAML file does not mean passing CI.
  `ce8bfc4` and `4d616f7`: 12 passing jobs each, including macOS ARM/Intel.
  Every later candidate (including the native Quit fix) requires its own CI run.
- [x] Include PostgreSQL-dependent `database::table_changes` in CI and the
  local matrix. Opt-in tests now actually run on versions 14–18.
- [ ] Test editing/duplication on declared server versions. The existing
  backup/TLS/session matrix for 14–18 does not imply identical editing coverage.
- [ ] Enforce typecheck/lint/format/tests/build and secret/dependency audits;
  do not bypass blocking tests with undocumented exceptions.
- [ ] Version, commit/tag, changelog and checksums must identify exactly the
  artifact that passed acceptance, not a changing local directory.

**Your B07 notes:**

> To be completed: repository owner and target platforms.

## B08 — installation, updates and first launch

- [ ] Prepare the release on the oldest declared OS. The current development
  client package was built with a macOS 26 minimum; it does not prove older-Mac support.
- [ ] Signing/notarization and finished-distribution verification. Bundled clients
  must be signed before creating the integrity manifest; test the final package.
- [ ] Install, launch, update and uninstall on clean machines; verify operation
  without developer tools and correct credential-store access.
- [ ] Updates preserve profiles/library/history. Plan configuration backup and
  failed-update recovery without assuming any downgrade can read newer formats.
- [ ] If auto-update is in scope: package signatures, beta channel, interrupted
  downloads and invalid packages. Otherwise provide simple, verified manual instructions.
- [ ] Tester README, installation/first connection, shortcuts, limits and known
  issues. In-app help must match actual behavior, not an older UI.
- [ ] Working About / Report issue with version and optional safe diagnostics;
  the issue template must not encourage sharing database contents or secrets.

Publisher accounts, certificates, payments and publication require the owner's
decision; this plan does not initiate them.

**Your B08 notes:**

> To be completed.

## B09 — pilot and release criteria

- [ ] A selected small group, for example 5–10 testers, independently installs
  the candidate and performs D5 tasks using non-production data.
- [ ] Collect defects and anything unclear without the author's guidance.
  Fix blockers and lost work before cosmetic issues.
- [ ] Each blocker fix has a regression test and renewed acceptance of the relevant package.
- [ ] All P0 items closed; remaining P1 items have explicitly accepted statuses.
- [ ] No known data-loss, session mix-up, secret-leak or unintended-write defects.
  Limitations are documented and the reporting channel works.
- [ ] The owner approves publication, instructions and the patch-delivery process.

**Your B09 notes:**

> To be completed: whom to invite and which tasks to assign.

## After this beta — candidates, not hidden release requirements

- Docker logs linked to a product/service and environment.
- Kafka topic, message and consumer-lag inspection as an integration.
- Diagram extensions: export and schema comparison.
- Observability integrations linked through service/environment/trace ID.
- SSH, visual EXPLAIN, advanced filters, CSV/JSON import and additional providers.

## Additional feedback — keep B01–B09 numbering unchanged

| ID | Friction / missing capability | Expected behavior | Priority to agree |
| --- | --- | --- | --- |
| U01 |  |  |  |
| U02 |  |  |  |
| U03 |  |  |  |
| U04 |  |  |  |
| U05 |  |  |  |

D1 (systems), D3 and D4 are confirmed. Minimum macOS, package signing/delivery,
a private security channel and testers still need to be settled.
Next: accept the exact package on clean Macs and complete the remaining B01–B09
items without adding integrations. Passing CI alone does not make the beta ready.
