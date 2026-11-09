# Namespace Schema CRUD Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** End-to-end create / rename / drop PostgreSQL namespaces in Opaline.

**Architecture:** Dedicated `NamespaceChange` stack (Rust plan/apply + Tauri IPC + explorer dialog), separate from table `SchemaChange`. Drop defaults to RESTRICT; CASCADE is opt-in with typed confirmation.

**Tech Stack:** Rust/Tauri, React, existing explorer + TableMutationDialog patterns.

## Global Constraints

- Identifier rules: 1–63 UTF-8 bytes, no NUL; reject `pg_*` and `information_schema`
- Never default CASCADE; confirmation string must equal schema name for destructive ops
- Mirror transaction timeouts from schema_changes (25s statement / 5s lock / 30s operation)
- UI copy in English, sentence case, active voice
- Preserve Opaline graphite/amber desktop design system; Emil-style press feedback and ease-out only

---

### Task 1: Rust namespace_changes + list_schemas + commands

**Files:**
- Create: `src-tauri/src/database/namespace_changes.rs`
- Modify: `src-tauri/src/database/mod.rs`, `src-tauri/src/commands/schema.rs`, `src-tauri/src/lib.rs`

### Task 2: Frontend types + API

**Files:**
- Modify: `src/shared/types/structure.ts`, `src/shared/lib/database-api.ts`

### Task 3: NamespaceDialog + Explorer + Workspace wiring

**Files:**
- Create: `src/features/explorer/NamespaceDialog.tsx`
- Modify: `src/features/explorer/Explorer.tsx`, `src/features/query/Workspace.tsx`, `src/features/query/useWorkspace.ts`, `src/features/query/useWorkspaceTabs.ts`
- CSS: reuse `table-mutation-dialog` / add minimal namespace dialog styles if needed

### Task 4: Docs + tests

**Files:**
- Create: `docs/schema-namespace-editor.md`, `tests/namespace-dialog.test.tsx`
- Modify: `docs/features.md`, `docs/tester-guide.md`, `docs/table-structure-editor.md`, `docs/tasks-2026-09-25_22-16.md`
