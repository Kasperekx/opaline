import {
  RangeSet,
  StateEffect,
  StateField,
  type EditorState,
} from "@uiw/react-codemirror";
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  gutterLineClass,
  keymap,
  type DecorationSet,
} from "@codemirror/view";
import { diagnosticRange } from "./sql-diagnostics";

/* Xcode-style inline diagnostics for the last failed run: a wavy underline on
   the offending token, a tinted line number and a compact banner under the
   line. One diagnostic at a time; any edit clears it. */

export type SqlDiagnostic = {
  from: number;
  to: number;
  message: string;
  hint: string | null;
  /** Plays the banner's entrance once; restored diagnostics appear still. */
  fresh: boolean;
};

export const setSqlDiagnostic = StateEffect.define<SqlDiagnostic | null>();

class DiagnosticBanner extends WidgetType {
  constructor(
    readonly message: string,
    readonly hint: string | null,
    readonly fresh: boolean,
  ) {
    super();
  }

  eq(other: DiagnosticBanner) {
    return other.message === this.message && other.hint === this.hint;
  }

  toDOM(view: EditorView) {
    const banner = document.createElement("div");
    banner.className = "cm-sql-error-banner";
    if (this.fresh) {
      // Entrance once (see useEntrance): a later display:none → visible
      // switch must not replay it.
      banner.dataset.entering = "";
      const settle = () => delete banner.dataset.entering;
      banner.addEventListener("animationend", settle, { once: true });
      window.setTimeout(settle, 400);
    }
    const icon = banner.appendChild(document.createElement("span"));
    icon.className = "cm-sql-error-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "!";
    const text = banner.appendChild(document.createElement("span"));
    text.className = "cm-sql-error-text";
    const message = text.appendChild(document.createElement("span"));
    message.className = "cm-sql-error-message";
    message.textContent = this.message;
    if (this.hint) {
      const hint = text.appendChild(document.createElement("span"));
      hint.className = "cm-sql-error-hint";
      hint.textContent = this.hint;
    }
    const dismiss = banner.appendChild(document.createElement("button"));
    dismiss.type = "button";
    dismiss.className = "cm-sql-error-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss inline error");
    dismiss.title = "Dismiss";
    dismiss.textContent = "×";
    dismiss.addEventListener("mousedown", (event) => event.preventDefault());
    dismiss.addEventListener("click", () => {
      view.dispatch({ effects: setSqlDiagnostic.of(null) });
      view.focus();
    });
    return banner;
  }

  ignoreEvent() {
    return true;
  }
}

class ErrorLineNumber extends GutterMarker {
  elementClass = "cm-sql-error-gutter";
}
const errorLineNumber = new ErrorLineNumber();

const diagnosticField = StateField.define<SqlDiagnostic | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setSqlDiagnostic)) return effect.value;
    return transaction.docChanged ? null : value;
  },
});

function decorations(state: EditorState): DecorationSet {
  const diagnostic = state.field(diagnosticField);
  if (!diagnostic) return Decoration.none;
  const line = state.doc.lineAt(diagnostic.from);
  const ranges = [
    Decoration.line({ class: "cm-sql-error-line" }).range(line.from),
    Decoration.widget({
      widget: new DiagnosticBanner(
        diagnostic.message,
        diagnostic.hint,
        diagnostic.fresh,
      ),
      block: true,
      side: 1,
    }).range(line.to),
  ];
  if (diagnostic.to > diagnostic.from)
    ranges.push(
      Decoration.mark({ class: "cm-sql-error-token" }).range(
        diagnostic.from,
        Math.min(diagnostic.to, line.to),
      ),
    );
  return Decoration.set(ranges, true);
}

export const sqlDiagnostics = [
  diagnosticField,
  EditorView.decorations.compute([diagnosticField], decorations),
  gutterLineClass.compute([diagnosticField], (state) => {
    const diagnostic = state.field(diagnosticField);
    if (!diagnostic) return RangeSet.empty;
    return RangeSet.of([
      errorLineNumber.range(state.doc.lineAt(diagnostic.from).from),
    ]);
  }),
  keymap.of([
    {
      key: "Escape",
      run: (view) => {
        if (!view.state.field(diagnosticField)) return false;
        view.dispatch({ effects: setSqlDiagnostic.of(null) });
        return true;
      },
    },
  ]),
];

/**
 * Builds the diagnostic for an error at a document offset. Returns null when
 * the document is empty or the offset is unusable.
 */
export function diagnosticAt(
  state: EditorState,
  offset: number,
  message: string,
  hint: string | null,
  fresh = true,
): SqlDiagnostic | null {
  const range = diagnosticRange(state.doc.toString(), offset);
  return range ? { ...range, message, hint, fresh } : null;
}
