import type { QueryExecutionError } from "../../shared/types/database";

/** The text that was sent to PostgreSQL and where it sits in the editor. */
export type ExecutedText = {
  sql: string;
  /** UTF-16 offset of `sql` inside the editor document. */
  offset: number;
};

/**
 * PostgreSQL reports `position` as a 1-based character (code point) index
 * into the text it received. Editors index UTF-16 code units, so astral
 * characters (emoji, some CJK) count twice. Returns the 0-based UTF-16
 * offset into the whole editor document, or null when there is no position.
 */
export function documentOffsetForPosition(
  position: number | null,
  executed: ExecutedText,
): number | null {
  if (position === null || !Number.isFinite(position)) return null;
  const characters = Math.max(0, Math.floor(position) - 1);
  let units = 0;
  let seen = 0;
  for (const character of executed.sql) {
    if (seen === characters) break;
    units += character.length;
    seen += 1;
  }
  return executed.offset + units;
}

export function toAbsoluteErrorPosition<T extends QueryExecutionError>(
  error: T,
  executed: ExecutedText,
): T {
  if (error.position === null) return error;
  return {
    ...error,
    position: documentOffsetForPosition(error.position, executed),
  };
}

/** 1-based line and column (in characters) of a UTF-16 offset. */
export function lineColumnAt(doc: string, offset: number) {
  const clamped = Math.min(Math.max(0, offset), doc.length);
  const before = doc.slice(0, clamped);
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = before.split("\n").length;
  const column = Array.from(doc.slice(lineStart, clamped)).length + 1;
  return { line, column };
}

const wordCharacter = /[\p{L}\p{N}_$]/u;
const isWord = (character: string | undefined) =>
  character !== undefined && wordCharacter.test(character);
const isSpace = (character: string | undefined) =>
  character !== undefined && /\s/.test(character);

/**
 * The token to underline for an error at `offset`: the identifier or keyword
 * under it, a single punctuation character, or — when PostgreSQL points at
 * whitespace or the end of input ("syntax error at end of input") — the last
 * token before it. Stays on one line. Returns null for an empty document.
 */
export function diagnosticRange(doc: string, offset: number) {
  if (doc.length === 0) return null;
  let at = Math.min(Math.max(0, offset), doc.length);
  if (at === doc.length || isSpace(doc[at])) {
    let back = at;
    while (back > 0 && isSpace(doc[back - 1])) back -= 1;
    if (back === 0) {
      // Only whitespace before: mark the first visible character after it.
      while (at < doc.length && isSpace(doc[at])) at += 1;
      if (at === doc.length) return null;
    } else {
      at = back - 1;
    }
  }
  if (!isWord(doc[at])) {
    const code = doc.codePointAt(at) ?? 0;
    return { from: at, to: at + (code > 0xffff ? 2 : 1) };
  }
  let from = at;
  let to = at + 1;
  while (from > 0 && isWord(doc[from - 1])) from -= 1;
  while (to < doc.length && isWord(doc[to])) to += 1;
  return { from, to };
}
