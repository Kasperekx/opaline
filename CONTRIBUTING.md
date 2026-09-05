# Contributing to Opaline

Thanks for helping build a database client that stays fast, calm, and useful.

## Before opening a pull request

1. Keep database access inside `src-tauri`; the webview must never connect to
   PostgreSQL directly.
2. Do not add telemetry, accounts, or persistence of credentials without an
   explicit design and security review.
3. Preserve keyboard access, visible focus states, and reduced-motion support.
4. Use Node 22.13+ (or 24+) and the pinned Rust toolchain. Run `npm run check`,
   `cargo fmt --manifest-path src-tauri/Cargo.toml --check`,
   `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`,
   and `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`.
5. Database integration tests must use a disposable PostgreSQL server. See
   [P0 verification](docs/p0-verification.md). Never point these tests at a real product database.
6. Run `cargo audit --file src-tauri/Cargo.lock --deny unsound` and `npm audit`.
   Do not add advisory exceptions merely to obtain a green build.

For a substantial feature, open an issue first so that the behavior and scope
can be agreed before implementation.

## Commit style

Use short, imperative summaries such as `Add query cancellation` or
`Improve result grid keyboard navigation`.
