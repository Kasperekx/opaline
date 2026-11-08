import { useEffect, type RefObject } from "react";
import "./sql-highlight.css";

/* Read-only SQL (definitions, review previews) is coloured with the CSS
   Custom Highlight API so the DOM keeps one plain text node: copy, selection,
   screen readers and text queries see exactly the SQL that will run. Where the
   API is unavailable the SQL simply stays uncoloured. Colours come from the
   shared --syntax-* tokens (see sql-highlight.css). */

export type SqlTokenKind =
  "keyword" | "function" | "string" | "number" | "comment";

const keywords = new Set(
  `add all alter always and any array as asc begin between by cache cascade
  case check collate column comment commit concurrently constraint create cross
  cycle default deferrable deferred delete desc distinct do drop else end enum
  exists false first for foreign from full generated grant group having identity
  if ilike immediate in include increment index initially inner insert into is
  join key last lateral left like limit match materialized maxvalue minvalue no
  not null nulls of offset on only or order outer owner partial partition
  primary recursive references rename replace restrict returning revoke right
  rollback schema select sequence set simple some start stored table tablespace
  then to true type union unique update using valid validate values view when
  where with action`.split(/\s+/),
);

const pattern =
  /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_$]*)/g;

export function sqlTokens(sql: string) {
  const tokens: { kind: SqlTokenKind; start: number; end: number }[] = [];
  for (const match of sql.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    let kind: SqlTokenKind | null = null;
    if (match[1]) kind = "comment";
    else if (match[2]) kind = "string";
    else if (match[4]) kind = "number";
    else if (match[5]) {
      if (keywords.has(match[5].toLowerCase())) kind = "keyword";
      else if (/^\s*\(/.test(sql.slice(end))) kind = "function";
    }
    if (kind) tokens.push({ kind, start, end });
  }
  return tokens;
}

const kinds: SqlTokenKind[] = [
  "keyword",
  "function",
  "string",
  "number",
  "comment",
];
const registered = new Map<Element, Map<SqlTokenKind, Range[]>>();

function publish() {
  for (const kind of kinds) {
    const ranges = [...registered.values()].flatMap(
      (entry) => entry.get(kind) ?? [],
    );
    if (ranges.length)
      CSS.highlights.set(`sql-${kind}`, new Highlight(...ranges));
    else CSS.highlights.delete(`sql-${kind}`);
  }
}

function rangesFor(element: Element) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const starts: number[] = [];
  let text = "";
  for (const node of nodes) {
    starts.push(text.length);
    text += node.data;
  }
  const locate = (offset: number, end: boolean) => {
    for (let i = nodes.length - 1; i >= 0; i--)
      if (end ? starts[i] < offset : starts[i] <= offset)
        return [nodes[i], offset - starts[i]] as const;
    return [nodes[0], 0] as const;
  };
  const result = new Map<SqlTokenKind, Range[]>();
  for (const token of sqlTokens(text)) {
    const range = document.createRange();
    range.setStart(...locate(token.start, false));
    range.setEnd(...locate(token.end, true));
    result.set(token.kind, [...(result.get(token.kind) ?? []), range]);
  }
  return result;
}

export function useSqlHighlight(
  ref: RefObject<HTMLElement | null>,
  sql: string | null | undefined,
) {
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      !sql ||
      typeof CSS === "undefined" ||
      !("highlights" in CSS) ||
      typeof Highlight === "undefined"
    )
      return;
    registered.set(element, rangesFor(element));
    publish();
    return () => {
      registered.delete(element);
      publish();
    };
  }, [ref, sql]);
}
