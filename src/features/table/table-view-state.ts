import {
  markUnreadableStorage,
  readLocalJson,
} from "../../shared/lib/local-storage";
import type { TableSort, TableFilter } from "../../shared/types/database";
export const tableViewKey = (
  profileId: string,
  schema: string,
  table: string,
) => `opaline.table-view.v1.${profileId}.${JSON.stringify([schema, table])}`;
export type TableViewState = {
  page: number;
  pageSize: number;
  filter: string;
  sort: TableSort | null;
  conditions: TableFilter[];
  widths: Record<string, number>;
  pinnedColumn: string | null;
  density: "comfortable" | "compact" | "default";
};
export function validFilters(value: unknown): value is TableFilter[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every(
      (item) =>
        item &&
        typeof item.column === "string" &&
        item.column.length > 0 &&
        item.column.length <= 255 &&
        [
          "eq",
          "ne",
          "contains",
          "gt",
          "gte",
          "lt",
          "lte",
          "is_null",
          "is_not_null",
        ].includes(item.operator) &&
        typeof item.value === "string" &&
        item.value.length <= 4096 &&
        !item.value.includes("\0"),
    )
  );
}
export function readTableView(key: string): TableViewState {
  const fallback: TableViewState = {
    page: 0,
    pageSize: 50,
    filter: "",
    sort: null,
    conditions: [],
    widths: {},
    pinnedColumn: null,
    density: "default",
  };
  const value = readLocalJson<Partial<TableViewState> | null>(key, null);
  if (!value) return fallback;
  if (
    !Number.isInteger(value.page) ||
    value.page! < 0 ||
    value.page! > 1e6 ||
    ![25, 50, 100].includes(value.pageSize!) ||
    typeof value.filter !== "string" ||
    value.filter.length > 1000 ||
    (value.sort !== null &&
      (!value.sort ||
        typeof value.sort.column !== "string" ||
        !["asc", "desc"].includes(value.sort.direction)))
  ) {
    markUnreadableStorage(key);
    return fallback;
  }
  const conditions = value.conditions ?? [];
  const widths = value.widths ?? {};
  if (
    !validFilters(conditions) ||
    !widths ||
    typeof widths !== "object" ||
    Array.isArray(widths) ||
    Object.entries(widths).some(
      ([name, width]) =>
        name.length > 255 ||
        !Number.isFinite(width) ||
        width < 100 ||
        width > 1000,
    ) ||
    (value.pinnedColumn != null && typeof value.pinnedColumn !== "string") ||
    (value.density !== undefined &&
      !["default", "comfortable", "compact"].includes(value.density))
  ) {
    markUnreadableStorage(key);
    return fallback;
  }
  return { ...fallback, ...value, conditions, widths } as TableViewState;
}
