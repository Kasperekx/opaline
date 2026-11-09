# Opaline — application design guidelines

Opaline is a desktop workspace for understanding and working with databases.
The interface should feel like a well-made instrument: predictable, quiet and
precise, without requiring everyone to speak SQL.

This is the canonical UI contract for the **desktop application**, not the
marketing website. Use it for new screens, refactors and design reviews. Existing
code can contain legacy exceptions; do not copy an old component merely because
it is nearby. Prefer the shared primitives and tokens listed below.

## Direction — Opaline Native (dark)

Opaline should feel like a Mac app Apple could have shipped: calm surfaces,
real materials, immediate feedback, and safety you notice before you read it.
The approved mockups for every screen live in the "Opaline — nowy kierunek"
design canvas; this document is the contract they encode.

- **Native first.** System font (SF Pro), 13pt body, sentence-case labels,
  capsule toolbar controls and segmented controls, AppKit-style menus with an
  accent-filled highlight. Behave the way macOS already taught people.
- **A window, not a web page.** On macOS the window is transparent with the
  native `sidebar` vibrancy material (`tauri.conf.json` → `windowEffects`) and
  an overlay title bar; the traffic lights sit inside the inset sidebar. Other
  platforms and the browser preview use the solid `--window` colour.
- **Inset glass sidebar, solid content.** The sidebar is an inset source list
  (8px from the window edge, 12px radius). Its top is a drag region with room
  for the traffic lights, then the **session pill** — the current connection
  with workspace, environment and access. The pill's menu lists open sessions,
  opens another connection, returns to the library and disconnects. There is no
  separate top session bar.
- **Unified toolbar.** The content column starts with a 52pt toolbar holding the
  document tabs as capsules (active = raised capsule), the command palette, the
  environment capsule and connection actions. SQL sits above results with a
  resizable divider; table data uses the full width with an optional inspector.
- **Data is the hero.** Finder-style rows: subtle stripes, rounded accent-filled
  selection with white text, tabular figures, SF Mono only for SQL, JSON,
  identifiers in definitions and connection targets.
- **One accent.** Indigo (`--accent-fill` for fills, `--accent` for text/icons).
  Environments keep their own colours **and words**: Local green, Staging
  orange, Production red. Colour is never the only signal.
- **Identity.** The opal app icon (`src-tauri/icons/app-icon.svg`) is the only
  gradient in the interface. No illustrations, glows or decorative motion.

## Interaction rules

1. Primary work stays visible: connect, filter, run, edit and save changes.
2. Secondary actions live in keyboard-accessible menus. Never hide an action
   merely because the window is narrow.
3. Keep connection (session pill), document (capsule tabs) and table-view
   (segmented control) navigation visually distinct. Switching a session keeps
   the existing session and work-safety model.
4. Double-click/F2 edits a cell; Enter stages it. Database writes require explicit
   Save changes. Modified cells, the document tab dot and the floating changes bar
   communicate pending changes. Production warnings and read-only restrictions
   are unchanged.
5. Menus support arrows, Home/End, Escape and focus restoration. Dialogs keep
   their native focus trap and cancel handling.
6. The sidebar stays pinned on wide windows and floats over the document on
   compact windows. Cmd/Ctrl+K reveals it and focuses search; ⇧⌘P opens the
   command palette.
7. Respect larger text, compact density, reduced motion, reduced transparency
   and increased contrast.

## Implementation

