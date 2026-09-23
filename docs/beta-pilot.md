# Private macOS pilot

Scope is frozen after enum editing: PostgreSQL only, macOS first. This is an
unsigned, invitation-only test build, not a signed/notarized public release.
No Kafka, Docker logs, SSH or additional providers in this candidate.

## Before sending a build

- Record exact source identity, architecture, OS used to build, package SHA-256
  and known limitations. A dirty checkout must never be labeled as a clean HEAD.
- Verify packaged PostgreSQL clients and complete the relevant acceptance gates
  in [beta-candidate.md](beta-candidate.md).
- Owner chooses a private security-reporting channel and tests it end to end.
- A second Mac must pass install, launch and packaged backup/restore before a
  wider pilot. Record its macOS version and processor; do not infer minimum OS.
- Owner approves recipients and delivery. Do not upload user SQL, credentials,
  app-data directories or dumps with the build.

## Preparing the GitHub release draft

The initial draft from commit `12dc925` is rejected: its main executable had only
a linker ad-hoc signature, without a complete application resource seal. Do not
distribute its DMG (SHA-256 `195387b863df85b6505d9eac4bb13371c0c2910ab47d62a91bbc327301c1b005`).
The corrected configuration explicitly signs the application ad-hoc before DMG
creation. Both macOS CI jobs now verify the full bundle signature, even without
`--release`, and run a native regression test for missing/tampered resource seals.
Bundled PostgreSQL hashes must still match; signing must not rewrite those tools.
Ad-hoc signing is not Developer ID signing or notarization. Browser-downloaded
installer acceptance remains necessary before replacing the rejected draft.

The first candidate is `0.1.0-beta.1`, Apple Silicon only. In GitHub Actions,
open **Quality gates → Run workflow**, select `main`, and enable **Prepare an
unsigned Apple Silicon beta draft after all quality gates pass**.

All quality jobs must pass before the draft job downloads the Apple Silicon
artifact from that same run. It checks the source commit, version, architecture,
size and SHA-256, then attaches the DMG, `build-info.json` and `SHA256SUMS.txt`
to a **draft prerelease**. Existing releases are not overwritten. Ordinary pushes
run tests but do not create or publish releases.

The draft is not a public download. Complete the acceptance gates above, update
the release notes with the tested macOS range and remaining limits, and obtain
owner approval before publishing. Then add the verified download link to README.

## Suggested invitation (not sent)

Hi! I'm testing an early macOS build of Opaline, my open-source PostgreSQL client.
Would you be up for trying it with a disposable database? It isn't signed by Apple
yet, and I wouldn't use it with production data. I'd love to know where you get
stuck, especially connecting, editing a few rows and restoring a backup. I'll send
the exact build details and known issues before you install anything.

## Session sheet — copy once per tester

Build/source identity: ___  Package SHA-256: ___
macOS: ___  Apple Silicon / Intel: ___  PostgreSQL: ___  Date: ___

Use synthetic data only. Follow [tester-guide.md](tester-guide.md).

| Task | PASS / FAIL / NOT RUN | Friction, time, redacted issue |
| --- | --- | --- |
| Install and launch without developer tools | NOT RUN | |
| Create two profiles; switch without losing SQL drafts | NOT RUN | |
| Edit, duplicate, delete; inspect and save pending changes | NOT RUN | |
| Cause a UNIQUE conflict; preserve and correct the draft | NOT RUN | |
| Create/use an enum; rename/add values through SQL review | NOT RUN | |
| Read-only profile rejects writes; production warning names target | NOT RUN | |
| Backup and restore to a new database; compare source and target | NOT RUN | |
| Close tab/window and quit with pending work | NOT RUN | |
| Reopen; saved settings remain and writes are not replayed | NOT RUN | |

Ask: What was unclear? What did you expect to happen? Would this fit one real
task in your workflow? Avoid requesting real database contents or telemetry.

## Exit criteria

Start with one independent installation, then 5–10 willing testers. Any confirmed
data-loss, wrong-target write, credential leak or silently uncertain commit blocks
distribution until fixed and retested. Other failures get explicit severity and
reproduction steps. Completion requires recorded results, not just invitations.
