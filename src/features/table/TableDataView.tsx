import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Check,
  Code2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { qualifiedRelationName } from "../../shared/lib/database-object";
import type { ColumnInfo } from "../../shared/types/database";
import type { TableTab } from "../query/query-types";
import { useTableData } from "./useTableData";

type TableDataViewProps = {
  tab: TableTab;
  onOpenQuery: (sql: string, title: string) => void;
};

type CellEditorProps = {
  column: ColumnInfo;
  value: string | null;
  onChange: (value: string | null) => void;
  onCommit: () => void;
  onCancel: () => void;
};

function CellEditor({
  column,
  value,
  onChange,
  onCommit,
  onCancel,
}: CellEditorProps) {
  const managed = column.identity || column.generated;
  if (managed) return <CellValue value={value} />;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") onCancel();
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
  };

  return (
    <div className={`cell-editor ${value === null ? "is-null" : ""}`}>
      <input
        value={value ?? ""}
        disabled={value === null}
        aria-label={`Value for ${column.name}`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {column.nullable && (
        <button
          type="button"
          aria-label={value === null ? `Set a value for ${column.name}` : `Set ${column.name} to NULL`}
          aria-pressed={value === null}
          onClick={() => onChange(value === null ? "" : null)}
        >
          NULL
        </button>
      )}
    </div>
  );
}

function CellValue({ value }: { value: string | null }) {
  return value === null ? (
    <span className="table-null">NULL</span>
  ) : (
    <span className="table-cell-value" title={value}>
      {value}
    </span>
  );
}

export function TableDataView({ tab, onOpenQuery }: TableDataViewProps) {
  const table = useTableData(tab);
  const dataViewportRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<number | null>(null);
  const qualifiedName = qualifiedRelationName(tab.schema, tab.table);
  const data = table.data;

  const openQuery = () => {
    onOpenQuery(`select *\nfrom ${qualifiedName}\nlimit 100;`, `${tab.table} query`);
  };

  useEffect(() => {
    dataViewportRef.current?.scrollTo({ top: 0, left: 0 });
  }, [tab.id, table.filter, table.page, table.pageSize, table.sort]);

  return (
    <section className="table-data-view" aria-label={`Data in ${qualifiedName}`}>
      <header className="table-data-toolbar">
        <div className="table-identity">
          <span>{tab.schema}</span>
          <strong>{tab.table}</strong>
          {data && (
            <span className={`editability-badge ${data.editable ? "editable" : "readonly"}`}>
              {data.editable ? <ShieldCheck size={13} /> : <LockKeyhole size={13} />}
              {data.editable ? "Safe editing" : "Read only"}
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
              disabled={table.busy || table.mutationBusy}
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
            disabled={
              table.busy ||
              table.mutationBusy ||
              table.filterDraft.trim() === table.filter
            }
          >
            <ArrowRight size={13} />
          </button>
        </form>
        <div className="table-toolbar-actions">
          <button type="button" onClick={openQuery}>
            <Code2 size={15} /> <span>Open SQL</span>
          </button>
          <button
            type="button"
            aria-label="Refresh table data"
            title="Refresh table data"
            disabled={table.busy || table.mutationBusy}
            onClick={table.refresh}
          >
            <RefreshCw className={table.busy ? "spin" : ""} size={15} />
          </button>
        </div>
      </header>

      {(table.error || table.mutationError || data?.editabilityReason) && (
        <div
          className={`table-notice ${table.error || table.mutationError ? "error" : ""}`}
          role={table.error || table.mutationError ? "alert" : "status"}
        >
          {table.error || table.mutationError ? (
            <AlertTriangle size={15} />
          ) : (
            <LockKeyhole size={14} />
          )}
          <span>{table.error || table.mutationError || data?.editabilityReason}</span>
          {table.error && (
            <button type="button" onClick={table.refresh}>
              Retry
            </button>
          )}
        </div>
      )}

      <div ref={dataViewportRef} className="table-data-grid-wrap">
        {table.busy && !data ? (
          <div className="table-data-state" aria-live="polite">
            <Loader2 className="spin" size={21} />
            <span>Loading table data…</span>
          </div>
        ) : data && data.rows.length > 0 ? (
          <table className="table-data-grid">
            <thead>
              <tr>
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
                        disabled={table.busy || table.mutationBusy}
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
              {data.rows.map((row, rowIndex) => {
                const editing = table.draft?.rowIndex === rowIndex;
                return (
                  <tr className={editing ? "editing" : ""} key={rowIndex}>
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
                            title={data.editable ? "Edit row" : data.editabilityReason ?? "Read only"}
                            disabled={!data.editable || table.mutationBusy}
                            onClick={() => table.startEditing(rowIndex)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="delete-row"
                            aria-label="Delete row"
                            title={data.editable ? "Delete row" : data.editabilityReason ?? "Read only"}
                            disabled={!data.editable || table.mutationBusy}
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
                          <CellEditor
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
                : "There is no data to display yet."}
            </span>
            {table.filter && (
              <button type="button" onClick={table.clearFilter}>
                Clear filter
              </button>
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
        </div>
        <label>
          Rows per page
          <select
            value={table.pageSize}
            disabled={table.busy || table.mutationBusy}
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
            disabled={table.page === 0 || table.busy || table.mutationBusy}
            onClick={() => table.setPage(table.page - 1)}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={!data?.hasMore || table.busy || table.mutationBusy}
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
              <button
                type="button"
                autoFocus
                onClick={() => setDeleteCandidate(null)}
              >
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
