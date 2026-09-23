# Opaline Studio

Opaline is a desktop workspace for understanding and working with databases.
The interface should feel like a well-made instrument: predictable, quiet and
precise, without requiring everyone to speak SQL.

## Direction

- A connection library, not a dashboard. Group saved databases by workspace and
  environment; show real destinations and session state, not decorative metrics.
- A native source list, not an icon rail. The connection library starts with a
  workspace sidebar. Compact connection rows are grouped by environment in a
  width-constrained library. Details open on demand in the same accessible dialog
  at every window size; selecting a profile never reflows the list or connects it.
  Open sessions live in the top window bar, separate from document navigation.
- A full-width document workbench. One top bar contains the table navigator,
  document tabs and connection actions. SQL sits above the results, separated by
  a resizable divider. Table data uses the full available document width.
- Graphite surfaces and a restrained amber accent. Navigation, selection and
  commands use amber. Local, staging, production, errors and unsaved changes retain
  separate semantic colors **and text**, so color is never the only signal.
- Stable workspace initials and a restrained highlight in the brand mark create
  identity without illustrations, stock photography or animated decoration.
- Use the operating system's UI font. Monospace belongs to SQL, values and
  addresses. All typography is local; no font requests or external assets.

## Interaction rules

1. Primary work stays visible: connect, filter, run, edit and save changes.
2. Secondary actions live in keyboard-accessible overflow menus. Never hide an
   action merely because the window is narrow. Connection actions also expose
   history and preferences independently of the table navigator.
3. Keep connection, document and table-view navigation visually distinct.
   Switching a connection must retain the existing session and work-safety model.
4. Double-click/F2 edits a cell; Enter stages it. Database writes require explicit
   Save changes. Modified cells, the document tab and the save bar communicate
   pending changes. Production warnings and read-only restrictions are unchanged.
5. Keyboard menus support arrows, Home/End, Escape and focus restoration. Dialogs
   retain their existing native focus trap and cancel handling.
6. The object navigator stays pinned on wide windows and overlays the document
   on compact windows. Browse tables or Cmd/Ctrl+K opens it and focuses search.
   Choosing a table dismisses only the compact overlay. Escape restores the trigger.
   Large tables scroll inside their viewport; action bars stay usable.
7. Respect larger text, compact density and reduced motion. Use short control
   pointer press feedback, not entrance choreography, moving backgrounds or hover
   lifts. Keyboard navigation, shortcuts and tab switching remain immediate.

## Implementation

`src/styles/tokens.css` defines shared surfaces, text and accent colors and text
sizes. `src/styles/controls.css` owns shared controls and
`src/styles/studio.css` owns the workbench, responsive navigator and window bar.
`connection-home.css` owns the workspace shelf and connection library, including
the details dialog, empty states and responsive layouts. `ActionMenu` and
`WorkspaceGlyph` are shared UI primitives. PostgreSQL commands, credentials and
mutation logic are unchanged. The existing session and work-safety hooks remain
the source of truth; presentation components do not duplicate their state.

## Review checklist

- 1440×900: library, editor, data grid, dialogs and connection switching.
- 1024×700: stacked SQL/results, transient object navigator, modal profile details.
- 760×560: minimum supported desktop window; filters, save and menu actions fit.
- Long profile names, many connections, empty workspaces and no search matches.
- Keyboard-only menus and dialogs; visible focus and no lost controls.
- Cell editing, staged changes and successful save using synthetic fixtures only.
- Existing safety, storage, editing, window-drag and connection tests pass.

## Design references

The principles are inspirations, not templates to reproduce. Linear's
[redesign account](https://linear.app/now/how-we-redesigned-the-linear-ui)
emphasizes coherent window chrome, alignment, hierarchy and testing across
different interface states. Airbnb's
[design-language introduction](https://medium.com/airbnb-design/the-way-we-build-511b713c2c7b)
frames its system as unified, universal, iconic and conversational. Here that
means consistent controls, accessible language, a recognizable workspace identity
and feedback that explains what happened without interrupting routine work.
