# Connection workspaces: verification

Verified on macOS arm64 with Rust 1.88 and PostgreSQL 17, 2026-09-05.

## Automated checks

- 21 Rust tests passed, including the existing query, table editing, export and
  structure regressions.
- Profile persistence/reload contains no password fields or values. Corrupt and
  future-version configuration is not overwritten. Renaming retains workspace IDs.
- A changed destination cannot silently reuse a stored password.
- An unavailable vault does not replace the prior profile; retired credentials
  remain tracked and cleanup is retried when the vault becomes available.
- A disposable credential was written/read/deleted through the real macOS Keychain.
- Two real PostgreSQL sessions were isolated; cancelling/disconnecting one did not
  affect the other. Disconnect during a running operation was rejected.
- Read-only blocked ordinary writes, session/transaction controls, writable CTEs,
  EXPLAIN ANALYZE of writes, and attempts to turn off transaction read-only mode.
  Errors and timeouts rolled back cleanly; subsequent reads succeeded.
- Custom CA TLS verified successfully. Wrong hostname, OS-untrusted CA and missing
  CA files were rejected; cancellation used the original custom trust configuration.
- 7 frontend tests passed: all database commands carry a session ID; duplicates do
  not inherit credential references; edits invalidate a connection test; production
  writes require acknowledgment; product/environment filters; profile-specific SQL
  and history; final SQL edits survive immediate disconnect.
- TypeScript/Vite build, Rust formatting, Clippy with warnings denied, and
  a debug macOS .app bundle completed.

## UI checks

The native macOS bundle opens the actual connection manager and loads saved
workspaces/profiles. Interactive browser QA uses the explicitly synthetic
`tests/preview.html` fixture (no PostgreSQL or real credentials), covering the
manager, forms, environment badges, test-before-save, and multiple session UI.
The desktop layout was inspected at 1280 × 720 and the minimum 760 × 560 window,
plus a 540 × 720 narrow layout with working list/detail navigation. Two synthetic
connections stayed active; the first connection retained its query result after
switching to the second and back. Dialog focus lands on the intended input.

Windows Credential Manager and Linux Secret Service adapters are configured but
have not been executed on those operating systems. Signed releases and SSH tunnels
remain separate work.

## Reproducing the checks

### Connection launcher UI refresh — 2026-09-05

- 21 frontend tests pass, including 10 launcher regressions and four shared native
  header-drag tests. Direct Connect/Open, on-demand details, keyboard activation,
  focus restoration, direct edit, duplication, empty/loading states, filter reset
  and busy/active-session protections are covered.
- TypeScript/Vite production build and macOS debug app bundle rebuilt successfully.
  This refresh changes frontend presentation/navigation only; Rust integration
  results above refer to the preceding safe-connections implementation.
- Synthetic browser QA: 1560 × 980, 1280 × 720, 760 × 560, 540 × 720 and 360 × 640.
  A 43-profile fixture with long names produced no horizontal panel overflow;
  connection names retained a minimum 15 px size with the large-text preference.
- Production quick-connect still requires explicit write acknowledgment. Opening
  a synthetic staging session exposes the session strip; returning through Open
  preserves the SQL draft. Closing the final session removes the empty tab strip.
- First-run and single-profile scenarios are available at
  `tests/preview.html?scenario=empty` and `?scenario=single`; `?scenario=many`
  exercises long lists. None reads or writes real profiles or database credentials.

### Commands

```bash
npm test
npm run build
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --lib
OPALINE_TEST_POSTGRES_PORT=55432 cargo test session_tests -- --ignored --test-threads=1
```

The PostgreSQL fixture must be a disposable server with database/user `postgres`
and password `opaline_test`. Do not point integration tests at a user database.

TLS tests additionally need `OPALINE_TEST_TLS_PORT` and `OPALINE_TEST_CA_PATH`;
the server certificate must be signed by that CA with DNS SAN `localhost`, but
without an IP SAN (to exercise hostname rejection). Run
`cargo test tls_tests -- --ignored` with those variables.

Native vault tests are separately opt-in:
`OPALINE_TEST_NATIVE_VAULT=1 cargo test native_credential_roundtrip -- --ignored`.
They create and remove only a unique disposable credential owned by Opaline.
