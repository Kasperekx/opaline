# macOS beta — dependency audit scope

2026-09-05. The owner selected macOS for the first beta; Linux and Windows follow later.

The complete lockfile audit still reports [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
in glib 0.18.5, pulled by Tauri's Linux GTK3 graph. The supported fix is glib 0.20+,
which is incompatible with the GTK3 0.18 dependency constraint. No advisory was
ignored, no package version was forged, and no unsafe dependency was patched locally.
This remains a blocker for a future Linux release.

`scripts/audit-rust-target.mjs` combines the full cargo-audit JSON report with
Cargo's locked, platform-filtered dependency graph, walking from the application root.
It fails for vulnerabilities, unsoundness and yanked findings in that graph,
and fails closed if either tool or report is incomplete. Findings outside the
target graph remain visible with `inTarget: false`. This is target selection,
not an advisory-ID allowlist. Tests enforce that a compiled unsound dependency
does fail the gate. Run it separately for each declared release architecture.

Local macOS ARM64 audit: no vulnerability/unsoundness in the compiled graph.
Five unmaintained `unic-*` dependencies remain in the graph through Tauri's URL
pattern stack; these warnings are reported, not described as resolved.
The audit does not cover the C/OpenSSL/PostgreSQL binaries or replace native UI,
installation and code-signing checks. The final beta package needs its own review.

Linux-based PostgreSQL integration jobs test server behavior; they do not publish
a Linux application or qualify a Linux release. macOS package jobs target Apple
Silicon and Intel separately. No release is published automatically.
