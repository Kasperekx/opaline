import CodeMirror from "@uiw/react-codemirror";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { ChevronRight, Code2, LockKeyhole } from "lucide-react";
import { CopyButton } from "../../shared/components/CopyButton";
import { editorTheme, syntax } from "../../shared/lib/sql-editor-theme";
import { StructureEmpty } from "./StructureDefinitions";

const ddlHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: [tags.keyword, tags.bool, tags.null],
      color: syntax.keyword,
      fontWeight: "600",
    },
    { tag: tags.standard(tags.name), color: syntax.function },
    { tag: tags.special(tags.string), color: syntax.plain },
    { tag: tags.string, color: syntax.string },
    { tag: tags.number, color: syntax.number },
    { tag: [tags.lineComment, tags.blockComment], color: syntax.comment },
    { tag: [tags.name, tags.typeName, tags.operator], color: syntax.plain },
  ]),
);

const ddlTheme = EditorView.theme(
  {
    "&": { fontSize: "12.5px" },
    ".cm-content": {
      padding: "12px 0 24px",
      fontFamily: "var(--font-mono)",
      lineHeight: "21px",
    },
    ".cm-line": { padding: "0 20px 0 0" },
    ".cm-gutters": { paddingLeft: "0", color: "var(--tertiary)" },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "44px",
      padding: "0 18px 0 0",
    },
  },
  { dark: true },
);

const extensions = [
  sql({ dialect: PostgreSQL }),
  editorTheme,
  ddlTheme,
  ddlHighlighting,
];

export function StructureDdl({
  ddl,
  notes,
  onOpenQuery,
}: {
  ddl: string | null;
  notes: string[];
  onOpenQuery: (sql: string) => void;
}) {
  return (
    <div className="structure-ddl">
      <div className="structure-ddl-toolbar">
        <span className="structure-ddl-title">
          SQL definition
          <small>
            <LockKeyhole size={11} aria-hidden="true" /> Read only
          </small>
        </span>
        {ddl && (
          <div className="structure-ddl-actions">
            <CopyButton value={ddl} label="Copy DDL" />
            <button
              type="button"
              className="toolbar-button structure-ddl-open"
              onClick={() => onOpenQuery(ddl)}
            >
              Open in SQL editor
            </button>
          </div>
        )}
      </div>
      {notes.length > 0 && (
        <details className="structure-ddl-notes" open={!ddl}>
          <summary>
            <ChevronRight size={11} aria-hidden="true" />
            Preview scope & dependencies
            <span className="structure-note-count">
              · {notes.length} {notes.length === 1 ? "note" : "notes"}
            </span>
          </summary>
          <div>
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </details>
      )}
      {ddl ? (
        <div
          className="structure-ddl-editor"
          aria-label="Read-only SQL definition"
        >
          <CodeMirror
            value={ddl}
            height="100%"
            extensions={extensions}
            theme="none"
            editable={false}
            readOnly
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              foldGutter: false,
            }}
          />
        </div>
      ) : (
        <StructureEmpty
          title="DDL preview unavailable"
          description="The structure can still be inspected in the other sections."
          Icon={Code2}
        />
      )}
    </div>
  );
}
