import type { ColumnInfo } from "../../shared/types/database";
import { columnEditorKind } from "./column-editor";

export function defaultColumnWidth(column: ColumnInfo): number {
  const kind = columnEditorKind(column);
  const base =
    kind === "boolean"
      ? 112
      : kind === "integer" || kind === "number"
        ? 156
        : kind === "uuid"
          ? 300
          : kind === "json"
            ? 280
            : /^(timestamp|time|date)/i.test(column.dataType)
              ? 240
              : 220;
  return Math.min(360, Math.max(base, column.name.length * 8 + 68));
}

/** Fits the loaded page only; large values stay available in the inspector. */
export function fitColumnWidth(
  name: string,
  values: (string | null | undefined)[],
  measure: (text: string) => number,
): number {
  return Math.ceil(
    Math.min(
      640,
      Math.max(
        112,
        measure(name) + 76,
        ...values.map((value) => measure((value ?? "NULL").slice(0, 100)) + 28),
      ),
    ),
  );
}
