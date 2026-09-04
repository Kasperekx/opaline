import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "#dfe6dc",
      fontSize: "clamp(15px, 0.95vw, 17px)",
    },
    ".cm-content": {
      caretColor: "#c8f26a",
      padding: "25px 0",
      fontFamily:
        '"SFMono-Regular", "Cascadia Code", "Roboto Mono", ui-monospace, monospace',
      lineHeight: "1.7",
    },
    ".cm-line": { padding: "0 clamp(18px, 1.7vw, 28px)" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#626b64",
      border: "none",
      paddingLeft: "9px",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.027)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#a4afa5",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(200,242,106,.13)",
    },
    ".cm-cursor": { borderLeftColor: "#c8f26a" },
  },
  { dark: true },
);

export const sqlHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#c8f26a" },
    { tag: tags.string, color: "#edc98e" },
    { tag: tags.number, color: "#8ed7c6" },
    { tag: tags.comment, color: "#687169", fontStyle: "italic" },
    { tag: tags.operator, color: "#9eaaa0" },
    { tag: tags.name, color: "#dfe6dc" },
  ]),
);
