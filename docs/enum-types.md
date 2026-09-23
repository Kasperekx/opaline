# PostgreSQL enum types

In **New table / Edit table structure**, the column Type picker lists existing
schema-qualified enum types. Open **Enum types** to create a type or stage changes
to an existing type's labels. New draft types also appear in the column picker.
Use **Review SQL → Apply changes**; no edit writes immediately.

This section is part of the table structure draft, not a standalone type browser.
Creating a table can create its enum in the same transaction. An existing table's
editor can apply enum-only changes without changing the table's columns.

Renaming an enum label affects every use of that type across the database, not
only the selected table. Values are case-sensitive and whitespace is significant;
empty labels are valid. Duplicate values and labels over 63 UTF-8 bytes are rejected.
Existing values cannot be deleted or reordered in this UI. New labels append.
Domains over enums and enum arrays do not have specialized editing controls.

PostgreSQL requires committing an addition to an existing enum before the new
label can be used. Apply the enum addition first, then set a column default in a
new draft. A combined attempt is rejected and rolled back, not partially applied.
See [PostgreSQL ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html).

The backend generates quoted SQL from structured drafts, checks existing type OIDs
and labels before/after changes, and verifies selected references are actual enums.
The existing session write guard, transaction rollback, production notice and
uncertain-commit handling apply. A failed apply keeps the draft for inspection.
No automatic write retries. Other sessions must refresh their metadata after DDL.

## UI decisions

| Before | After | Why |
| --- | --- | --- |
| Built-in types only | Enums grouped in the existing Type control | Discoverable without another dialog |
| SQL required for label management | Collapsible, labeled draft section | Advanced controls do not dominate everyday table editing |
| Potential immediate global changes | Shared SQL review and explicit Apply | Makes scope and the write boundary visible |

Uses existing design tokens and native inputs/selects, keyboard focus indicators
and responsive value rows. No new UI library or interaction animation.
