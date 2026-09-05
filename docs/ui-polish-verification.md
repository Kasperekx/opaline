# SQL formatting and connection switcher UI

Verified on 2026-09-05.

## Changes

- Successful SQL formatting is silent. Editor undo, native format validation,
  operation locking and protection against overwriting a changed draft remain.
- Notices now live inside the workspace content row. They cannot displace the
  editor, results or status bar into implicit grid rows. Long/multiple notices
  have a bounded scroll area; actionable errors remain visible.
- Connection rows use three consistent columns and a 12 px gap. The separate
  checkmark is removed; the current row uses a subtle border and a text status.
- On narrow screens, environment and session status move below the identity.
  Long labels truncate with full text available on hover. Search and footer
  remain outside the scrolling list. Styling is owned by the connections feature.

## Automated checks

`npm run check` passes: TypeScript, ESLint, Prettier, 61 Vitest tests and the
production frontend build. Five regression tests were added for silent
formatting, errors/retry, concurrent edits, consistent row structure, keyboard
selection and disabled actions.

`npm run tauri -- build --debug --bundles app` also passes and produces the
updated macOS debug bundle at `src-tauri/target/debug/bundle/macos/Opaline.app`.

## Browser verification

Used only synthetic profiles and mocked IPC; no real databases or credentials.

- Full app preview at 1280 × 720: format updates the SQL without a success
  notice; Cmd+Z restores the original single-line query.
- Malformed SQL leaves the draft intact and shows a compact 58 px error strip.
  Editor, results and bottom status bar remain visible; Dismiss works.
- A 43-profile switcher has measured 12 px row gaps, aligned right edges and
  no horizontal row overflow. Searching, connecting to another test profile
  and returning to the existing session preserve the query draft.
- Isolated switcher at 360 × 640 and 760 × 480: long names, read-only staging
  and production badges, stacked metadata, bounded scrolling and visible footer.

Reproduce with `npm run dev` and `/tests/preview.html?scenario=many` or
`/tests/connection-switcher.preview.html`. Preview entries are not included in
the production build.

Screenshots: [editor](screenshots/ui-polish-editor.png),
[switcher](screenshots/ui-polish-switcher.png),
[responsive](screenshots/ui-polish-responsive.png).

Browser checks do not replace native Windows/Linux WebView testing. Those
platforms were not exercised in this UI pass.
