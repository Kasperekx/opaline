/* Pure model for the command palette (Open Quickly): item shape, fuzzy
   ranking and the scope an open request asks for. No React, so the
   workspace hook can import it without pulling in the lazily loaded palette. */

export type PaletteSection = "Tables" | "Views" | "Queries" | "Commands";
export type PaletteScope = "all" | "tables";

export type CommandAction = {
  label: string;
  shortcut?: string;
  run: () => void;
  disabled?: boolean;
  /** Stable identity; defaults to the label. */
  id?: string;
  /** Defaults to "Commands". */
  section?: PaletteSection;
  /** Muted context after the label, such as the schema. */
  detail?: string;
  /** Muted trailing value, such as an estimated row count. */
  meta?: string;
  /** Text matched instead of the label when the query names a schema
   * ("public.us"); the label stays the visible part. */
  qualified?: string;
  /** Secondary action on Cmd/Ctrl+Return. */
  alternate?: { label: string; run: () => void };
  /** In-memory recency (ms) and use count for the empty-query list. */
  lastUsed?: number;
  uses?: number;
};

export type FuzzyMatch = { score: number; positions: number[] };

const boundary = (text: string, index: number) => {
  if (index === 0) return true;
  const previous = text[index - 1]!;
  const current = text[index]!;
  if (!/[\p{L}\p{N}]/u.test(previous)) return true;
  // camelCase and digit runs start words too.
  return (
    (/\p{Ll}/u.test(previous) && /\p{Lu}/u.test(current)) ||
    (/\p{L}/u.test(previous) && /\p{N}/u.test(current))
  );
};

const range = (start: number, length: number) =>
  Array.from({ length }, (_, offset) => start + offset);

/** Ranks `text` against `query`: prefix > word-start substring > acronym
 * (word starts) > substring > loose subsequence. Case-insensitive; returns
 * null when the query characters do not appear in order. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const t = text.toLowerCase();
  if (t.startsWith(q)) return { score: 3000, positions: range(0, q.length) };
  let firstSubstring = -1;
  for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + 1)) {
    if (firstSubstring < 0) firstSubstring = at;
    if (boundary(text, at))
      return { score: 2500 - Math.min(at, 99), positions: range(at, q.length) };
  }
  const compact = q.replace(/\s+/g, "");
  if (!compact) return null;
  // Acronym: every query character lands on a word start, in order.
  const acronym: number[] = [];
  for (let i = 0; i < t.length && acronym.length < compact.length; i += 1)
    if (t[i] === compact[acronym.length] && boundary(text, i)) acronym.push(i);
  if (acronym.length === compact.length && compact.length > 1)
    return { score: 2000, positions: acronym };
  if (firstSubstring >= 0)
    return {
      score: 1500 - Math.min(firstSubstring, 99),
      positions: range(firstSubstring, q.length),
    };
  // Subsequence: greedy, preferring a word start when one is close ahead.
  const positions: number[] = [];
  let from = 0;
  for (const char of compact) {
    let at = t.indexOf(char, from);
    if (at < 0) return null;
    for (let next = at; next >= 0 && next - at < 8;) {
      if (boundary(text, next)) {
        at = next;
        break;
      }
      next = t.indexOf(char, next + 1);
    }
    positions.push(at);
    from = at + 1;
  }
  let gaps = 0;
  let wordStarts = 0;
  positions.forEach((position, index) => {
    if (index > 0) gaps += position - positions[index - 1]! - 1;
    if (boundary(text, position)) wordStarts += 1;
  });
  // Stays below the weakest substring (1401) even with the learned bonus.
  const quality = 300 + wordStarts * 30 - gaps * 6 - positions[0]! * 2;
  return { score: 1000 + Math.max(1, Math.min(349, quality)), positions };
}

export type RankedItem = {
  item: CommandAction;
  key: string;
  section: PaletteSection;
  positions: number[];
  score: number;
};

const sectionOrder: PaletteSection[] = [
  "Tables",
  "Views",
  "Queries",
  "Commands",
];

export const itemKey = (item: CommandAction) => item.id ?? item.label;

/** Matches one item; schema-qualified text counts only when the query has a dot. */
export function matchItem(query: string, item: CommandAction) {
  const direct = fuzzyMatch(query, item.label);
  if (!item.qualified || !query.includes(".")) return direct;
  const qualified = fuzzyMatch(query, item.qualified);
  if (!qualified || (direct && direct.score >= qualified.score)) return direct;
  // Highlight only the characters that fall inside the visible label.
  const offset = item.qualified.length - item.label.length;
  return {
    score: qualified.score,
    positions: qualified.positions
      .filter((position) => position >= offset)
      .map((position) => position - offset),
  };
}

