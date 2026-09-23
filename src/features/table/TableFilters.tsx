import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { TableFilter, ColumnInfo } from "../../shared/types/database";
import type { TableDataController } from "./useTableData";

export const filterLabels: Record<TableFilter["operator"], string> = {
  eq: "equals",
  ne: "does not equal",
  contains: "contains",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  is_null: "is NULL",
  is_not_null: "is not NULL",
};
export function TableFilters({
  table,
  open,
  onClose,
  onEdit,
  locked,
}: {
  table: TableDataController;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  locked: boolean;
}) {
  return (
    <div className="table-filter-controls">
      {table.conditions.length > 0 && (
        <div className="table-filter-chips" aria-label="Active column filters">
          <span>Match all</span>
          {table.conditions.map((filter, index) => (
            <div className="table-filter-chip" key={index}>
              <button
                disabled={locked}
                onClick={onEdit}
                title={`${filter.column} ${filterLabels[filter.operator]} ${filter.value}`}
              >
                {filter.column} <span>{filterLabels[filter.operator]}</span>{" "}
                {!filter.operator.startsWith("is_") && filter.value}
              </button>
              <button
                disabled={locked}
                aria-label={`Remove filter ${index + 1}`}
                onClick={() =>
                  table.applyConditions(
                    table.conditions.filter((_, i) => i !== index),
                  )
                }
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button disabled={locked} onClick={() => table.applyConditions([])}>
            Clear filters
          </button>
        </div>
      )}
      {open && (
        <FilterEditor
          key={JSON.stringify(table.conditions)}
          initial={table.conditions}
          columns={table.data?.columns ?? []}
          locked={locked}
          onApply={table.applyConditions}
          onClose={onClose}
        />
      )}
    </div>
  );
}
function FilterEditor({
  initial,
  columns,
  locked,
  onApply,
  onClose,
}: {
  initial: TableFilter[];
  columns: ColumnInfo[];
  locked: boolean;
  onApply: (filters: TableFilter[]) => void;
  onClose: () => void;
}) {
  const blank = (): TableFilter => ({
    column: columns[0]?.name ?? "",
    operator: "eq",
    value: "",
  });
  const [draft, setDraft] = useState<TableFilter[]>(
    initial.length ? initial : [blank()],
  );
  const update = (index: number, values: Partial<TableFilter>) =>
    setDraft((current) =>
      current.map((item, i) => (i === index ? { ...item, ...values } : item)),
    );
  return (
    <form
      className="column-filter-editor"
      aria-label="Column filters"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <header>
        <strong>Match all conditions</strong>
        <button type="button" aria-label="Close filters" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      {draft.map((filter, index) => (
        <div className="column-filter-row" key={index}>
          <select
            aria-label={`Filter ${index + 1} column`}
            value={filter.column}
            disabled={locked}
            required
            onChange={(event) => update(index, { column: event.target.value })}
          >
            {!columns.some((column) => column.name === filter.column) && (
              <option value={filter.column}>
                {filter.column || "Choose column"} (unavailable)
              </option>
            )}
            {columns.map((column) => (
              <option key={column.name}>{column.name}</option>
            ))}
          </select>
          <select
            aria-label={`Filter ${index + 1} operator`}
            value={filter.operator}
            disabled={locked}
            onChange={(event) =>
              update(index, {
                operator: event.target.value as TableFilter["operator"],
              })
            }
          >
            {Object.entries(filterLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label={`Filter ${index + 1} value`}
            placeholder={
              filter.operator.startsWith("is_")
                ? "No value needed"
                : "Value (empty text is allowed)"
            }
            disabled={locked || filter.operator.startsWith("is_")}
            value={filter.value}
            maxLength={4096}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <button
            type="button"
            aria-label={`Delete condition ${index + 1}`}
            disabled={locked}
            onClick={() =>
              setDraft((current) => current.filter((_, i) => i !== index))
            }
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <footer>
        <button
          type="button"
          disabled={locked || draft.length >= 20 || !columns.length}
          onClick={() => setDraft((current) => [...current, blank()])}
        >
          <Plus size={14} /> Add condition
        </button>
        <span>Values use the column’s database type.</span>
        <button
          className="button primary"
          disabled={
            locked ||
            draft.some(
              (filter) =>
                !columns.some((column) => column.name === filter.column),
            )
          }
        >
          Apply filters
        </button>
      </footer>
    </form>
  );
}
