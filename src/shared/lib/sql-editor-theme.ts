import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/* SQL palette: Xcode Default (Dark), defined once as --syntax-* tokens in
   styles/tokens.css and shared with read-only SQL (sql-highlight.css).
   Chrome (cursor, selection, popovers) follows the app accent and materials. */
export const syntax = {
  plain: "var(--syntax-plain)",
  keyword: "var(--syntax-keyword)",
  function: "var(--syntax-function)",
  string: "var(--syntax-string)",
  number: "var(--syntax-number)",
  comment: "var(--syntax-comment)",
  gutter: "var(--syntax-gutter)",
  activeLine: "var(--syntax-active-line)",
} as const;

const systemFont = "-apple-system, BlinkMacSystemFont, system-ui, sans-serif";

/* Hold, fade out (~120ms), hold, fade in: calmer than a hard on/off blink.
   Reduced motion restores the hard blink in styles/vendor-overrides.css. */
const caretBlink = {
  "0%": { opacity: "1" },
  "42%": { opacity: "1" },
  "52%": { opacity: "0" },
  "92%": { opacity: "0" },
  "100%": { opacity: "1" },
};

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: syntax.plain,
      fontSize: "var(--editor-font-size, 13px)",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "var(--editor-line-height, 1.6154)",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      padding: "14px 0",
      fontFamily: "var(--font-mono)",
    },
    ".cm-line": { padding: "0 20px 0 2px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: syntax.gutter,
      border: "none",
      fontVariantNumeric: "tabular-nums",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "52px",
      padding: "0 18px 0 12px",
    },
    ".cm-activeLine": { backgroundColor: syntax.activeLine },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--text-soft)",
    },
    ".cm-placeholder": {
      color: "var(--muted)",
      fontStyle: "normal",
    },

    /* Caret: accent, 2px, and a soft fade instead of a hard blink. CodeMirror
       restarts the blink by swapping between these two keyframe names. */
    ".cm-cursor, .cm-dropCursor": {
      borderLeftWidth: "2px",
      borderLeftColor: "var(--accent)",
    },
    "&.cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor": {
      borderLeftColor: "var(--accent)",
    },
    "&.cm-focused > .cm-scroller > .cm-cursorLayer": {
      animationTimingFunction: "ease-in-out",
    },
    "@keyframes cm-blink": caretBlink,
    "@keyframes cm-blink2": caretBlink,

    ".cm-selectionBackground": { backgroundColor: "var(--pressed)" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
      { backgroundColor: "var(--accent-soft)" },
    ".cm-selectionMatch": { backgroundColor: "var(--hover)" },
    "&.cm-focused .cm-matchingBracket": {
      color: "var(--text)",
      backgroundColor: "transparent",
      boxShadow: "inset 0 0 0 0.5px var(--line-strong)",
      borderRadius: "2px",
    },
    "&.cm-focused .cm-nonmatchingBracket": {
      color: "var(--danger)",
      backgroundColor: "transparent",
    },

    /* Inline diagnostics (features/query/sql-editor-diagnostics.ts). */
    ".cm-sql-error-token": {
      textDecorationLine: "underline",
      textDecorationStyle: "wavy",
      textDecorationColor: "var(--danger)",
      textDecorationThickness: "1px",
      textUnderlineOffset: "3px",
      textDecorationSkipInk: "none",
    },
    ".cm-sql-error-line, .cm-sql-error-line.cm-activeLine": {
      backgroundColor: "rgba(255, 69, 58, 0.07)",
    },
    ".cm-lineNumbers .cm-gutterElement.cm-sql-error-gutter": {
      position: "relative",
      color: "var(--danger)",
      fontWeight: "600",
    },
    ".cm-lineNumbers .cm-gutterElement.cm-sql-error-gutter::before": {
      position: "absolute",
      top: "calc(50% - 3px)",
      left: "5px",
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: "var(--danger-fill)",
      content: '""',
    },
    ".cm-sql-error-banner": {
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
      width: "fit-content",
      maxWidth: "min(680px, calc(100% - 24px))",
      margin: "2px 0 6px 2px",
      padding: "5px 5px 5px 8px",
      borderRadius: "var(--radius-sm)",
      color: "var(--text)",
      backgroundColor: "rgba(255, 69, 58, 0.14)",
      boxShadow: "inset 0 0 0 0.5px rgba(255, 69, 58, 0.34)",
      fontFamily: systemFont,
      fontSize: "var(--text-callout)",
      lineHeight: "1.4",
      whiteSpace: "normal",
      cursor: "default",
      userSelect: "text",
    },
    ".cm-sql-error-banner[data-entering]": {
      animation: "opaline-diagnostic-in 180ms var(--ease) both",
    },
    "@keyframes opaline-diagnostic-in": {
      from: { opacity: "0", transform: "translateY(-3px)" },
      to: { opacity: "1", transform: "none" },
    },
    ".cm-sql-error-icon": {
      display: "grid",
      flex: "none",
      placeItems: "center",
      width: "14px",
      height: "14px",
      marginTop: "1.5px",
      borderRadius: "50%",
      color: "#fff",
      backgroundColor: "var(--danger-fill)",
      fontSize: "10px",
      fontWeight: "800",
      lineHeight: "1",
    },
    ".cm-sql-error-text": {
      display: "flex",
      flexDirection: "column",
      gap: "1px",
      minWidth: "0",
    },
    ".cm-sql-error-hint": { color: "var(--muted)" },
    ".cm-sql-error-dismiss": {
      display: "grid",
      flex: "none",
      placeItems: "center",
      width: "18px",
      height: "18px",
      padding: "0",
      border: "0",
      borderRadius: "5px",
      color: "var(--muted)",
      background: "transparent",
      fontSize: "15px",
      lineHeight: "1",
    },
    ".cm-sql-error-dismiss:hover": {
      color: "var(--text)",
      background: "var(--hover)",
    },

    ".cm-searchMatch": {
      backgroundColor: "rgba(255, 214, 10, 0.18)",
      outline: "0.5px solid rgba(255, 214, 10, 0.45)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(255, 214, 10, 0.4)",
    },

    /* Floating chrome: popover material, 26px rows, accent-filled highlight. */
    ".cm-tooltip": {
      border: "none",
      borderRadius: "var(--radius)",
      color: "var(--text)",
      backgroundColor: "var(--material-popover)",
      backdropFilter: "var(--material-blur)",
      WebkitBackdropFilter: "var(--material-blur)",
      boxShadow: "var(--shadow-popover)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete": {
      padding: "5px",
      transformOrigin: "top left",
      "& > ul": {
        minWidth: "260px",
        maxHeight: "16em",
        fontFamily: "var(--font-mono)",
        fontSize: "12.5px",
      },
      "& > ul > li": {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minHeight: "26px",
        padding: "0 8px",
        borderRadius: "6px",
        lineHeight: "26px",
        cursor: "default",
      },
      "& > ul > completion-section": {
        padding: "6px 8px 3px",
        border: "none",
        color: "var(--muted)",
        fontFamily: systemFont,
        fontSize: "var(--text-2xs)",
        fontWeight: "600",
        opacity: "1",
      },
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      color: "#fff",
      background: "var(--accent-fill)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete-disabled > ul > li[aria-selected]": {
      color: "var(--text)",
      background: "var(--pressed)",
    },
    ".cm-completionLabel": { flex: "1", minWidth: "0" },
    ".cm-completionMatchedText": {
      textDecoration: "none",
      fontWeight: "700",
    },
    ".cm-completionDetail": {
      marginLeft: "auto",
      paddingLeft: "12px",
      color: "var(--muted)",
      fontFamily: systemFont,
      fontSize: "var(--text-2xs)",
      fontStyle: "normal",
    },
    "li[aria-selected] .cm-completionDetail": {
      color: "rgba(255, 255, 255, 0.8)",
    },
    /* Kind badges, Xcode style: a small rounded square with one letter in
       the kind's syntax colour. White on the accent-filled highlight. */
    ".cm-completionIcon": {
      display: "grid",
      flex: "none",
      placeItems: "center",
      boxSizing: "border-box",
      width: "16px",
      height: "16px",
      padding: "0",
      borderRadius: "4px",
      color: "var(--muted)",
      backgroundColor: "var(--hover)",
      fontFamily: systemFont,
      fontSize: "10px",
      fontStyle: "normal",
      fontWeight: "700",
      lineHeight: "1",
      opacity: "1",
    },
    ".cm-completionIcon::after": { fontSize: "inherit", verticalAlign: "0" },
    ".cm-completionIcon-keyword": {
      color: syntax.keyword,
      backgroundColor: "rgba(255, 122, 178, 0.16)",
      "&::after": { content: "'K'" },
    },
    ".cm-completionIcon-type": {
      color: syntax.function,
      backgroundColor: "rgba(103, 183, 164, 0.18)",
      "&::after": { content: "'T'" },
    },
    ".cm-completionIcon-property": {
      color: "var(--accent)",
      backgroundColor: "var(--accent-soft)",
      "&::after": { content: "'C'" },
    },
    ".cm-completionIcon-variable, .cm-completionIcon-function, .cm-completionIcon-method":
      {
        color: syntax.number,
        backgroundColor: "rgba(217, 201, 124, 0.16)",
        "&::after": { content: "'ƒ'" },
      },
    ".cm-completionIcon-constant": {
      color: syntax.string,
      backgroundColor: "rgba(255, 129, 112, 0.16)",
      "&::after": { content: "'A'" },
    },
    ".cm-completionIcon-text": {
      "&::after": { content: "'Aa'", fontSize: "8px" },
    },
    "li[aria-selected] .cm-completionIcon": {
      color: "#fff",
      backgroundColor: "rgba(255, 255, 255, 0.2)",
    },
    ".cm-tooltip.cm-completionInfo": {
      maxWidth: "320px",
      padding: "8px 10px",
      color: "var(--text-soft)",
      fontFamily: "var(--font-mono)",
      fontSize: "11.5px",
      lineHeight: "1.5",
    },

    /* Find panel. */
    ".cm-panels": {
      color: "var(--text)",
      backgroundColor: "var(--surface)",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "var(--hairline) solid var(--line)",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "var(--hairline) solid var(--line)",
    },
    ".cm-panel.cm-search": {
      padding: "6px 36px 8px 12px",
      fontFamily: systemFont,
      fontSize: "var(--text-callout)",
      "& input, & button, & label": { margin: "2px 4px 2px 0" },
      "& label": {
        color: "var(--text-soft)",
        fontSize: "var(--text-callout)",
      },
      "& button[name=close]": {
        top: "8px",
        right: "10px",
        color: "var(--muted)",
        fontSize: "16px",
      },
    },
    ".cm-textfield": {
      height: "26px",
      margin: "0",
      padding: "0 8px",
      border: "none",
      borderRadius: "var(--radius-sm)",
      color: "var(--text)",
      backgroundColor: "var(--field)",
      boxShadow: "inset 0 0 0 0.5px var(--line-strong)",
      fontSize: "var(--text-callout)",
    },
    ".cm-button": {
      height: "26px",
      margin: "0",
      padding: "0 10px",
      border: "none",
      borderRadius: "var(--radius-capsule)",
      color: "var(--text-soft)",
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      backgroundImage: "none",
      fontSize: "var(--text-callout)",
    },
  },
  { dark: true },
);

const keyword = { color: syntax.keyword, fontWeight: "600" };

export const sqlHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.keyword, tags.bool, tags.null], ...keyword },
    {
      tag: [tags.typeName, tags.standard(tags.name), tags.special(tags.name)],
      color: syntax.function,
    },
    { tag: tags.string, color: syntax.string },
    { tag: tags.number, color: syntax.number },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: syntax.comment,
    },
    {
      tag: [
        tags.name,
        tags.special(tags.string),
        tags.operator,
        tags.punctuation,
        tags.paren,
        tags.brace,
        tags.squareBracket,
      ],
      color: syntax.plain,
    },
  ]),
);