const compareRanked = (a: RankedItem, b: RankedItem) =>
  b.score - a.score ||
  a.item.label.length - b.item.label.length ||
  a.item.label.localeCompare(b.item.label);

export type PaletteGroup = { title: string; items: RankedItem[] };

const inScope = (scope: PaletteScope, section: PaletteSection) =>
  scope === "all" || section === "Tables" || section === "Views";

const RECENT_LIMIT = 6;
/** Caps rendering for very large catalogs; typing narrows further. */
export const SECTION_LIMIT = 60;

/** Builds the visible groups. With a query, groups are ordered by their best
 * match so the first row is always the top hit; within a group, higher score,
 * then the shorter name, wins. Without a query: recent items first, then
 * commands by use (or, scoped to tables, every table and view). */
export function rankPalette(
  items: CommandAction[],
  query: string,
  scope: PaletteScope,
): { groups: PaletteGroup[]; total: number } {
  const scoped = items.filter((item) =>
    inScope(scope, item.section ?? "Commands"),
  );
  const toRanked = (
    item: CommandAction,
    score = 0,
    positions: number[] = [],
  ) => ({
    item,
    key: itemKey(item),
    section: item.section ?? "Commands",
    positions,
    score,
  });
  if (query.trim()) {
    const bySection = new Map<PaletteSection, RankedItem[]>();
    let total = 0;
    for (const item of scoped) {
      const match = matchItem(query, item);
      if (!match) continue;
      total += 1;
      // Learned preference stays inside a tier (tiers are 500 apart).
      const learned =
        Math.min(item.uses ?? 0, 5) * 6 + (item.lastUsed ? 20 : 0);
      const ranked = toRanked(item, match.score + learned, match.positions);
      const list = bySection.get(ranked.section) ?? [];
      list.push(ranked);
      bySection.set(ranked.section, list);
    }
    const groups = [...bySection.entries()]
      .map(([title, list]) => ({
        title,
        items: list.sort(compareRanked).slice(0, SECTION_LIMIT),
      }))
      .sort(
        (a, b) =>
          b.items[0]!.score - a.items[0]!.score ||
          sectionOrder.indexOf(a.title) - sectionOrder.indexOf(b.title),
      );
    return { groups, total };
  }
  const recent = scoped
    .filter(
      (item) => item.lastUsed && item.section && item.section !== "Commands",
    )
    .sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
    .slice(0, RECENT_LIMIT)
    .map((item) => toRanked(item));
  const recentKeys = new Set(recent.map((entry) => entry.key));
  const groups: PaletteGroup[] = recent.length
    ? [{ title: "Recent", items: recent }]
    : [];
  if (scope === "tables") {
    for (const section of ["Tables", "Views"] as const) {
      const list = scoped
        .filter(
          (item) => item.section === section && !recentKeys.has(itemKey(item)),
        )
        .map((item) => toRanked(item))
        .sort((a, b) => a.item.label.localeCompare(b.item.label));
      if (list.length)
        groups.push({ title: section, items: list.slice(0, SECTION_LIMIT) });
    }
  } else {
    const commands = scoped
      .map((item, order) => ({ item, order }))
      .filter(({ item }) => (item.section ?? "Commands") === "Commands")
      .sort(
        (a, b) =>
          (b.item.uses ?? 0) - (a.item.uses ?? 0) ||
          Number(Boolean(a.item.disabled)) - Number(Boolean(b.item.disabled)) ||
          a.order - b.order,
      )
      .map(({ item }) => toRanked(item));
    if (commands.length) groups.push({ title: "Commands", items: commands });
  }
  return {
    groups,
    total: groups.reduce((sum, group) => sum + group.items.length, 0),
  };
}

/* The scope requested by the shortcut that opened the palette. The palette
   reads it on mount and resets it when it closes, so a toolbar button that
   opens it directly always starts unscoped. */
let requestedScope: PaletteScope = "all";
export const requestPaletteScope = (scope: PaletteScope) => {
  requestedScope = scope;
};
export const peekPaletteScope = () => requestedScope;

/** Visible label split into plain and matched runs for highlighting. */
export function highlightRuns(label: string, positions: number[]) {
  const runs: { text: string; match: boolean }[] = [];
  const hits = new Set(positions);
  for (let i = 0; i < label.length; i += 1) {
    const match = hits.has(i);
    const last = runs[runs.length - 1];
    if (last && last.match === match) last.text += label[i];
    else runs.push({ text: label[i]!, match });
  }
  return runs;
}
