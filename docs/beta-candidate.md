# macOS beta candidate — acceptance record

Updated 2026-09-23. **Not a release approval.** This records local stabilization;
the working tree has uncommitted changes, so HEAD is not an artifact identity.
The previous September 5 CI/native results cannot certify this candidate.

Latest pass: [enum implementation, native checks and unsigned QA DMG](beta-enum-verification-2026-09-23.md).
Pilot handoff: [beta-pilot.md](beta-pilot.md). Neither is an approval to publish.

## Scope freeze

PostgreSQL 14–18; macOS first. Existing SQL, table editing, schema editing,
diagrams, profiles and backup/restore are in scope. No new providers, Kafka,
Docker logs, SSH, automatic updater or schema comparison before this beta.
Updates are manual; follow [the tester guide](tester-guide.md).

## Automated gates

Run against the exact reviewed commit, not only the developer checkout:

```sh
npm ci
npm run check
npm audit --audit-level=moderate
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
node scripts/audit-rust-target.mjs aarch64-apple-darwin
node scripts/audit-rust-target.mjs x86_64-apple-darwin
npm run desktop:prepare
node scripts/test-bundled-postgres.mjs
```

Use Node supported by package.json and Rust 1.88+ for cargo-audit 0.22.2.
The database script creates and removes its own loopback Docker containers;
never point integration tests at a real product database. Diagram/DDL tests are
explicitly ignored without opt-in and fail when explicitly requested without a
server. CI and the bundled matrix explicitly invoke them for every major.

After building, verify resources inside the actual app:

```sh
node scripts/verify-macos-bundle.mjs '/path/to/Opaline.app'
# On a signed and notarized candidate, also require native verification:
node scripts/verify-macos-bundle.mjs '/path/to/Opaline.app' --release
```

The check covers pinned client versions, file hashes, architecture, required
licenses and client launch without PATH. Release mode additionally requires
codesign, Gatekeeper and stapled-ticket validation. It does not replace runtime
backup/restore, OS compatibility tests or a bundled-library vulnerability audit.
CI retains the DMG and build-info.json with commit, architecture and checksum.

## Packaging handoff — unsigned private pilot first

The owner currently has no Apple Developer account. Do not upload an unsigned
build as a notarized beta or ask testers to disable Gatekeeper.
The owner chose to proceed without an account: a clearly labeled unsigned private
pilot is the current path, subject to independent install testing, security contact
and owner-approved delivery. Developer ID/notarization remain deferred for a signed
release. A local QA DMG has been built; its evidence and limitations are linked above.
Once credentials are available, use the existing
`OPALINE_CLIENT_SIGNING_IDENTITY` build option to sign PostgreSQL clients and
libraries **before** generating their integrity manifest; then sign/notarize the
app. Verify that packaging has not changed those files. Never paste credentials
in issues or commit certificates. Signing automation needs an actual credential
setup and verification before being advertised as working.

Minimum macOS remains **unqualified**: test every bundled Mach-O dependency as
well as the application. The current local clients target macOS 26, while CI
builds on macOS 15. Neither establishes support for older systems.

## Local evidence — September 23

- `npm run check`: typecheck, lint, formatting, 160 frontend tests, 4 script
  tests and production web build passed after updating Vitest to 4.1.11.
- `npm audit --audit-level=moderate`: zero findings. Updated the affected
  development dependency for [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- Updated rustls from 0.23.43 to 0.23.45 for
  [RUSTSEC-2026-0285](https://rustsec.org/advisories/RUSTSEC-2026-0285.html).
  Both ARM64 and Intel target audits passed (333 packages each). Five `unic-*`
  unmaintained warnings remain. The Linux-only `glib` unsoundness remains outside
  the macOS graph, not fixed or waived for a future Linux release.
- Gitleaks: 16-commit history and a snapshot of tracked/nonignored new source
  files passed. A scan of the entire live developer directory was inconclusive:
  build files changed while scanning and generated/dependency files produced
  findings. This does not certify release binaries or ignored local data.
- Export cancellation regression now synchronizes with the first progress event
  instead of racing a 35 ms timer. The matrix caught the original flaky test;
  it was not hidden by retries or by removing the assertion.
- After the rustls update: fmt/clippy passed; Rust default suite 39 passed,
  23 explicitly ignored. Full disposable PostgreSQL 14–18 matrix passed:
  per major 5 backup, 1 TLS, 7 session, 7 row-change, 1 diagram, 1 schema-CRUD
  and 21 general database tests. Test-owned containers were removed.
- Native release-mode ARM64 `.app` build and packaged-client verification passed.
  This is an unsigned development artifact, not a distributable beta or a DMG
  acceptance result. An earlier overlapping web/native build failed because Vite
  replaced `dist` while Rust embedded it; the subsequent non-overlapping build
  passed. Do not run two web builds against the same checkout concurrently.

These checks do not close the manual gates below. There is no new remote CI run
for this uncommitted working tree and no claim of a signed release.

## Native acceptance — record results, not assumptions

First native interaction pass: [September 23 results](native-acceptance-2026-09-23.md).
Individual scenarios passed; the broader combined gates below remain open until
all their subcases and the actual release candidate have been checked.

For each run record candidate SHA, DMG checksum, OS, architecture, tester and
date. Use synthetic data only. For failure attach a redacted issue and mark
BLOCKED; otherwise record PASS with evidence. Untested means NOT RUN.

| Scenario | Required evidence | Status |
| --- | --- | --- |
| Clean install, first launch, no developer tools | ARM/Intel, minimum supported OS, Gatekeeper result | NOT RUN |
| Keychain save/read/denial, verified TLS and invalid CA/hostname | No silent password clearing or TLS downgrade | PARTIAL: native vault roundtrip + automated TLS; packaged denial UI open |
| Cmd+Shift+[ / ], Cmd+W, last-tab empty state | No application exit or cross-session changes | PARTIAL: first native pass; full two-direction/session matrix open |
| Close tab/window, Cmd+Q, menu/Dock Quit with drafts | Save/Discard/Keep; failed save keeps work | PARTIAL: tab, Cmd+Q and window draft guards observed; menu/Dock cases open |
| Sleep/wake, network loss, DB restart, cancel and reconnect | No automatic write replay; uncertain outcome explicit | NOT RUN |
| Schema/row conflicts, constraints, read-only | Rollback; draft retained; target stays correct | PARTIAL: native UNIQUE/read-only + automated DDL conflicts; full native cases open |
| Packaged backup → new database restore | Compare rows, schema, sequence, indexes; original unchanged | PASS on local QA app: enum fixture, separate target; independent installer test open |
| Upgrade from previous candidate | Profiles, library, history retained; no downgrade promise | NOT RUN |
| 760×560, enlarged font, keyboard, VoiceOver, reduced motion | All actions reachable and labeled | NOT RUN |
| Cold launch, 30-minute session, 500-table diagram, many tabs | Dataset, elapsed time and RSS before/after closing sessions | NOT RUN |

## Pilot and publication

Invite 5–10 PostgreSQL users after package acceptance. Each independently connects,
edits synthetic rows, handles a conflict and performs backup/restore. Record task
completion and confusing interactions, not just crash reports. Do not collect
real SQL, credentials, dumps or app-data directories.

Release only after the exact candidate has green CI, completed native acceptance,
no known data-loss/session-isolation/secret-exposure defect, a tested private
security-reporting channel, reviewed third-party notices and owner approval.
Private reporting contact, minimum OS, tester recruitment and release approval
still need owner input. No public release or remote repository mutation is made
by these local checks.
