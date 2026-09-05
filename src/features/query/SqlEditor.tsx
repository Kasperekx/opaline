import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { PostgreSQL, sql, type SQLNamespace } from "@codemirror/lang-sql";
import { keymap, EditorView } from "@codemirror/view";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  editorTheme,
  sqlHighlighting,
} from "../../shared/lib/sql-editor-theme";
import type { QuerySubmission } from "./useWorkspace";

type SqlEditorProps = {
  schema?: SQLNamespace;
  value: string;
  errorPosition: number | null;
  onChange: (value: string) => void;
  onRun: (submission: QuerySubmission) => void;
};

export type SqlEditorHandle = {
  getSubmission: () => QuerySubmission | undefined;
  replaceDocument: (sql: string) => void;
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

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(
  function SqlEditor(
    { value, errorPosition, onChange, onRun, schema },
    forwardedRef,
  ) {
    const editorRef = useRef<ReactCodeMirrorRef>(null);
    const onRunRef = useRef(onRun);
    onRunRef.current = onRun;
    const extensions = useMemo(
      () => [
        sql({ dialect: PostgreSQL, schema, defaultSchema: "public" }),
        editorTheme,
        sqlHighlighting,
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
      }),
      [],
    );

    useEffect(() => {
      const view = editorRef.current?.view;
      if (errorPosition === null || !view) return;
      const position = Math.min(
        Math.max(errorPosition, 0),
        view.state.doc.length,
      );
      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: "center" }),
      });
      view.focus();
    }, [errorPosition, value]);

    return (
      <CodeMirror
        ref={editorRef}
        value={value}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        theme="none"
        basicSetup={{
          foldGutter: false,
          dropCursor: false,
          allowMultipleSelections: true,
          indentOnInput: true,
        }}
      />
    );
  },
);