| File                                         | Owns                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/styles/tokens.css`                      | Colours, materials, shadows, radii, type scale, easing; reduced-transparency and contrast variants                                         |
| `src/styles/controls.css`                    | Buttons, icon buttons, toolbar capsules, segmented capsules, search capsules, environment capsules, menus, sheets, drawers, press feedback |
| `src/styles/studio.css`                      | Window composition: sidebar column, content column, toolbar, capsule tabs, status line                                                     |
| `src/styles/shell/explorer.css`              | The inset sidebar, session pill and object tree                                                                                            |
| `src/features/connections/ShellSessions.tsx` | Open sessions as the chrome sees them (`useShellSessions`)                                                                                 |
| `src/features/explorer/SessionPill.tsx`      | The sidebar session pill and its menu                                                                                                      |
| Feature CSS next to each feature             | Table, SQL, structure, diagram, connections, backup                                                                                        |

PostgreSQL commands, credentials and mutation logic are unchanged by the visual
system. The existing session and work-safety hooks remain the source of truth.

## Visual foundation

Use the semantic tokens; the values below document the palette.

| Role          | Token                                                | Value                                        | Use                                         |
| ------------- | ---------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Window        | `--window`                                           | `#232327` (transparent with native vibrancy) | Behind the sidebar                          |
| Content       | `--bg`                                               | `#1c1c1f`                                    | Documents, editor, grids                    |
| Panel         | `--surface`                                          | `#202024`                                    | Inspector, side panels                      |
| Grouped box   | `--surface-2`                                        | `#2a2a2f`                                    | Inset-grouped rows in panels and sheets     |
| Field         | `--field`                                            | white 7%                                     | Inputs, search                              |
| Label         | `--text`                                             | `#f5f5f7`                                    | Titles, values                              |
| Secondary     | `--muted`                                            | `#98989d` (6:1)                              | Metadata and captions                       |
| Tertiary      | `--tertiary`                                         | `#636366`                                    | Decoration only                             |
| Accent (text) | `--accent`                                           | `#a7a6f0`                                    | Active icons, links, focus                  |
| Accent (fill) | `--accent-fill`                                      | `#5e5ce6`                                    | Selected rows, primary buttons (white text) |
| Accent tint   | `--accent-soft`                                      | indigo 22%                                   | Selected sidebar rows, chips                |
| Danger        | `--danger` / `--danger-fill`                         | `#ff6961` / `#ff453a`                        | Deletion and errors, with explicit wording  |
| Environments  | `--env-local` · `--env-staging` · `--env-production` | `#30d158` · `#ff9f0a` · `#ff453a`            | Always with a label                         |

Materials (`--material-sidebar`, `--material-popover`, `--material-sheet`,
`--material-bar`) are for floating chrome only: sidebar, menus, popovers,
sheets and floating bars. Content stays solid; never stack glass on glass.
Separators are 0.5px (`var(--hairline)`) in `--line`; raised controls carry
`--edge-light`, a thin top highlight.

### Typography and spacing

| Element                       | Baseline                                      |
| ----------------------------- | --------------------------------------------- |
| Body, controls, inputs        | 13px (`--text-md`), system font               |
| Callout / helper text         | 12px (`--text-callout`)                       |
| Captions and section headers  | 11px semibold `--muted`, sentence case        |
| Toolbar title                 | 15px semibold, subtitle 11px `--muted`        |
| Sheet title                   | 17px bold, −0.015em                           |
| Large title (welcome)         | 30px bold, −0.025em                           |
| SQL and technical identifiers | `--font-mono` (SF Mono), editor 13/21         |
| Push button                   | 30px high, 8px radius; primary = accent fill  |
| Toolbar control               | 28–32px capsule                               |
| Sidebar / list row            | 28px, 7px radius                              |
| Sheet                         | 18px radius, 24px inset, footer actions right |

Treat these as a baseline, not a reason to override an existing shared control.
Compact desktop tools may use smaller icon controls with a clear hit target;
touch layouts need larger targets. Keep body copy at normal weight and reserve
medium weight for hierarchy. Honor the large-text preference through tokens.
Do not use fixed-height text containers that clip translations or larger text.

Long names must wrap or truncate with an accessible full value. Confirmation
targets must remain readable and preserve the exact identifier, including spaces.
Do not shorten database names in destructive confirmations. Keep icons restrained:
Lucide, usually 15–18px, with consistent stroke weight and `aria-hidden` when
adjacent text already describes the action.

## Choose the right surface

