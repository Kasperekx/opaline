# Contributing to Opaline

Thanks for helping build a database client that stays fast, calm, and useful.

## Before opening a pull request

1. Keep database access inside `src-tauri`; the webview must never connect to
   PostgreSQL directly.
2. Do not add telemetry, accounts, or persistence of credentials without an
   explicit design and security review.
3. Preserve keyboard access, visible focus states, and reduced-motion support.
4. Run `npm run build`, `cargo fmt --check`, `cargo check`, and `cargo test`.

For a substantial feature, open an issue first so that the behavior and scope
can be agreed before implementation.

## Commit style

Use short, imperative summaries such as `Add query cancellation` or
`Improve result grid keyboard navigation`.
