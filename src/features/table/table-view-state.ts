import {
  markUnreadableStorage,
  readLocalJson,
} from "../../shared/lib/local-storage";
import type { TableSort } from "../../shared/types/database";
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
};
export function readTableView(key: string): TableViewState {
  const fallback: TableViewState = {
    page: 0,
    pageSize: 50,
    filter: "",
    sort: null,
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
  return value as TableViewState;
}