| Task                                                       | Surface / primitive                               |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Persistent work: SQL, table data, diagram, structure draft | Document tab in the workbench                     |
| Secondary commands for an object                           | Shared `ActionMenu`                               |
| Standalone form, confirmation or review                    | Shared `Sheet` (native `<dialog>`)                |
| A small contextual row operation                           | Existing row-confirmation surface, where suitable |
| Unsaved work or in-flight operation protection             | `WorkSafety`                                      |

`Sheet` (`src/shared/components/Sheet.tsx`, styles in `src/styles/sheet.css`)
is the one modal primitive. Reuse it instead of writing another overlay/focus
trap; `ConnectionDialog` is only a deprecated alias. Feature CSS composes the
body and may refine the sheet from the features layer with plain selectors, but
must preserve native focus containment, background inertness, Escape behavior,
trigger focus restoration and elevation. Never reuse a row-level confirmation
layout for a multi-field form.

### Dialog anatomy

1. **Header:** one action-specific title, close control, optional short context
   (`title`, `subtitle`). Optional `icon` tile with a `tone` (accent, warning,
   danger, local, staging, production) and a trailing `accessory`. Icon sheets
   may pass `showClose={false}` only when the footer has Close/Cancel; the X
   stays available to assistive technology.
2. **Destination:** database/connection and environment for database-changing
   operations. Keep this context visible while the content scrolls.
3. **Body:** a short explanation, labeled fields and only relevant warnings.
4. **Footer:** Cancel before the primary action, aligned right. Back may sit left
   for a review step. Keep actions visible; scroll the body, not the entire app.
   Pass `footer`/`footerStart`, or render `SheetFooter` (`start` slot) inside a
   `<form>` when the actions submit it.

Pick `size`: `small` 480, `medium` 640 (default), `large` 960, or a number for a
custom width (520 for small schema forms, wider for complex connection forms). Constrain width to the viewport with at least 16px clearance;
constrain height with `dvh`. Do not introduce a global dialog size change to fix
one feature. Allow footers to wrap without hiding a command.

- Use real labels; placeholders are examples, not labels. Connect helper text via
  `aria-describedby` without making it part of the input's accessible name.
- Render the current object as text, not as a disabled input that looks editable.
- Prefill and select the name when renaming. An untouched name cannot be submitted.
- Mutually exclusive choices use a radio group with a legend. A checkbox is for
  a true/false setting or acknowledgement, not for switching between two modes.
- Start focus on the first meaningful field or the safe default choice. Restore
  focus when closing. Verify this through the real menu entry point as well.
- During work, disable repeated submission and dismissal and show one progress
  label next to the action. Do not add a second "Working…" banner in the body.

## Mutation and safety patterns

### Create / rename / delete schema

The reference implementation is `features/explorer/NamespaceDialog.tsx`, with
draft and operation logic in `useNamespaceChange.ts` and scoped feature styles.

| Phase   | Create / rename                            | Delete                                                   |
| ------- | ------------------------------------------ | -------------------------------------------------------- |
| Draft   | Enter a name; retain exact existing target | Default to **Only if empty** (`RESTRICT`)                |
| Review  | Show backend-generated SQL; no write yet   | Show SQL, target and deletion consequences               |
| Confirm | **Create schema** / **Rename schema**      | Exact typed name; explicit acknowledgement for `CASCADE` |
| Apply   | One explicit request                       | Destructive button, same request and safety guards       |

**Review SQL is read-only.** Back invalidates the reviewed plan and clears delete
confirmation. Changing the target/session must never reuse a previous plan.
Use specific final labels, not generic "OK", "Submit" or "Apply changes".

`CASCADE` is an explicit opt-in, never the default. Explain that contained data
and dependencies, including objects in other schemas, may be removed. Do not
suggest that a SQL preview is a complete dependency list. Warn separately when
changing the default `public` schema. Do not silently bypass read-only mode,
production safeguards or unrelated pending-work checks.

### Table editing and operation outcomes

