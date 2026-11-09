import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  diagnosticRange,
  documentOffsetForPosition,
  lineColumnAt,
  toAbsoluteErrorPosition,
} from "../src/features/query/sql-diagnostics";
import {
  SqlEditor,
  type SqlEditorHandle,
} from "../src/features/query/SqlEditor";
import { ResultsGrid } from "../src/features/query/ResultsGrid";
import {
  formatElapsed,
  RunQueryButton,
} from "../src/features/query/QueryExecutionControl";
import type { QueryExecutionError } from "../src/shared/types/database";

const syntaxError = (position: number | null): QueryExecutionError => ({
  kind: "database",
  message: 'syntax error at or near "form"',
  detail: null,
  hint: "Did you mean FROM?",
  code: "42601",
  position,
});

describe("error position mapping", () => {
  it("maps PostgreSQL's 1-based character position into the document", () => {
    const sql = "select *\nform users";
    // "form" starts at character 10 (1-based).
    expect(documentOffsetForPosition(10, { sql, offset: 0 })).toBe(9);
    expect(sql.slice(9, 13)).toBe("form");
  });

  it("adds the selection offset when only a selection was executed", () => {
    const doc = "select 1;\nselect * form users;";
    const from = doc.indexOf("select *");
    const sql = doc.slice(from);
    const offset = documentOffsetForPosition(10, { sql, offset: from });
    expect(offset).not.toBeNull();
    expect(doc.slice(offset!, offset! + 4)).toBe("form");
    expect(
      toAbsoluteErrorPosition(syntaxError(10), { sql, offset: from }).position,
    ).toBe(offset);
  });

  it("counts characters, not UTF-16 units, before the error", () => {
    const sql = "select '😀🎉' form t";
    // Characters: s e l e c t ␠ ' 😀 🎉 ' ␠ f → "form" is character 13.
    const offset = documentOffsetForPosition(13, { sql, offset: 0 });
    expect(sql.slice(offset!, offset! + 4)).toBe("form");
  });

  it("keeps a missing position and clamps end-of-input positions", () => {
    expect(documentOffsetForPosition(null, { sql: "x", offset: 4 })).toBe(null);
    expect(
      toAbsoluteErrorPosition(syntaxError(null), { sql: "x", offset: 4 }),
    ).toMatchObject({ position: null });
    // "syntax error at end of input" points one past the last character.
    expect(documentOffsetForPosition(9, { sql: "select (", offset: 2 })).toBe(
      10,
    );
  });

  it("reports 1-based line and column", () => {
    const doc = "select *\n  from\n  wher x";
    expect(lineColumnAt(doc, doc.indexOf("wher"))).toEqual({
      line: 3,
      column: 3,
    });
    expect(lineColumnAt(doc, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumnAt("é😀x", 3)).toEqual({ line: 1, column: 3 });
  });
});

describe("diagnostic range", () => {
  it("covers the identifier or keyword at the error", () => {
    const doc = "select * form users";
    expect(diagnosticRange(doc, doc.indexOf("form") + 2)).toEqual({
      from: 9,
      to: 13,
    });
  });

  it("marks a single punctuation character", () => {
    expect(diagnosticRange("select 1,, 2", 9)).toEqual({ from: 9, to: 10 });
  });

  it("falls back to the last token at the end of input or on whitespace", () => {
    const doc = "select * from\n";
    expect(diagnosticRange(doc, doc.length)).toEqual({ from: 9, to: 13 });
    expect(diagnosticRange("select (  ", 9)).toEqual({ from: 7, to: 8 });
  });

  it("returns null for an empty document", () => {
    expect(diagnosticRange("", 0)).toBeNull();
    expect(diagnosticRange("   ", 1)).toBeNull();
  });
});

describe("inline editor diagnostics", () => {
  // jsdom has no text layout; CodeMirror measures ranges after rendering.
  beforeAll(() => {
    const empty = () => Object.assign([], { item: () => null });
    Range.prototype.getClientRects ??= empty as never;
    Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  });
  const sql = "select *\nform users";

  it("underlines the token, marks the line and shows message and hint", async () => {
    const view = render(
      <SqlEditor
        value={sql}
        error={null}
        onChange={() => {}}
        onRun={() => {}}
      />,
    );
    await act(async () => {});
    view.rerender(
      <SqlEditor
        value={sql}
        error={syntaxError(9)}
        onChange={() => {}}
        onRun={() => {}}
      />,
    );
    await act(async () => {});
    const token = view.container.querySelector(".cm-sql-error-token");
    expect(token?.textContent).toBe("form");
    expect(
      view.container.querySelector(".cm-sql-error-gutter")?.textContent,
    ).toBe("2");
    const banner = view.container.querySelector(".cm-sql-error-banner");
    expect(banner?.textContent).toContain('syntax error at or near "form"');
    expect(banner?.textContent).toContain("Did you mean FROM?");

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss inline error" }),
    );
    expect(view.container.querySelector(".cm-sql-error-banner")).toBeNull();
    expect(view.container.querySelector(".cm-sql-error-token")).toBeNull();
  });

  it("restores a tab's earlier error on mount and clears it when a run starts", async () => {
    const ref = createRef<SqlEditorHandle>();
    const props = {
      value: sql,
      error: syntaxError(9),
      onChange: () => {},
      onRun: () => {},
    };
    const view = render(<SqlEditor ref={ref} {...props} />);
    await act(async () => {});
    expect(view.container.querySelector(".cm-sql-error-token")).not.toBeNull();
    view.rerender(<SqlEditor ref={ref} {...props} running />);
    await act(async () => {});
    expect(view.container.querySelector(".cm-sql-error-token")).toBeNull();
    view.rerender(<SqlEditor ref={ref} {...props} />);
    act(() => ref.current?.revealError());
    expect(
      view.container.querySelector(".cm-sql-error-token")?.textContent,
    ).toBe("form");
  });
});

