import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { PostgreSQL, sql, type SQLNamespace } from "@codemirror/lang-sql";
import { keymap, EditorView } from "@codemirror/view";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  editorTheme,
  sqlHighlighting,
} from "../../shared/lib/sql-editor-theme";
import { primaryModifierLabel } from "../../shared/lib/platform";
import type { QueryExecutionError } from "../../shared/types/database";
import {
  diagnosticAt,
  setSqlDiagnostic,
  sqlDiagnostics,
} from "./sql-editor-diagnostics";
import type { QuerySubmission } from "./useWorkspace";

type SqlEditorProps = {
  schema?: SQLNamespace;
  value: string;
  /** Last run's error; `position` is a UTF-16 offset into this document. */
  error: QueryExecutionError | null;
  /** True while this tab's SQL is executing; clears inline diagnostics. */
  running?: boolean;
  onChange: (value: string) => void;
  onRun: (submission: QuerySubmission) => void;
};

export type SqlEditorHandle = {
  getSubmission: () => QuerySubmission | undefined;
  replaceDocument: (sql: string) => void;
  /** Moves the caret to the last error and shows its inline diagnostic. */
  revealError: () => void;
};

const placeholder = `Write SQL — ${primaryModifierLabel}↩ runs it`;
const basicSetup = {
  foldGutter: false,
  dropCursor: false,
  allowMultipleSelections: true,
  indentOnInput: true,
};

const submissionFromView = (view: EditorView): QuerySubmission => {
  const selection = view.state.selection.main;
  const wholeDocument = selection.empty;
  return {
    sql: wholeDocument
      ? view.state.doc.toString()
      : view.state.doc.sliceString(selection.from, selection.to),
    offset: wholeDocument ? 0 : selection.from,
    wholeDocument,
  };
};

function showDiagnostic(
  view: EditorView,
  error: QueryExecutionError | null,
  { reveal, focus }: { reveal: boolean; focus: boolean },
) {
  if (!error || error.position === null) {
    view.dispatch({ effects: setSqlDiagnostic.of(null) });
    return;
  }
  const position = Math.min(Math.max(error.position, 0), view.state.doc.length);
  view.dispatch({
    effects: [
      setSqlDiagnostic.of(
        diagnosticAt(view.state, position, error.message, error.hint, focus),
      ),
      ...(reveal ? [EditorView.scrollIntoView(position, { y: "center" })] : []),
    ],
    selection: reveal ? { anchor: position } : undefined,
  });
  if (focus) view.focus();
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(
  function SqlEditor(
    { value, error, running = false, onChange, onRun, schema },
    forwardedRef,
  ) {
    const editorRef = useRef<ReactCodeMirrorRef>(null);
    const [view, setView] = useState<EditorView | null>(null);
    const onRunRef = useRef(onRun);
    useEffect(() => {
      onRunRef.current = onRun;
    }, [onRun]);
    const extensions = useMemo(
      () => [
        sql({ dialect: PostgreSQL, schema, defaultSchema: "public" }),
        editorTheme,
        sqlHighlighting,
        sqlDiagnostics,
        keymap.of([
          {
            key: "Mod-Enter",
            run: (view) => {
              onRunRef.current(submissionFromView(view));
              return true;
            },
          },
        ]),
      ],
      [schema],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        replaceDocument: (sql) => {
          const view = editorRef.current?.view;
          if (!view) return;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: sql },
            userEvent: "input.format",
          });
          view.focus();
        },
        getSubmission: () => {
          const view = editorRef.current?.view;
          return view ? submissionFromView(view) : undefined;
        },
        revealError: () => {
          if (view) showDiagnostic(view, error, { reveal: true, focus: true });
        },
      }),
      [error, view],
    );

    // A new run starts clean: the previous diagnostic no longer describes it.
    useEffect(() => {
      if (running && view)
        view.dispatch({ effects: setSqlDiagnostic.of(null) });
    }, [running, view]);

    // Show each error once where it happened. A tab that mounts with an earlier
    // error restores the marker and caret without taking focus.
    const shownError = useRef<QueryExecutionError | null | undefined>(
      undefined,
    );
    useEffect(() => {
      if (!view || shownError.current === error) return;
      const restoring = shownError.current === undefined;
      shownError.current = error;
      if (restoring && !error) return;
      showDiagnostic(view, error, { reveal: true, focus: !restoring });
    }, [error, view]);

    return (
      <CodeMirror
        ref={editorRef}
        value={value}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={setView}
        theme="none"
        placeholder={placeholder}
        basicSetup={basicSetup}
      />
    );
  },
);