- Double-click/F2 enters editing, Enter stages a value, Escape cancels the edit.
  Staged data is not yet saved to the database. Communicate this through changed
  cells, tab state and the contextual save bar, not a permanent instructional banner.
- Unsaved drafts and in-flight requests must be registered with `WorkSafety`.
  Keep view state separate from the backend operation lifecycle.
- A rejected write must preserve the user's draft and explain how to recover.
- An **unknown outcome** is not a failure guarantee: the write may have committed.
  State this explicitly, block automatic retry and direct the user to inspect the
  database. Do not remove the work-risk warning while the unresolved dialog is open.
- Client-side guards are UX, not authorization. Rust remains responsible for
  validation, quoting, access checks and execution.

## Copy, feedback and errors

Application copy is English, concise and specific. Prefer familiar action words
in UI ("Delete schema") while keeping exact technical syntax in SQL (`DROP SCHEMA`).
Name the affected object and describe consequences without alarmist language.

Every error should answer, where known: **what failed, why, and what can I do?**
Use the shared error normalizer rather than `String(error)` or generic "Something
went wrong" messages. Never stringify arbitrary IPC payloads or expose credentials
and row contents in support diagnostics. Do not claim rollback or successful save
unless the backend confirmed it.

- Put field validation next to its field; operation errors stay in the dialog or
  document that owns them. Use `role="alert"` for new errors.
- Keep the draft available after a recoverable failure. Only offer retry when
  safe, and avoid duplicate submissions.
- Use one feedback channel. Formatting SQL does not need a success banner;
  the formatted editor is already the result. Routine selection is not a warning.
- Distinguish loading, empty, no matches, offline, read-only and failed states.
  An empty schema is not an error. Disabled actions need an understandable reason.

## Structure inspector

The Structure view is a read-only metadata inspector, not another dashboard or
an inline schema editor. Use one compact object header with schema, table, owner
and an optional comment. Keep **Edit structure** and refresh in that header;
editing still follows the separate review-and-apply workflow.

- Use the shared keyboard-accessible `ViewTabs` for Columns, Indexes, Foreign keys,
  Constraints and DDL. This second navigation level uses quiet filled selection
  and full item counts, distinct from the parent Data/Structure underline.
- Present metadata as aligned, full-width tables with sticky headers. Names and
  SQL expressions are selectable; use monospace for definitions and identifiers.
  Keep absence (`—`), nullability, primary keys and validation explicit.
- Filter metadata locally in the current subtab. Keep total counts in the tabs,
  show the filtered count by the search field, and distinguish no matches from
  genuinely empty metadata. Clear restores focus to the search field.
- Indexes, constraints and foreign keys share one SQL disclosure pattern: an
  accessible per-row toggle expands the exact definition across the full table
  width, with an explicit copy action. Do not make the whole row clickable.
- Relationships show source → target with column names, direction, referential
  actions and validation. Both table endpoints can be opened deliberately.
- DDL uses the existing read-only SQL editor, copy and open-in-editor actions.
  Scope/dependency notes are available in a disclosure; opening or copying SQL
  never runs it.
- Keep horizontal overflow inside the metadata pane at narrow window sizes;
  never squeeze identifiers into unreadable columns or overflow window chrome.
- During refresh, keep the previous snapshot. Label it if refresh fails and offer
  Retry. Never show another relation or session's snapshot under a new heading.

Implementation: `src/features/structure/`; regression coverage:
`tests/structure-inspector.test.tsx`.

## Keyboard, accessibility and motion

- Use native buttons, fields, radio groups and dialogs. Icon-only buttons need an
  accessible name. Every essential action must work without a mouse.
- Preserve the visible focus ring (3px `--accent-line`, 1px offset).
  Never remove focus merely to make a screenshot cleaner.
- Tab stays within a modal. Escape closes only when safe. Do not make backdrop
  clicks discard a database-changing draft accidentally.
