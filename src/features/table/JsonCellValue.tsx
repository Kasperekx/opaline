import { memo } from "react";

/** Display only: never parse/stringify database JSON (large numbers and duplicate keys matter). */
export const JsonCellValue = memo(function JsonCellValue({
  value,
}: {
  value: string;
}) {
  // ponytail: bound work per cell; the existing inspector retains the complete original text.
  const preview = value.slice(0, 512);
  const tokens =
    preview.match(
      /"(?:[^"\\]|\\.)*"?|\s+|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|./g,
    ) ?? [];
  return (
    <span
      className="table-cell-value json-cell-preview"
      title="JSON · Inspect value to read the complete original text"
    >
      {tokens.map((token, index) => {
        if (/^\s+$/.test(token)) return " ";
        const kind = token.startsWith('"')
          ? tokens
              .slice(index + 1, index + 3)
              .find((next) => !/^\s+$/.test(next)) === ":"
            ? "key"
            : "string"
          : /^-?\d/.test(token)
            ? "number"
            : /^(true|false|null)$/.test(token)
              ? "literal"
              : "punctuation";
        return (
          <span className={`json-token-${kind}`} key={index}>
            {token}
          </span>
        );
      })}
      {value.length > preview.length && (
        <span aria-label="Preview truncated">…</span>
      )}
    </span>
  );
});
