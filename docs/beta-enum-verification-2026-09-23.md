# Enum completion and private-beta preparation — 2026-09-23

Status: local implementation and partial native acceptance completed. **Not a
release approval.** No upload, GitHub release, invitation or remote settings change.

## 1. Enum support delivered

- Existing enum types in the column Type picker (schema-qualified).
- New enum types, append labels, rename labels in the structure draft.
- Shared Review SQL / Apply flow; read-only and work-safety guards reused.
- Quoted names/literals, 63-byte label validation, duplicates rejected.
- Original OID/label verification and atomic rollback on invalid/stale changes.
- Added labels of existing types must be committed before use in defaults.
- Documentation: [enum-types.md](enum-types.md). Management is inside the table
  structure editor, not a separate catalog browser. No enum-array/domain editor,
  value deletion/reordering or arbitrary cast generator.

## 2. Automated evidence

- `npm run check`: 163 frontend + 4 script tests; typecheck, lint, formatting and
  production build passed. Subsequent baseline/preview-fixture changes also passed
  typecheck, lint, formatting, build and the final 163 + 4 test rerun.
- `cargo test --lib`: 40 passed, 23 explicitly ignored without opt-in services.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`: passed.
- `npm audit --audit-level=moderate`: no vulnerabilities reported.
- Disposable PostgreSQL 14, 15, 16, 17 and 18 matrix: all passed. Per major:
  5 backup, 1 TLS, 7 session, 7 atomic row editing, 1 diagram, 1 schema CRUD
  (now including enums), 22 general database tests. Relocated bundled clients used.
- Enum integration covers CREATE TYPE + table, existing-type selection, rename
  reflected in stored records, append, stale labels and rollback when a newly
  appended label is prematurely used as a default. Unit tests cover escaping,
  attempted swaps/removal and oversized labels.
- Opt-in `native_credential_roundtrip`: passed on the real macOS credential store;
  creates/reads/deletes a uniquely named synthetic secret and verifies deletion.
  This is not a test of the packaged app's Keychain denial UI.

## 3. Native acceptance on this machine

macOS 26.3, ARM64. App: `Opaline Acceptance`, bundle ID
`app.opaline.acceptance20260923` (separate configuration from the user's app).
Disposable PostgreSQL 17 on loopback port 50341. Synthetic records only.

| Scenario | Result |
| --- | --- |
| Load enum catalog in existing table editor | PASS: `public.task_status` available |
| Rename `draft` → `pending`, append `done` | PASS: review contains two ALTER TYPE statements; Apply refreshes table |
| Edit enum cell using keyboard | PASS: pending/ready/done options; Enter stages, Cmd+S saves; SQL confirms `done` |
| Create `public.priority` and a table using it | PASS: one CREATE TYPE + CREATE TABLE review; SQL confirms enum column |
| Close window with enum/table draft | PASS: named pending-work guard; Keep working preserves full draft |
| Two concurrent profiles | PASS: switching returns to independent documents and read/write mode |
| Production/read-only profile | PASS: production badge; SQL UPDATE rejected; Add row, structure and enum actions disabled |
| Packaged backup → new database restore | PASS: native save/open dialogs, bundled pg_dump 17.11, trusted snapshot inspection, named-target confirmation, restore succeeds |
| Restore comparison | PASS: source/target row, enum labels/order, PK/UNIQUE index definitions and sequence last_value/is_called match; source unchanged |
| Clean Cmd+Q | PASS: QA application quits |

The read-only SQL test did not change the synthetic record. Backup/restore used
`postgres` → `opaline_enum_restore` in the disposable container, not a real user
database. The app was quit; the owned container and its databases were removed.
The synthetic dump remains under `work/opaline-enum-qa-20260923.dump`, outside the
repository. QA profiles remain in the separate app configuration; their endpoint
is no longer running. The user's `mmo-db-1` was not modified.

Native select menu activation via accessibility clicks was inconsistent; confirmed
value changes used keyboard navigation and were checked in the resulting UI and DB.
Do not claim mouse-only acceptance from those attempts.

Still open: packaged Keychain save/denial, production write-consent path, complete
menu/Dock quit variants, OS sleep/wake, VoiceOver, enlarged-font/minimum-size matrix,
long-session/performance, installation/upgrade on another Mac. Existing automated
coverage does not close these native gates.

## 4. Local package and pilot handoff

- Built `.app` and DMG with Tauri release profile, product `Opaline Acceptance`.
- Base HEAD: `824e1a6ddceeb9e47620428717648720155e7fa1`, **dirty working tree**.
  This is NOT the source identity of a clean committed candidate. No commit/push.
- DMG: `src-tauri/target/release/bundle/dmg/Opaline Acceptance_0.1.0_aarch64.dmg`.
- SHA-256: `41db31021e4dfa6f94e3d29c872ac92ff592530c31c77b5c67869e54ebfb6dac`.
- Packaged client hash/license/architecture/clean-environment launch verification
  passed. `hdiutil verify` passed. No Developer ID or notarization verification.
- Local dependencies target macOS 26; do not advertise compatibility with older OS
  or Intel based on this artifact. No fresh remote CI build of these changes.
- [Tester guide](tester-guide.md) includes a per-app unsigned-pilot opening path,
  never globally disabling Gatekeeper. It remains unverified on an independent Mac.
- [Pilot sheet and invitation draft](beta-pilot.md) prepared, not sent.

Next external gates: owner-provided second Mac/tester and private security reporting
channel; complete outstanding local native scenarios, review/commit the candidate,
green CI for that exact source, then owner-approved delivery. Apple account remains
deferred for this explicitly unsigned pilot, not falsely marked as completed.