- Menus support arrows, Home/End and Escape; returning from an action restores a
  useful trigger. Do not intercept text-editing shortcuts outside their scope.
- Use color with labels/icons, check readable contrast, and keep error copy legible
  at normal and large-text sizes.
- Routine hover/colour feedback is about 150ms. Pointer press feedback scales to
  `.97` on pointer-down (120ms, strong ease-out) for fine pointers only. Keyboard,
  tab, row selection, cell navigation and the command palette are immediate.
- Menus and popovers enter in ~140ms from their trigger (scale .96 → 1, opacity);
  sheets ~240ms. Exits are faster than entrances. With reduced motion, use
  cross-fades only.
- Animate specific properties, never `transition: all`. Avoid layout-moving effects
  and permanent `will-change`. Respect `prefers-reduced-motion`.
- Do not add entrance choreography to routine dialogs or lists. A spinner is
  operation feedback, not a reason to animate the entire form.

## Code ownership and reuse

- **Tokens:** `src/styles/tokens.css`.
- **Shared controls and elevation:** `src/styles/controls.css`.
- **Window/workbench composition:** `src/styles/studio.css`, `src/styles/shell/`.
- **Open sessions in the chrome:** `ShellSessions.tsx`, `SessionPill.tsx`.
- **Sheets (modal dialogs):** `src/shared/components/Sheet.tsx`,
  `src/styles/sheet.css`.
- **Menus:** `src/shared/components/ActionMenu.tsx`.
- **Session destination:** `SessionContext` and `EnvironmentBadge`.
- **Pending work:** `src/shared/safety/WorkSafety.tsx`.

Keep feature selectors scoped (for example `.namespace-dialog`). Do not add global
`input`, `label`, `button` or `dialog` rules to fix a local screen. Remove obsolete
feature styles when replacing a layout; do not pile overrides onto legacy CSS.
Respect the existing stylesheet import order and verify computed styles in-browser.

Separate presentation from mutation state when it improves readability, but do not
build a configurable form framework for three fields. Reuse the native dialog and
existing operation lock. No new dependency is needed for a basic form or confirmation.
UI changes must not alter database safety semantics to simplify the screen.

## Review checklist

- 1440×900: library, editor, data grid, dialogs and connection switching.
- 1024×700: stacked SQL/results, transient object navigator, modal profile details.
- 760×560: minimum supported desktop window; filters, save and menu actions fit.
- Long profile names, many connections, empty workspaces and no search matches.
- Keyboard-only menus and dialogs; visible focus and no lost controls.
- Cell editing, staged changes and successful save using synthetic fixtures only.
- Existing safety, storage, editing, window-drag and connection tests pass.
- Small forms: default, valid, long name, review, Back, busy, rejection, unknown
  outcome, read-only and offline. Delete: RESTRICT default, CASCADE acknowledgement,
  exact name, public-schema warning, visible destination and reachable footer.
- Test by opening the actual UI, not only by reading JSX. Inspect at normal and
  large text sizes; capture evidence with synthetic data, never private records.
- Before merging: scoped component tests, `npm run typecheck`, `npm run lint` and
  `npm run build`. Run the wider safety suite for any mutation-related change.

### Definition of done for a UI change

The feature reuses established primitives, has no new accidental palette, works
with mouse and keyboard, fits supported window sizes, covers its error/loading/
empty states, preserves work-safety rules, and has been visually inspected. Update
this document when deliberately introducing a new reusable pattern; do not let
an isolated feature quietly define a second design system.

## Design references

The principles are inspirations, not templates to reproduce. Linear's
[redesign account](https://linear.app/now/how-we-redesigned-the-linear-ui)
emphasizes coherent window chrome, alignment, hierarchy and testing across
different interface states. Airbnb's
[design-language introduction](https://medium.com/airbnb-design/the-way-we-build-511b713c2c7b)
frames its system as unified, universal, iconic and conversational. Here that
means consistent controls, accessible language, a recognizable workspace identity
and feedback that explains what happened without interrupting routine work.
