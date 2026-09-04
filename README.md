# Opaline

Opaline is a calm, open-source PostgreSQL workspace built with Tauri 2, Rust,
React, and TypeScript. The project is currently an early alpha.

The working name is provisional. The product direction is not: a fast,
local-first database client with a precise interface and no required account.

## What works

- PostgreSQL connections over plain TCP or verified TLS
- in-memory credentials for the active session
- schema, table, view, and column discovery
- SQL editing with PostgreSQL syntax highlighting
- multi-statement query execution
- tabular results with a configurable safety limit (500 rows in the UI)
- macOS, Windows, and Linux project configuration through Tauri 2

## Stack

- **Desktop shell:** Tauri 2
- **Database core:** Rust, `tokio-postgres`, Rustls, platform certificate verifier
- **Interface:** React 19, TypeScript, Vite, CodeMirror 6
- **Icons:** Lucide

The frontend invokes a deliberately small set of Rust commands. PostgreSQL
credentials stay in Rust memory for the lifetime of the connection and are not
written to disk. There is no Opaline server, user account, or telemetry.

## Development

Prerequisites are the standard [Tauri 2 platform dependencies](https://v2.tauri.app/start/prerequisites/),
Node.js 20+, and Rustup. The repository pins Rust 1.88 through
`rust-toolchain.toml`.

```bash
npm install
npm run tauri dev
```

Useful checks:

```bash
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test
```

## Security notes

Opaline executes SQL using the privileges of the connected PostgreSQL user.
Until transaction controls, query cancellation, and read-only connection modes
land, use a least-privileged database role when connecting to important data.

TLS `prefer` and `require` modes validate the server using the operating
system's certificate verifier. `disable` is intended for trusted local
development only.

## Near-term roadmap

1. encrypted connection profiles backed by the operating system keychain
2. query cancellation, transactions, and read-only safeguards
3. data editing and table structure views
4. saved queries, history, and multiple query tabs
5. SSH tunnels and custom CA certificates
6. signed release builds for macOS, Windows, and Linux

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before proposing a large change.

## License

MIT © 2026 Opaline contributors