describe("results", () => {
  it("links the error location back to the editor", () => {
    const onRevealError = vi.fn();
    render(
      <ResultsGrid
        resultSet={null}
        busy={false}
        error={syntaxError(9)}
        errorLocation={{ line: 2, column: 1 }}
        onRevealError={onRevealError}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("SQLSTATE 42601");
    fireEvent.click(screen.getByRole("button", { name: "Line 2, column 1" }));
    expect(onRevealError).toHaveBeenCalledOnce();
  });

  it("keeps the previous result visible, marked busy, during a re-run", () => {
    const resultSet = {
      columns: ["id"],
      rows: [["1"]],
      affectedRows: 0,
      truncated: false,
    };
    const view = render(
      <ResultsGrid resultSet={resultSet} busy error={null} />,
    );
    expect(screen.getByRole("grid", { name: "SQL results" })).toBeTruthy();
    expect(
      view.container.querySelector(".paged-results")?.getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Running query…");
  });

  it("shows a calm note for a result without rows", () => {
    render(
      <ResultsGrid
        resultSet={{
          columns: ["id"],
          rows: [],
          affectedRows: 0,
          truncated: false,
        }}
        busy={false}
        error={null}
      />,
    );
    expect(screen.getByRole("columnheader", { name: /id/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("No rows");
  });
});

describe("run button", () => {
  it("morphs into Cancel while running", () => {
    const onRun = vi.fn();
    const onCancel = vi.fn();
    const props = { cancelling: false, disabled: false, onRun, onCancel };
    const view = render(<RunQueryButton running={false} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));
    expect(onRun).toHaveBeenCalledOnce();
    view.rerender(<RunQueryButton running {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    view.rerender(<RunQueryButton running {...props} cancelling />);
    expect(
      (screen.getByRole("button", { name: "Cancelling" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows elapsed time only after 300ms", () => {
    vi.useFakeTimers();
    try {
      render(
        <RunQueryButton
          running
          cancelling={false}
          disabled={false}
          onRun={() => {}}
          onCancel={() => {}}
        />,
      );
      expect(document.querySelector(".run-button-elapsed")).toBeNull();
      act(() => vi.advanceTimersByTime(450));
      expect(document.querySelector(".run-button-elapsed")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
    expect(formatElapsed(1234)).toBe("1.2 s");
    expect(formatElapsed(42_500)).toBe("42 s");
    expect(formatElapsed(65_000)).toBe("1:05");
  });
});
