import {
  ArrowRight,
  Code2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { qualifiedRelationName } from "../../shared/lib/database-object";
import type { TableTab } from "../query/query-types";
import { TableDataGrid } from "./TableDataGrid";
import { TableExportMenu } from "./TableExportMenu";
import { useTableData } from "./useTableData";
import { useTableExport } from "./useTableExport";
import { TableChangesBar } from "./TableChangesBar";
import { TableChangesReview } from "./TableChangesReview";
import { TablePagination } from "./TablePagination";
import { TableSelectionBar } from "./TableSelectionBar";
import { TableExportStatus } from "./TableExportStatus";
import "./inline-editing.css";

type Props = {
  tab: TableTab;
  active: boolean;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onOpenQuery: (sql: string, title: string) => void;
};
export function TableDataView({
  tab,
  active,
  onDirtyChange,
  onOpenQuery,
}: Props) {
  const table = useTableData(tab),
    { data, changes } = table;
  const qualifiedName = qualifiedRelationName(tab.schema, tab.table);
  const exporter = useTableExport({
    schema: tab.schema,
    table: tab.table,
    columns: data?.columns ?? [],
    visibleRows: data?.rows ?? [],
    selectedRows: table.selectedRows,
    filter: table.filter,
    sort: table.sort,
  });
  const locked = table.busy || changes.disabled || exporter.busy;
  const dirty = changes.summary.rows.length > 0;
  const latest = useRef({
    save: changes.save,
    commitCell: changes.commitCell,
    locked,
  });
  latest.current = {
    save: changes.save,
    commitCell: changes.commitCell,
    locked,
  };
  useEffect(() => {
    // Retain the draft, but remove floating editors when a keyboard shortcut changes tabs.
    if (!active) latest.current.commitCell();
  }, [active]);
  useEffect(() => {
    onDirtyChange(tab.id, dirty);
  }, [onDirtyChange, tab.id, dirty]);
  useEffect(() => () => onDirtyChange(tab.id, false), [onDirtyChange, tab.id]);
  useEffect(() => {
    if (!active) return;
    const save = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s" ||
        event.shiftKey ||
        event.altKey ||
        event.isComposing
      )
        return;
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!latest.current.locked) void latest.current.save();
    };
    window.addEventListener("keydown", save, true);
    return () => window.removeEventListener("keydown", save, true);
  }, [active]);
  const capabilityReason = data?.editabilityReason ?? data?.insertabilityReason;
  return (
    <section
      className="table-data-view inline-editing-view"
      aria-label={"Data in " + qualifiedName}
    >
      <header className="table-data-toolbar">
        <div className="table-identity">
          <span>{tab.schema}</span>
          <strong>{tab.table}</strong>
          {data && (
            <span
              className={
                "editability-badge " + (data.editable ? "editable" : "")
              }
              title={capabilityReason ?? "Changes stay local until you save"}
            >
              {data.editable ? (
                <ShieldCheck size={12} />
              ) : (
                <LockKeyhole size={12} />
              )}
              {data.editable
                ? "Inline editing"
                : data.insertable
                  ? "Insert only"
                  : "Read only"}
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
          <Search size={15} />
          <input
            aria-label="Filter table rows"
            placeholder="Filter all columns…"
            value={table.filterDraft}
            disabled={locked}
            onChange={(event) => table.setFilterDraft(event.target.value)}
          />
          <button aria-label="Apply row filter" disabled={locked}>
            <ArrowRight size={15} />
          </button>
        </form>
        <div className="table-toolbar-actions">
          <button
            disabled={
              !data?.insertable || locked || changes.summary.rows.length >= 500
            }
            title={data?.insertabilityReason ?? "Add a local row draft"}
            onClick={changes.insert}
          >
            <Plus size={15} />
            <span>Add row</span>
          </button>
          <TableExportMenu
            busy={exporter.busy}
            disabled={dirty || (!data?.rows.length && !table.selectedCount)}
            rowCount={data?.rows.length ?? 0}
            selectedCount={table.selectedCount}
            onExport={(format) => void exporter.exportRows(format)}
            onExportAll={(format) => void exporter.exportAllRows(format)}
          />
          <button
            aria-label="Open SQL"
            onClick={() =>
              onOpenQuery(
                "select *\nfrom " + qualifiedName + "\nlimit 100;",
                tab.table + " query",
              )
            }
          >
            <Code2 size={15} />
            <span>Open SQL</span>
          </button>
          <button
            aria-label="Refresh table data"
            disabled={table.busy || changes.busy || exporter.busy}
            onClick={table.refresh}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>
      <div className="table-context-stack">
        {(table.error || capabilityReason) && (
          <div
            className={"table-notice " + (table.error ? "error" : "")}
            role={table.error ? "alert" : "status"}
          >
            <span>{table.error || capabilityReason}</span>
            {table.error && <button onClick={table.refresh}>Retry</button>}
          </div>
        )}
        <TableExportStatus exporter={exporter} />
        <TableSelectionBar
          table={table}
          tab={tab}
          locked={locked}
          onExport={(format) => void exporter.exportRows(format)}
        />
      </div>
      <TableDataGrid table={table} locked={locked} />
      <TableChangesBar table={table} tab={tab} />
      <TablePagination
        table={table}
        locked={table.busy || changes.busy || exporter.busy}
      />
      <TableChangesReview table={table} tab={tab} />
    </section>
  );
}
