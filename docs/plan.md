# Improvements plan

## Active

### Resizable object navigator (2026-09-25)

Wire existing `explorerWidth` layout state to a pinned-navigator `ResizeHandle` and `--navigator-width` on the application shell.

- Session plan: `docs/plan-2026-09-25_22-56.md`
- Tasks: `docs/tasks-2026-09-25_22-56.md`
- Implementation plan: `docs/superpowers/plans/2026-09-25-navigator-resize.md`

### Namespace schema CRUD (2026-09-25)

Allow create / rename / drop of PostgreSQL schemas (namespaces) end-to-end.

- Spec: `docs/superpowers/specs/2026-09-25-namespace-schema-crud-design.md`
- Session plan: `docs/plan-2026-09-25_22-16.md`
- Tasks: `docs/tasks-2026-09-25_22-16.md`
- Approach: dedicated `NamespaceChange` stack; explorer dialog; RESTRICT default, CASCADE opt-in

## Later / out of scope for this slice

- Schema owner & ACL editing
- Move tables between schemas
- Schema comparison / diff tooling
- Product-level `search_path` switching
- Overlay navigator resize / collapse-to-icons
