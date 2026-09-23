# Opaline 0.1.0-beta.1 — macOS Apple Silicon

First beta candidate of Opaline, a free, open-source PostgreSQL desktop client.

> Draft: not approved for public distribution yet. Independent installation,
> remaining native acceptance and private security reporting must be verified
> before publishing. Do not remove this notice until those gates are recorded.

## Included

- Product workspaces, environment labels and independent connection sessions.
- SQL editor with completion, formatting, files, saved queries and history.
- Inline table editing, staged changes, diff review and atomic saves.
- JSON previews and PostgreSQL enum editing.
- Database diagrams and reviewed table/index/foreign-key structure changes.
- Bundled PostgreSQL 14–18 backup tools; restore to an existing or new database.
- Keychain credentials, verified TLS, read-only mode and production warnings.

## Download and installation

This candidate targets **Apple Silicon (M-series)**. Intel is not included in this
release. The installer is built on macOS 15; the supported minimum OS remains
unqualified until independent installation acceptance is complete.

Download the attached ARM64 DMG and `SHA256SUMS.txt`. Verify the DMG using
`shasum -a 256 -c SHA256SUMS.txt` in the directory containing both files, then open
the DMG and copy Opaline to Applications. No PostgreSQL client tools, Node, Rust
or Docker installation is required. Connect to your own PostgreSQL server.

**Unsigned and not notarized by Apple.** If you trust the exact build and checksum,
follow the per-app opening instructions in the
[tester guide](https://github.com/Kasperekx/opaline/blob/v0.1.0-beta.1/docs/tester-guide.md).
Never disable Gatekeeper globally. Stop if macOS reports malware or a damaged app.

## Known limitations

- Use disposable, non-production data. This is not a stable production release.
- Row and structure drafts are memory-only and do not survive crashes or Force Quit.
- SQL drafts/history are local but not encrypted by Opaline.
- Backups/restores support the same PostgreSQL major, not cross-major migration.
- Windows, Linux, Intel acceptance, SSH, Kafka and Docker logs are outside this release.
- No automatic updater. Finish pending work and quit before replacing the app.
- Sleep/wake, long-session performance, accessibility and clean-machine upgrades
  still need the remaining native acceptance checks; see the
  [candidate checklist](https://github.com/Kasperekx/opaline/blob/v0.1.0-beta.1/docs/beta-candidate.md).

Report reproducible bugs with the app version, macOS version and architecture.
Use synthetic examples; never attach credentials, real dumps or customer data.
For vulnerabilities follow [SECURITY.md](https://github.com/Kasperekx/opaline/blob/v0.1.0-beta.1/SECURITY.md).

`build-info.json` identifies the exact source commit, architecture and package hash.
