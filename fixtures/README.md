# Demo database fixture

Synthetic PostgreSQL dataset for local Opaline testing.

## File

[`opaline-demo.sql`](opaline-demo.sql) — plain SQL (uses `generate_series`; small on disk, large after load).

## Load into a fresh database

```sh
createdb opaline_demo
psql -d opaline_demo -v ON_ERROR_STOP=1 -f fixtures/opaline-demo.sql
```

Or with explicit connection:

```sh
psql "postgresql://USER@localhost:5432/opaline_demo" -v ON_ERROR_STOP=1 -f fixtures/opaline-demo.sql
```

Requires PostgreSQL **14+** (`gen_random_uuid` via `pgcrypto`).

## What’s inside (approx.)

| Schema | Contents |
| --- | --- |
| `commerce` | 10k customers, 5k products, 50k orders, 150k order lines, enums, JSONB, view |
| `analytics` | 100k events + daily rollups |
| `billing` | ~20k invoices |
| `inventory` | 8 warehouses, ~48k stock rows, low-stock view |
| `empty_lab` | empty schema (namespace UI) |

Also: FKs, indexes, GIN on JSONB, comments.

## Notes

- All data is synthetic (`@opaline.test` emails). Safe to wipe.
- Re-running on a non-empty DB will fail on existing types/tables; use a fresh database.
- Load time is usually under a couple of minutes on a laptop SSD.
