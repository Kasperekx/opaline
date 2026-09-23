# Database diagrams

Open **Connection actions → Database diagram**, use the command palette, or choose
**Show in diagram** from a table's explorer menu. One diagram tab belongs to one
connection and database; it never combines environments.

The first visit reads PostgreSQL catalog metadata in one statement and arranges
all accessible user tables. No table records are read and no schema changes are
made. Tables without foreign keys are included. Relationships come from declared
foreign keys, never guesses based on column names. Composite relationships are
one edge; the inspector lists paired columns in constraint order.

## Navigation

- Search by table or schema name; Enter selects the first match.
- Drag tables to arrange them. Use the trackpad to pan/pinch or the zoom buttons.
- Select a table and choose **Focus relationships** to see its direct neighbors.
- **Show all** restores the full scope; the schema selector narrows the view.
- Double-click a table to open its data, or use **Open table** in its details.
- Select a relationship to inspect its columns and referential actions. **Edit
  relationship** opens the source table's shared structure editor.
- Pointer selection animates that connection with a subtle classic dashed flow;
  other connections stay still. It represents selection, not live database traffic.
  Keyboard interaction and reduced-motion preferences disable the animation.
- Tables initially show up to 12 columns; use the details panel to expand them.
  Edges involving a hidden column attach to the footer, not an unrelated column.
- Partitions are grouped under their parent by default. Enable **Show partitions**
  to inspect individual partition tables. The footer always shows visible/total counts.
- Positions and viewport are stored locally per profile, endpoint and database.
  Refresh preserves existing positions; new tables are placed beside them.
  **Arrange** explicitly resets positions and fits the graph.

The canvas does not execute schema changes directly. Use **New table**, or select
a table and open its details for **Edit structure** and **Drop table…**. These open
the shared [structure editor](table-structure-editor.md) in a separate document.
Returning to the diagram retains its viewport; successful changes refresh metadata.
Delete does not remove a table or relationship. Keyboard
selection and navigation remain immediate. Pointer-driven camera transitions
respect reduced-motion preferences.

## Implementation and current limits

- React Flow renders the graph; ELK runs automatic layout and initial routing in
  a local Web Worker. Diagram code is lazy-loaded. No cloud service is involved.
- After manual movement, edges use live smooth-step routing. **Arrange** restores
  full automatic routing around tables. Expanding a large node can require Arrange
  to make additional room without silently moving the user's layout.
- Views and system schemas are excluded. Missing table permissions and references
  outside the available graph are reported explicitly.
- The database-wide limit is 2,000 accessible tables, 30,000 columns or 10,000 FKs.
  Above that limit the request fails clearly rather than showing a partial graph.
- Export, drag-to-draw relationships, inferred relationships and schema comparison
  are not included. Create/edit relationships through the shared structure editor,
  with ordered column pairs, referential actions and an explicit SQL review.
- Third-party licenses ship in `public/licenses/` and the built application assets.

## Verification

Automated checks cover graph mapping, composite and cross-schema relationships,
self references, partition grouping, overflow ports, layout persistence, tab
recovery, and a real ELK layout of 500 tables / 300 relationships.

The Rust integration test uses an explicit disposable PostgreSQL instance:

```sh
OPALINE_TEST_POSTGRES_PORT=<test-port> cargo test --manifest-path src-tauri/Cargo.toml diagram_catalog_integration
```

It creates transaction-local fixture schemas and a restricted role, tests catalog
visibility, and rolls everything back. It expects database/user `postgres` and the
test-only password `opaline_test`. Do not point this at a production database.

Browser QA uses `tests/preview.html?scenario=inline` with synthetic metadata.
Native macOS WebView/trackpad acceptance remains a release check.

Verified on 2026-09-22: PostgreSQL 16 in a disposable container, browser layouts
at 1440×960 and 800×640, search/focus, keyboard FK inspection, and position
preservation after refresh. The 500-table / 300-relationship ELK test completed
in approximately 0.55 seconds on the development machine (not a rendering FPS claim).

On Node 26, run the existing Vitest/jsdom suite with
`NODE_OPTIONS=--no-experimental-webstorage npm run check` so Node's experimental
global storage does not shadow jsdom's browser storage.
