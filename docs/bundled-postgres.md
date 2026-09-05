# Automatic backup engine — 2026-09-05

## User workflow

Backup / Restore → Create backup → native destination dialog → actual backup.
No Detect tools, package manager, administrator access, runtime download or PATH
configuration. PostgreSQL 14–18 clients ship inside Opaline, including libpq and
their non-system libraries. The default engine matches the connected server major.
Network access to the database is still required; obtaining the engine does not
require internet access, even for a first backup.

The active password stays in Rust session memory and is reused without a second
Keychain lookup. Optional custom clients/password overrides are in Advanced.
Restore still requires a trusted file, exact database name, and independent
production/non-empty/clean approvals. Cross-major migration, creating a new target
database, cluster backup and PITR remain outside this implementation.

## Implementation boundaries

- `scripts/postgres-releases.json`: reviewed source versions and SHA-256 pins.
- `scripts/prepare-postgres.mjs`: build-time preparation and verified cache;
  nothing is installed on an end user's system.
- `scripts/postgres-bundle.mjs`: client/dependency closure, relocation, notices,
  executable verification and inventory. No PostgreSQL server is bundled.
- `backup/managed.rs`: app-resource resolution and embedded-manifest verification.
- `backup/tools.rs`: client version policy and isolated process environment.
- `backup/process.rs`: private credentials, compatible verified TLS and lifecycle.
- `BackupAdvanced.tsx`: optional overrides separated from the normal workflow.

The app pins clients 14.24 / 15.19 / 16.15 / 17.11 / 18.6, including relevant client
security fixes. A newer server patch in the same major does not require installing
anything. We intentionally do not replace every version with pg_dump 18: newer
dump tools do not promise a dump can be restored to an older server major.
Sources: [PostgreSQL version policy](https://www.postgresql.org/support/versioning/),
[pg_dump compatibility](https://www.postgresql.org/docs/18/app-pgdump.html),
[psql security advisory](https://www.postgresql.org/support/security/CVE-2026-18408/).

Generated clients live under `src-tauri/resources/postgres/<major>`, ignored in git.
`build.rs` embeds their manifest; a release missing any of the five majors or using
the wrong architecture fails. Runtime validates file paths, sizes and SHA-256
before version checks/execution. A corrupt application component fails closed;
there is no silent fallback to an arbitrary system executable.

TLS uses verify-full with the explicit profile CA or a private PEM exported from
native certificate roots. Explicit absent client-certificate/key/CRL paths and an
empty OpenSSL configuration prevent implicit client configuration. This works with
libpq 14/15 too, without newer-only `sslrootcert=system` / `sslcertmode` parameters.
Passwords are never command arguments; temporary credentials are removed on normal
completion. Crash cleanup and hostile local process inspection are not guaranteed.

## Developer/CI setup — not end-user instructions

The Tauri dev/build hooks run `npm run desktop:prepare` automatically. Initial
source compilation needs internet, a C compiler and the dependencies below; a
verified cache avoids repeat downloads/builds. The source/build cache is in `work/`.

- macOS: Xcode command-line tools, make, OpenSSL 3 (`brew install openssl@3`, or
  `OPALINE_OPENSSL_PREFIX` for the build machine).
- Ubuntu 22.04: build-essential, libssl-dev, zlib1g-dev, bison, flex, patchelf,
  curl and tar, in addition to Tauri dependencies.
- Windows x64: MSYS2 MINGW64 with make/bison/flex/tar, MinGW toolchain,
  OpenSSL and zlib. `OPALINE_MINGW_PREFIX` points to that build toolchain.

Clients support gzip archives. LZ4/Zstandard-compressed input archives are not
enabled in this minimal recipe. Readline, ICU and interactive psql use are not
needed. PostgreSQL/OpenSSL and applicable bundled dependency notices are packaged.

Client updates arrive with new app builds. Review PostgreSQL security releases,
update pins, rebuild and run the matrix. The build cache tracks the OpenSSL version
and client signing identity, but release CI should use clean, maintained runners.
This is not a claim of byte-for-byte reproducible builds.

For macOS distribution, sign client executables/libraries **before** manifest
generation using `OPALINE_CLIENT_SIGNING_IDENTITY`, then sign/notarize the app.
Do not re-sign client files after the manifest is embedded: hashes will change.
Tauri resources are used rather than sidecar auto-signing for that reason; verify
the final signed artifact. Development clients use ad-hoc signatures.
Build releases on the oldest supported OS and inspect dependency deployment
targets. This local development package was built on macOS 26 arm64; its clients
and OpenSSL have a macOS 26 minimum. It is not an older-macOS distribution artifact.
The macOS 14 CI recipe and public signing/notarization still need real acceptance.

## Verification performed locally

- `npm run check`: 56 frontend tests, type checks, lint, formatting, production build.
- Rust: 30 default tests passed; 11 opt-in tests are not included in that count.
- `cargo clippy --locked --all-targets -- -D warnings`: passed.
- `node scripts/test-bundled-postgres.mjs`: all five PostgreSQL majors passed.
  Per major: 4 backup tests, 1 native TLS test, 5 session tests — 50 successful
  integration test executions. The credential-store integration was not repeated.
- Each matrix run copies clients to a temporary path containing spaces, resolves
  the automatic engine using the actual server major, and executes clients with
  the isolated environment. It does not discover system PostgreSQL tools.
- Real custom + SQL dump/restore, data precision/NULL/Unicode, failure preservation,
  cancellation, restricted psql, explicit CA, wrong-host/untrusted-CA rejection,
  session password retention and multi-session isolation were exercised.
- Test containers use random loopback ports, never 5432. All containers, databases
  and private test keys created by the runner are removed; the user's MMO database
  and application configuration/Keychain were untouched.
- `npm run tauri build -- --debug --bundles app`: succeeded. Packaged clients
  occupy about 35 MiB. All 15 packaged executables were also checked with an empty
  environment and their files compared to the embedded-manifest source.
- Browser UI: synthetic fixture at 1280×720, enabled Create backup focused on open,
  no tool/password setup in the main flow, collapsed Advanced, no dialog horizontal
  overflow; footer stays visible. Browser checks are not native dialog automation.

Repeat the matrix with Docker installed on the development machine:

```sh
npm run desktop:prepare
node scripts/test-bundled-postgres.mjs
```

CI now includes client preparation, desktop packaging and an Ubuntu backup/TLS
matrix job. These remote jobs have not been run here; Windows/Linux binaries,
Intel Macs, older macOS and signed installer upgrade flows are not locally verified.
Existing [P0 release blockers](p0-verification.md) remain, including the known
RustSec glib finding. This change does not certify the whole app for public beta.
