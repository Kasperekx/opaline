# Native interaction acceptance — September 23, 2026

Local macOS 26.3 / ARM64, release-mode `Opaline Acceptance.app`, identifier
`app.opaline.acceptance20260923`. This isolated QA variant uses its own app data,
not the user's running development app. Source is an uncommitted working tree;
this is not certification of a release commit, signed installer or Intel build.

Fixtures: owned PostgreSQL 17 container on loopback port 50341, `teams` and
`people` tables, two synthetic people, one foreign key, UNIQUE name and a JSONB
number larger than JavaScript's safe integer range. No product database was used.
Interactions below were performed in the native WebKit app, not the browser fixture.

## Observed results

| Flow | Result |
| --- | --- |
| Empty library → workspace → profile | PASS: keyboard submission creates workspace; Save disabled until successful connection test |
| Profile without remembered password | PASS: saving returns to library; connect requests session-only password |
| SQL execution | PASS: default query returns expected database/user/time; connected status restored |
| Inline table edit | PASS: double-click, Enter stages; Cmd+S saves; server query confirms `Ada QA` |
| JSON edit | PASS: expanded editor, Cmd+Enter stages, Cmd+S saves; server confirms `9007199254740993` unchanged and boolean changed |
| UNIQUE failure | PASS: error shown, draft and dirty indicator retained; no success state |
| Close after failed save | PASS: Cmd+W opens protection; Save and continue fails and keeps the dialog/work |
| Correct failed draft back to original | PASS: pending change clears without a database write |
| Cmd+W and Cmd+Q with pending row | PASS: both show protection; Keep working preserves draft |
| Cmd+Shift+[ | PASS: switches from table to query without closing either |
| Close all document tabs | PASS: query then table close; connected empty view and New query focus; another Cmd+W does not exit |
| Diagram | PASS: two tables, one declared FK, selection and details; opens structure editor |
| Structure change | PASS: rename requires Review SQL then Apply; table opens with new name and explorer refreshes |
| Smaller native window | PASS for tested resize: explorer becomes dismissible overlay; error and save actions remain accessible; not a full minimum-size/font/DPI qualification |
| Clean Cmd+Q | PASS: exits once the draft is resolved |
| Restart and reconnect | PASS: saved profile remains, session-only password is requested again, document tabs and saved data return |
| Quit with unfinished structure | PASS: protection identifies structure draft; explicit discard exits without creating the table |
| Create table | PASS: named table plus text column, reviewed CREATE SQL, Apply, explorer update and empty-table view |
| First row with nullable text | PASS after fix: NULL toggle stays in editor, text input receives focus, Enter/Cmd+S saves; database confirms `1|hello qa` |

## Fix discovered during native inspection

| Before | After | Why |
| --- | --- | --- |
| React Flow's accessibility help promised Delete would remove a relation, despite `deleteKeyCode={null}` | Explicit table/relationship instructions describe selection, inspection and reviewed schema changes | Assistive help must describe real behavior, not library defaults; follows `emil-design-eng` interaction/accessibility guidance |
| Native text services capitalized a newly entered column name from `body` to `Body` | App document disables automatic capitalization/correction | Identifiers and database values must remain exactly as entered |
| Clicking NULL in a new row blurred/staged the cell and closed its editor | Internal button presses retain editor focus; changing NULL/DEFAULT to a value focuses the input | Continue typing immediately without reopening the editor; covered by a regression test |

The diagram wording was confirmed in the rebuilt native accessibility tree.
The capitalization fix was repeated with the same native input sequence: both
the field and generated SQL retained lowercase `body`.
The NULL-focus fix was verified in the rebuilt native app: focus moved from the
toggle to the enabled input without closing the editor. The first row saved
successfully. The QA app was quit and the owned disposable database container
removed after verification. The separate QA app/profile remain available locally;
its former ephemeral database endpoint is no longer running.

Post-change `npm run check`: 161 frontend tests, 4 script tests, typecheck,
lint, formatting and production web build passed.

## Not covered by this run

This is a first native pass, not the entire B01–B09 acceptance. Still required:
multi-session/production/read-only UI paths, index/FK creation and
deletion UI, failed-DDL UI, all dialog focus-return paths, both tab directions,
window-close/menu/Dock Quit, Keychain denial, VoiceOver, full 760×560/enlarged-font
checks and further persistence cases. Network/sleep/performance and clean-machine
distribution remain separate gates. Existing automated tests are not substituted
for these native checks. No Apple account or signing work was performed.
