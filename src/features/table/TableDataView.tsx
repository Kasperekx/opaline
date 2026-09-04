import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  CheckSquare2,
  Code2,
  FileJson2,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { qualifiedRelationName } from "../../shared/lib/database-object";
import type { TableTab } from "../query/query-types";
import { CellValue, EditableCell, InsertCell, SelectionCheckbox } from "./TableCells";
import { TableExportMenu } from "./TableExportMenu";
import { useTableData } from "./useTableData";
import { useTableExport } from "./useTableExport";

type TableDataViewProps = {
  tab: TableTab;
  onOpenQuery: (sql: string, title: string) => void;
};

export function TableDataView({ tab, onOpenQuery }: TableDataViewProps) {
  const table = useTableData(tab);
  const dataViewportRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<number | null>(null);
  const qualifiedName = qualifiedRelationName(tab.schema, tab.table);
  const data = table.data;
  const tableExport = useTableExport({
    schema: tab.schema,
    table: tab.table,
    columns: data?.columns ?? [],
    visibleRows: data?.rows ?? [],
    selectedRows: table.selectedRows,
  });
  const draftLocked = table.hasDraft || table.mutationBusy;
  const interactionLocked = table.busy || draftLocked;
  const visibleRowCount = data?.rows.length ?? 0;
  const firstInsertInput = table.insertDraft?.values.findIndex(
    (value) => typeof value === "string",
  );

  const openQuery = () => {
    onOpenQuery(`select *\nfrom ${qualifiedName}\nlimit 100;`, `${tab.table} query`);
  };

  useEffect(() => {
    dataViewportRef.current?.scrollTo({ top: 0, left: 0 });
  }, [data?.page, tab.id, table.filter, table.page, table.pageSize, table.sort]);

  const capabilityLabel = data?.editable
    ? "Safe editing"
    : data?.insertable
      ? "Insert only"
      : "Read only";
  const capabilityReason = data?.editabilityReason ?? data?.insertabilityReason;

  return (
    <section className="table-data-view" aria-label={`Data in ${qualifiedName}`}>
      <header className="table-data-toolbar">
        <div className="table-identity">
          <span>{tab.schema}</span>
          <strong>{tab.table}</strong>
          {data && (
            <span
              className={`editability-badge ${
                data.editable ? "editable" : data.insertable ? "insertable" : "readonly"
              }`}
            >
              {data.editable ? (
                <ShieldCheck size={13} />
              ) : data.insertable ? (
                <Plus size={13} />
              ) : (
                <LockKeyhole size={13} />
              )}
              {capabilityLabel}
            </span>
          )}
        </div>
        <form
          className="table-filter"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            table.applyFilter();
          }}
        >
          <Search size={14} />
          <input
            value={table.filterDraft}
            maxLength={500}
            aria-label="Filter table rows"
            placeholder="Filter all columns…"
            onChange={(event) => table.setFilterDraft(event.target.value)}
          />
          {table.filterDraft && (
            <button
              type="button"
              aria-label="Clear row filter"
              disabled={interactionLocked}
              onClick={table.clearFilter}
            >
              <X size={13} />
            </button>
          )}
          <button
            type="submit"
            className="apply-filter"
            aria-label="Apply row filter"
            title="Apply filter"
            disabled={interactionLocked || table.filterDraft.trim() === table.filter}
          >
            <ArrowRight size={13} />
          </button>
        </form>
        <div className="table-toolbar-actions">
          <button
            type="button"
            title={data?.insertable ? "Add row" : data?.insertabilityReason ?? "Read only"}
            disabled={!data?.insertable || interactionLocked}
            onClick={table.startInserting}
          >
            <Plus size={15} /> <span>Add row</span>
          </button>
          <TableExportMenu
            busy={tableExport.busy}
            disabled={
              (visibleRowCount === 0 && table.selectedCount === 0) || draftLocked
            }
            rowCount={visibleRowCount}
            selectedCount={table.selectedCount}
            onExport={(format) => void tableExport.exportRows(format)}
          />
          <button type="button" onClick={openQuery}>
            <Code2 size={15} /> <span>Open SQL</span>
          </button>
          <button
            type="button"
            aria-label="Refresh table data"
            title="Refresh table data"
            disabled={interactionLocked}
            onClick={table.refresh}
          >
            <RefreshCw className={table.busy ? "spin" : ""} size={15} />
          </button>
        </div>
      </header>

      <div className="table-context-stack">
        {(table.error || table.mutationError || capabilityReason) && (
          <div
            className={`table-notice ${table.error || table.mutationError ? "error" : ""}`}
            role={table.error || table.mutationError ? "alert" : "status"}
          >
            {table.error || table.mutationError ? (
              <AlertTriangle size={15} />
            ) : (
              <LockKeyhole size={14} />
            )}
            <span>{table.error || table.mutationError || capabilityReason}</span>
            {table.error && (
              <button type="button" onClick={table.refresh}>
                Retry
              </button>
            )}
          </div>
        )}
        {table.mutationMessage && (
          <div className="table-notice success" role="status">
            <CheckCircle2 size={15} />
            <span>{table.mutationMessage}</span>
            <button type="button" onClick={table.dismissMutationMessage}>
              Dismiss
            </button>
          </div>
        )}
        {tableExport.error && (
          <div className="table-notice error" role="alert">
            <AlertTriangle size={15} />
            <span>Could not export rows: {tableExport.error}</span>
            <button type="button" onClick={tableExport.clearStatus}>
              Dismiss
            </button>
          </div>
        )}
        {tableExport.savedFilename && (
          <div className="table-notice success" role="status">
            <CheckCircle2 size={15} />
            <span>Saved {tableExport.savedFilename}</span>
            <button type="button" onClick={tableExport.clearStatus}>
              Dismiss
            </button>
          </div>
        )}
        {table.selectedCount > 0 && (
          <div className="table-selection-bar" role="status">
            <CheckSquare2 size={15} />
            <strong>{table.selectedCount} selected</strong>
            <span>Selection is kept while you move between pages.</span>
            <div>
              <button
                type="button"
                disabled={tableExport.busy}
                onClick={() => void tableExport.exportRows("csv")}
              >
                <FileSpreadsheet size={14} /> CSV
              </button>
              <button
                type="button"
                disabled={tableExport.busy}
                onClick={() => void tableExport.exportRows("json")}
              >
                <FileJson2 size={14} /> JSON
              </button>
              <button type="button" onClick={table.clearSelection}>
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={dataViewportRef} className="table-data-grid-wrap">
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
                      disabled={table.mutationBusy}
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
                            disabled={table.mutationBusy || table.changedCellCount === 0}
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
                              data.editable ? "Edit row" : data.editabilityReason ?? "Read only"
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
                              data.editable ? "Delete row" : data.editabilityReason ?? "Read only"
                            }
                            disabled={!data.editable || draftLocked}
                            onClick={() => setDeleteCandidate(rowIndex)}
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

      {deleteCandidate !== null && data?.rows[deleteCandidate] && (
        <div
          className="row-delete-layer"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !table.mutationBusy) {
              setDeleteCandidate(null);
            }
            if (event.key === "Tab") {
              const buttons = deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              );
              if (!buttons?.length) return;
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !table.mutationBusy) {
              setDeleteCandidate(null);
            }
          }}
        >
          <div
            ref={deleteDialogRef}
            className="row-delete-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-row-title"
          >
            <div>
              <Trash2 size={17} />
              <span>
                <strong id="delete-row-title">Delete this row?</strong>
                This change is committed immediately and cannot be undone.
              </span>
            </div>
            <div>
              <button type="button" autoFocus onClick={() => setDeleteCandidate(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                disabled={table.mutationBusy}
                onClick={async () => {
                  if (await table.deleteRow(deleteCandidate)) setDeleteCandidate(null);
                }}
              >
                {table.mutationBusy && <Loader2 className="spin" size={14} />}
                Delete row
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
