import { useState } from "react";
import type { TableDataPage, TableDataRow } from "../../shared/types/database";
import { tableRowKey } from "./table-change-set";

export function useTableSelection(data: TableDataPage | null) {
  const [selected, setSelected] = useState(
    () => new Map<string, TableDataRow>(),
  );
  const page =
    data?.rows.map((row, index) => ({
      row,
      key: tableRowKey(data.columns, row, `${data.page}:${index}`),
    })) ?? [];
  const count = page.filter((entry) => selected.has(entry.key)).length;
  const allPageRowsSelected = page.length > 0 && count === page.length;
  return {
    selectedRows: [...selected.values()],
    selectedCount: selected.size,
    allPageRowsSelected,
    somePageRowsSelected: count > 0 && !allPageRowsSelected,
    clearSelection: () => setSelected(new Map()),
    rowSelectionKey: (index: number) => page[index]?.key,
    isRowSelected: (index: number) =>
      Boolean(page[index] && selected.has(page[index].key)),
    toggleRowSelection: (index: number) => {
      const entry = page[index];
      if (!entry) return;
      setSelected((current) => {
        const next = new Map(current);
        if (next.has(entry.key)) next.delete(entry.key);
        else next.set(entry.key, entry.row);
        return next;
      });
    },
    togglePageSelection: () =>
      setSelected((current) => {
        const next = new Map(current);
        page.forEach(({ key, row }) => {
          if (allPageRowsSelected) next.delete(key);
          else next.set(key, row);
        });
        return next;
      }),
  };
}
