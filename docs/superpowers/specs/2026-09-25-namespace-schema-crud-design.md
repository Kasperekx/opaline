# Namespace schema CRUD — design

**Date:** 2026-09-25  
**Status:** approved / implemented  
**Product:** Opaline (PostgreSQL desktop client)

## Problem

Opaline can create/rename/drop **tables** via the structure editor (`SchemaChange`), but cannot manage PostgreSQL **namespaces** (`CREATE` / `ALTER … RENAME` / `DROP SCHEMA`). Explorer schema folders are derived from objects only, so empty schemas are invisible.

## Goals

End-to-end support for:

1. **Create** schema  
2. **Rename** schema  
3. **Drop** schema with **RESTRICT** (default) or **CASCADE** (explicit)

Full stack: Tauri commands + explorer UI + SQL preview + confirmation + post-apply refresh.

## Non-goals (YAGNI)

- Change schema owner / ACL  
- Move tables between schemas (`ALTER TABLE … SET SCHEMA`)  
- Schema comparison / migration tooling  
- Editing `search_path` as a product preference  
- Dropping or renaming system catalogs (`pg_*`, `information_schema`)

## Naming

Keep existing `SchemaChange` = **table structure**.  
New types/commands use **namespace** wording to avoid confusion:

- `NamespaceChange`, `NamespacePlan`  
- `list_schemas`, `preview_namespace_change`, `apply_namespace_change`

## Backend

### Module

New: `src-tauri/src/database/namespace_changes.rs`  
Mirror safety stack from `schema_changes.rs`:

- Identifier validation (1–63 UTF-8 bytes; reject `pg_*`, `information_schema`, NUL)  
- `quote_identifier()` for all emitted SQL  
- Transaction: `BEGIN` + `SET LOCAL statement_timeout` / `lock_timeout`  
- `SET LOCAL search_path = pg_catalog` before DDL  
- Session `begin_operation` gate (30s)  
- `ChangeError { kind: "rejected" | "unknown" }` on apply

### Commands (`commands/schema.rs` or new `commands/namespace.rs`)

| Command | Behavior |
|---|---|
| `list_schemas` | Query `pg_namespace` (exclude `pg_toast%`, `pg_temp%`, `pg_catalog`, `information_schema`). Return name (+ optional OID). Empty schemas included. |
| `preview_namespace_change` | Pure plan → `{ sql, destructive }` |
| `apply_namespace_change` | Execute plan; require confirmation string when destructive |

### `NamespaceChange` shape

```text
kind: "create" | "rename" | "drop"
name: string              // target name (create) or current name (rename/drop)
newName?: string          // rename only
dropMode?: "restrict" | "cascade"  // drop only; default restrict
```

### Generated SQL

- Create: `CREATE SCHEMA "name"`  
- Rename: `ALTER SCHEMA "name" RENAME TO "newName"`  
- Drop restrict: `DROP SCHEMA "name" RESTRICT`  
- Drop cascade: `DROP SCHEMA "name" CASCADE`

### Safety rules

- **Create / rename:** reject reserved / invalid names; rename rejects if `newName` collides (Postgres will also fail — surface cleanly).  
- **Drop:** `destructive = true` always. Confirmation must equal the schema name exactly.  
- **CASCADE:** additionally require `dropMode === "cascade"` in the payload; UI must opt in (checkbox). Never default to CASCADE.  
- **`public`:** allowed to rename/drop with the same typed confirmation; UI shows an extra warning (not a hard ban).  
- No preflight dependency listing in v1 (Postgres RESTRICT error message is enough; CASCADE warning text explains consequences).

## Frontend

### Explorer

- Load schemas via `list_schemas` (merge with object tree so empty schemas appear as folders).  
- Header / connection actions: **New schema…**  
- Schema folder context menu:
  - Rename schema…  
  - Drop schema…  
  - (existing) New table… stays

### Dialog (shared for create / rename / drop)

Lightweight modal (not a full document tab):

1. Fields for name / new name / drop mode  
2. **Review SQL** → `preview_namespace_change`  
3. Show SQL in `<pre>`  
4. If destructive: type schema name to enable Apply; CASCADE requires checked “I understand this removes all objects in the schema”  
5. **Apply** → `apply_namespace_change`  
6. Pending-work / operation-lock / read-only gates (same as table structure)

### Post-apply

- `refreshObjects()` + refresh schema list  
- Refresh completion catalog + diagram  
- Rename: update open tabs whose `schema` matched old name  
- Drop: close tabs for objects in that schema (tables/structure); leave free SQL tabs intact

## Docs & tests

- New `docs/schema-namespace-editor.md` (user-facing scope/safeguards)  
- Link from `docs/features.md` and `docs/tester-guide.md`  
- Rust: unit/integration tests for plan SQL + apply create/rename/drop restrict + cascade confirmation rejection  
- Frontend: dialog staging, review invalidation, destructive + CASCADE gates

## Success criteria

- User can create an empty schema and see it in explorer without creating a table first  
- User can rename a schema and open tabs follow the new name  
- Drop RESTRICT fails cleanly when objects exist  
- Drop CASCADE only after checkbox + typed name; preview shows `CASCADE`  
- No regression to table structure editor flows
