import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Check,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { CellValue, EditableCell, InsertCell, SelectionCheckbox } from "./TableCells";
import type { TableDataController } from "./useTableData";

type TableDataGridProps = {
  table: TableDataController;
  interactionLocked: boolean;
  draftLocked: boolean;
  onDeleteRow: (rowIndex: number) => void;
};

export function TableDataGrid({
  table,
  interactionLocked,
  draftLocked,
  onDeleteRow,
}: TableDataGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const data = table.data;
  const visibleRowCount = data?.rows.length ?? 0;
  const firstInsertInput = table.insertDraft?.values.findIndex(
    (value) => typeof value === "string",
  );

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }, [data?.page, table.filter, table.page, table.pageSize, table.sort]);

  return (
    <>
      <div ref={viewportRef} className="table-data-grid-wrap">
        {table.busy && !data ? (
          <div className="table-data-state" aria-live="polite">
            <Loader2 className="spin" size={21} />
            <span>Loading table data…</span>
          </div>
        ) : data && (data.rows.length > 0 || table.insertDraft) ? (
          <table className="table-data-grid">
            <thead>
              <tr>
                <th className="table-row-selection">
                  <SelectionCheckbox
                    checked={table.allPageRowsSelected}
                    indeterminate={table.somePageRowsSelected}
                    disabled={visibleRowCount === 0 || interactionLocked}
                    label="Select all rows on this page"
                    onChange={table.togglePageSelection}
                  />
                </th>
                <th className="table-row-actions" aria-label="Row actions" />
                {data.columns.map((column) => {
                  const activeSort = table.sort?.column === column.name;
                  const SortIcon = !activeSort
                    ? ArrowUpDown
                    : table.sort?.direction === "asc"
                      ? ArrowUp
                      : ArrowDown;
                  return (
                    <th key={column.name}>
                      <button
                        type="button"
                        className={activeSort ? "active" : ""}
                        aria-label={`Sort by ${column.name}`}
                        disabled={interactionLocked}
                        onClick={() => table.toggleSort(column.name)}
                      >
                        <span className="column-heading">
                          <strong>
                            {column.primaryKey && <KeyRound size={12} />}
                            {(column.identity || column.generated) && (
                              <LockKeyhole size={12} />
                            )}
                            {column.name}
                          </strong>
                          <small>{column.dataType}</small>
                        </span>
                        <SortIcon size={13} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {table.insertDraft && (
                <tr className="inserting">
                  <td className="table-row-selection">
                    <Plus size={14} aria-label="New row" />
                  </td>
                  <td className="table-row-actions">
                    <button
                      type="button"
                      className="save-row"
                      aria-label="Insert row"
                      title="Insert row"
                      disabled={table.mutationBusy || table.insertErrors.some(Boolean)}
                      onClick={() => void table.saveInsert()}
                    >
                      {table.mutationBusy ? (
                        <Loader2 className="spin" size={14} />
                      ) : (
                        <Check size={15} />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Discard new row"
                      title="Discard new row"
                      disabled={table.mutationBusy}
                      onClick={table.discardInsert}
                    >
                      <X size={15} />
                    </button>
                  </td>
                  {data.columns.map((column, columnIndex) => (
                    <td key={column.name}>
                      <InsertCell
                        column={column}
                        value={table.insertDraft?.values[columnIndex]}
                        error={table.insertErrors[columnIndex]}
                        autoFocus={firstInsertInput === columnIndex}
                        onChange={(value) => table.updateInsertValue(columnIndex, value)}
                        onCommit={() => void table.saveInsert()}
                        onCancel={table.discardInsert}
                      />
                    </td>
                  ))}
                </tr>
              )}
              {data.rows.map((row, rowIndex) => {
                const editing = table.draft?.rowIndex === rowIndex;
                const rowKey = table.rowSelectionKey(rowIndex) ?? String(rowIndex);
                const selected = table.isRowSelected(rowIndex);
                return (
                  <tr
                    className={`${editing ? "editing" : ""} ${selected ? "selected" : ""}`}
                    key={rowKey}
                  >
                    <td className="table-row-selection">
                      <SelectionCheckbox
                        checked={selected}
                        disabled={draftLocked}
                        label={`Select row ${rowIndex + 1}`}
                        onChange={() => table.toggleRowSelection(rowIndex)}
                      />
                    </td>
                    <td className="table-row-actions">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="save-row"
                            aria-label="Save row changes"
                            title="Save row changes"
                            disabled={
                              table.mutationBusy ||
                              table.changedCellCount === 0 ||
                              table.draftErrors.some(Boolean)
                            }
                            onClick={() => void table.saveChanges()}
                          >
                            {table.mutationBusy ? (
                              <Loader2 className="spin" size={14} />
                            ) : (
                              <Check size={15} />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label="Discard row changes"
                            title="Discard row changes"
                            disabled={table.mutationBusy}
                            onClick={table.discardChanges}
                          >
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label="Edit row"
                            title={
                              data.editable
                                ? "Edit row"
                                : data.editabilityReason ?? "Read only"
                            }
                            disabled={!data.editable || draftLocked}
                            onClick={() => table.startEditing(rowIndex)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="delete-row"
                            aria-label="Delete row"
                            title={
                              data.editable
                                ? "Delete row"
                                : data.editabilityReason ?? "Read only"
                            }
                            disabled={!data.editable || draftLocked}
                            onClick={() => onDeleteRow(rowIndex)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </td>
                    {data.columns.map((column, columnIndex) => (
                      <td
                        className={column.primaryKey ? "primary-key-cell" : ""}
                        key={column.name}
                      >
                        {editing && table.draft ? (
                          <EditableCell
                            column={column}
                            value={table.draft.values[columnIndex]}
                            error={table.draftErrors[columnIndex]}
                            onChange={(value) => table.updateValue(columnIndex, value)}
                            onCommit={() => void table.saveChanges()}
                            onCancel={table.discardChanges}
                          />
                        ) : (
                          <CellValue value={row.values[columnIndex]} />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : data ? (
          <div className="table-data-state">
            <Search size={20} />
            <strong>{table.filter ? "No matching rows" : "This table is empty"}</strong>
            <span>
              {table.filter
                ? "Clear the filter or try a broader search."
                : data.insertable
                  ? "Add the first row to start working with this table."
                  : "There is no data to display yet."}
            </span>
            {table.filter ? (
              <button type="button" onClick={table.clearFilter}>
                Clear filter
              </button>
            ) : (
              data.insertable && (
                <button type="button" onClick={table.startInserting}>
                  <Plus size={14} /> Add first row
                </button>
              )
            )}
          </div>
        ) : null}
        {table.busy && data && (
          <div className="table-loading-overlay" aria-label="Refreshing table data">
            <Loader2 className="spin" size={20} />
          </div>
        )}
      </div>

      <footer className="table-pagination">
        <div>
          <span>
            Page {table.page + 1}
            {data && ` · ${data.rows.length} rows`}
          </span>
          {table.filter && <span className="filter-active">Filtered</span>}
          {table.selectedCount > 0 && (
            <span className="selection-count">{table.selectedCount} selected</span>
          )}
        </div>
        <label>
          Rows per page
          <select
            value={table.pageSize}
            disabled={interactionLocked}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
          >
            {[25, 50, 100].map((size) => (
              <option value={size} key={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="pagination-buttons">
          <button
            type="button"
            aria-label="Previous page"
            disabled={table.page === 0 || interactionLocked}
            onClick={() => table.setPage(table.page - 1)}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={!data?.hasMore || interactionLocked}
            onClick={() => table.setPage(table.page + 1)}
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </footer>
    </>
  );
}
