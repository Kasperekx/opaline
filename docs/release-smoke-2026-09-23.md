# CI artifact smoke test — 2026-09-23

Status: **partial; publication pending backup/restore verification**.

- Source: `ec7498a18baef71b33de778f7bdcc57f45079b28`.
- CI: https://github.com/Kasperekx/opaline/actions/runs/35910527353
- Installer: `Opaline_0.1.0-beta.1_aarch64.dmg` (24,499,289 bytes).
- SHA-256: `fef9476d24a4920de117de978092af5f53219f7d9ec6bd6e581b52ec48edb977`.
- Test host: macOS 26.3, Apple Silicon; not an independent clean machine.
- Installed executable matches the corrected mounted DMG byte-for-byte by SHA-256.
- Full application ad-hoc signature and bundled PostgreSQL client verification pass.
  This does not establish Developer ID signing, notarization or minimum OS support.

## Native installed application

Tests use a separate `Release QA ec7498a` workspace and disposable PostgreSQL 17.8
container. Existing MMO sessions and data are not test targets.

| Check | Result |
| --- | --- |
| Launch browser-downloaded corrected build | User confirmed |
| Create profile and test connection | PASS |
| Connect using a session-only password | PASS |
| Run SQL and display database/user result | PASS |
| Browse table and stage an inline change | PASS |
| Save change and verify independently through PostgreSQL | PASS |
| Backup using bundled tools | PENDING: native save-dialog automation blocked |
| Restore into a new database and compare contents | NOT RUN |

The save-dialog automation could not reliably operate the system panel and
reported `noWindowsAvailable` for coordinate actions. This is not yet evidence
of an application defect. Manual completion was requested before continuing.

The rejected draft installer must not be published. The broader remaining
acceptance checks in `beta-candidate.md` are not superseded by this smoke test.
