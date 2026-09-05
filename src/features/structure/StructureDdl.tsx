import CodeMirror from "@uiw/react-codemirror";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { Code2, Info } from "lucide-react";
import { CopyButton } from "../../shared/components/CopyButton";
import {
  editorTheme,
  sqlHighlighting,
} from "../../shared/lib/sql-editor-theme";
import { StructureEmpty } from "./StructureDefinitions";

const extensions = [sql({ dialect: PostgreSQL }), editorTheme, sqlHighlighting];

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
        <span>
          <Code2 size={16} /> Structure DDL <small>Read only</small>
        </span>
        {ddl && (
          <div>
            <CopyButton value={ddl} label="Copy DDL" />
            <button
              type="button"
              className="toolbar-button"
              onClick={() => onOpenQuery(ddl)}
            >
              <Code2 size={14} /> Open in SQL editor
            </button>
          </div>
        )}
      </div>
      <details className="structure-ddl-notes" open={!ddl || notes.length > 1}>
        <summary>
          <Info size={15} /> Structure preview · scope and dependencies
        </summary>
        <div>
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </details>
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
        />
      )}
    </div>
  );
}
