import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CheckSquare2,
  Code2,
  FileJson2,
  FileSpreadsheet,
  HardDriveDownload,
  LockKeyhole,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { qualifiedRelationName } from "../../shared/lib/database-object";
import type { TableTab } from "../query/query-types";
import { BulkUpdateDialog } from "./BulkUpdateDialog";
import { TableDataGrid } from "./TableDataGrid";
import { TableExportMenu } from "./TableExportMenu";
import { formatExportSize } from "./table-export";
import { TableMutationDialog } from "./TableMutationDialog";
import { MAX_BULK_MUTATION_ROWS, useTableData } from "./useTableData";
import { useTableExport } from "./useTableExport";

type TableDataViewProps = {
  tab: TableTab;
  onOpenQuery: (sql: string, title: string) => void;
};

export function TableDataView({ tab, onOpenQuery }: TableDataViewProps) {
  const table = useTableData(tab);
  const [deleteCandidate, setDeleteCandidate] = useState<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const qualifiedName = qualifiedRelationName(tab.schema, tab.table);
  const data = table.data;
  const tableExport = useTableExport({
    schema: tab.schema,
    table: tab.table,
    columns: data?.columns ?? [],
    visibleRows: data?.rows ?? [],
    selectedRows: table.selectedRows,
    filter: table.filter,
    sort: table.sort,
  });
  const draftLocked = table.hasDraft || table.mutationBusy;
  const interactionLocked = table.busy || draftLocked || tableExport.busy;
  const visibleRowCount = data?.rows.length ?? 0;

  const openQuery = () => {
    onOpenQuery(`select *\nfrom ${qualifiedName}\nlimit 100;`, `${tab.table} query`);
  };

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
            onExportAll={(format) => void tableExport.exportAllRows(format)}
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
            {table.mutationError && (
              <button type="button" onClick={table.dismissMutationError}>
                Dismiss
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
        {tableExport.statusMessage && (
          <div className="table-notice" role="status">
            <CheckCircle2 size={15} />
            <span>{tableExport.statusMessage}</span>
            <button type="button" onClick={tableExport.clearStatus}>
              Dismiss
            </button>
          </div>
        )}
        {tableExport.fullExport && (
          <div className="table-export-progress" role="status" aria-live="polite">
            <HardDriveDownload size={16} />
            <span>
              <strong>Exporting all matching rows</strong>
              {tableExport.fullExport.rowsExported.toLocaleString()} rows ·{" "}
              {formatExportSize(tableExport.fullExport.bytesWritten)}
            </span>
            <span className="table-export-progress-track" aria-hidden="true">
              <i />
            </span>
            <button
              type="button"
              disabled={tableExport.fullExport.cancelling}
              onClick={() => void tableExport.cancelFullExport()}
            >
              {tableExport.fullExport.cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        )}
        {table.selectedCount > 0 && (
          <div className="table-selection-bar" role="status">
            <CheckSquare2 size={15} />
            <strong>{table.selectedCount} selected</strong>
            <span>
              {table.selectedCount > MAX_BULK_MUTATION_ROWS
                ? `Bulk changes are limited to ${MAX_BULK_MUTATION_ROWS} rows.`
                : "Selection is kept while you move between pages."}
            </span>
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
              <button
                type="button"
                disabled={
                  !data?.editable ||
                  table.mutationBusy ||
                  tableExport.busy ||
                  table.selectedCount > MAX_BULK_MUTATION_ROWS
                }
                title={data?.editable ? "Set one value on selected rows" : capabilityReason ?? "Read only"}
                onClick={table.startBulkUpdate}
              >
                <PencilLine size={14} /> Set value
              </button>
              <button
                type="button"
                className="danger"
                disabled={
                  !data?.editable ||
                  table.mutationBusy ||
                  tableExport.busy ||
                  table.selectedCount > MAX_BULK_MUTATION_ROWS
                }
                title={data?.editable ? "Delete selected rows" : capabilityReason ?? "Read only"}
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button type="button" onClick={table.clearSelection}>
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      <TableDataGrid
        table={table}
        interactionLocked={interactionLocked}
        draftLocked={draftLocked}
        onDeleteRow={setDeleteCandidate}
      />
      <TableMutationDialog
        open={deleteCandidate !== null && Boolean(data?.rows[deleteCandidate])}
        title="Delete this row?"
        description="This change is committed immediately and cannot be undone."
        confirmLabel="Delete row"
        Icon={Trash2}
        busy={table.mutationBusy}
        danger
        error={table.mutationError}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => {
          if (deleteCandidate === null) return;
          void table.deleteRow(deleteCandidate).then((deleted) => {
            if (deleted) setDeleteCandidate(null);
          });
        }}
      />
      <TableMutationDialog
        open={bulkDeleteOpen && table.selectedCount > 0}
        title={`Delete ${table.selectedCount} selected rows?`}
        description="The operation is atomic: if one row changed, none of them will be deleted."
        confirmLabel={`Delete ${table.selectedCount} rows`}
        Icon={Trash2}
        busy={table.mutationBusy}
        danger
        error={table.mutationError}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => {
          void table.deleteSelected().then((deleted) => {
            if (deleted) setBulkDeleteOpen(false);
          });
        }}
      />
      <BulkUpdateDialog
        open={Boolean(table.bulkUpdateDraft)}
        columns={data?.columns ?? []}
        columnIndex={table.bulkUpdateDraft?.columnIndex ?? 0}
        value={table.bulkUpdateDraft?.value ?? null}
        rowCount={table.selectedCount}
        error={table.bulkUpdateError}
        mutationError={table.mutationError}
        busy={table.mutationBusy}
        onColumnChange={table.setBulkUpdateColumn}
        onValueChange={table.updateBulkValue}
        onCancel={table.discardBulkUpdate}
        onConfirm={() => void table.saveBulkUpdate()}
      />
    </section>
  );
}
