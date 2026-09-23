import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--text)",
      fontSize: "var(--editor-font-size, clamp(15px, 0.95vw, 17px))",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      padding: "25px 0",
      fontFamily:
        '"SFMono-Regular", "Cascadia Code", "Roboto Mono", ui-monospace, monospace',
      lineHeight: "var(--editor-line-height, 1.7)",
    },
    ".cm-line": { padding: "0 clamp(18px, 1.7vw, 28px)" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--muted)",
      border: "none",
      paddingLeft: "9px",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.027)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--text-soft)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--accent-line)",
    },
    ".cm-cursor": { borderLeftColor: "var(--accent)" },
  },
  { dark: true },
);

export const sqlHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "var(--accent)" },
    { tag: tags.string, color: "var(--teal)" },
    { tag: tags.number, color: "#a9becd" },
    { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
    { tag: tags.operator, color: "var(--text-soft)" },
    { tag: tags.name, color: "var(--text)" },
  ]),
);
