import {
  Code2,
  Columns3,
  CornerDownLeft,
  ListFilter,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { primaryModifierLabel } from "../../shared/lib/platform";
import { TableColumnsPopover } from "./TableColumnsPopover";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TableToolbarSlot } from "./table-toolbar-slot";
import { TableFilters } from "./TableFilters";
import { useRelationStructure } from "../structure/useRelationStructure";
import type { OpenRelatedTable } from "./table-relations";
import { qualifiedRelationName } from "../../shared/lib/database-object";
import type { TableTab } from "../query/query-types";
import { TableDataGrid, type TableGridApi } from "./TableDataGrid";
import { TableExportMenu } from "./TableExportMenu";
import { useTableData } from "./useTableData";
import { useTableExport } from "./useTableExport";
import { TableChangesBar } from "./TableChangesBar";
import { TableChangesReview } from "./TableChangesReview";
import { TablePagination } from "./TablePagination";
import { TableExportStatus } from "./TableExportStatus";
import "./inline-editing.css";
import { TableErrorNotice } from "./TableErrorNotice";
import { useDatabaseSession } from "../connections/SessionContext";
import { version } from "../../../package.json";
import { buildCommit } from "../../shared/lib/build-info";

type Props = {
  tab: TableTab;
  active: boolean;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onOpenQuery: (sql: string, title: string) => void;
  onOpenRelated?: OpenRelatedTable;
};
export function TableDataView({
  tab,
  active,
  onDirtyChange,
  onOpenQuery,
  onOpenRelated,
}: Props) {
  const { session } = useDatabaseSession();
  const table = useTableData(tab),
    { data, changes } = table;
  const qualifiedName = qualifiedRelationName(tab.schema, tab.table);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const gridApi = useRef<TableGridApi>(null);
  const [inspectorSlot, setInspectorSlot] = useState<HTMLSpanElement | null>(
    null,
  );
  const filtersButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const columnsButton = useRef<HTMLButtonElement>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  /** Scope the row search to one column (header menu, typed "name:"). */
  const searchInColumn = (name: string) => {
    table.setSearchColumnDraft(name);
    requestAnimationFrame(() => searchInput.current?.focus());
  };
  const structure = useRelationStructure(
    tab.schema,
    tab.table,
    Boolean(onOpenRelated),
  );
  const exporter = useTableExport({
    schema: tab.schema,
    table: tab.table,
    columns: data?.columns ?? [],
    visibleRows: data?.rows ?? [],
    selectedRows: table.selectedRows,
    // The effective query, so "all matching rows" matches what the grid shows.
    filter: table.query.filter ?? "",
    sort: table.sort,
    conditions: table.query.conditions,
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
  useEffect(() => {
    if (!active) return;
    // Cmd/Ctrl+F searches rows, Cmd/Ctrl+J opens Columns (find, jump, show).
    const find = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.shiftKey ||
        event.altKey ||
        event.isComposing
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "f" && key !== "j") return;
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      if (
        event.target instanceof Element &&
        event.target.closest(".cm-editor, .inline-cell-editor")
      )
        return;
      event.preventDefault();
      if (key === "f") {
        searchInput.current?.focus();
        searchInput.current?.select();
      } else setColumnsOpen(true);
    };
    window.addEventListener("keydown", find);
    return () => window.removeEventListener("keydown", find);
  }, [active]);
  const capabilityReason = data?.editabilityReason ?? data?.insertabilityReason;
  const slots = useContext(TableToolbarSlot);
  const editability = data && (
    <span
      className={
        "table-editability " +
        (data.editable ? "editable" : data.insertable ? "insertable" : "")
      }
      title={capabilityReason ?? "Changes stay local until you save"}
    >
      {" · "}
      {data.editable
        ? "Inline editing"
        : data.insertable
          ? "Insert only"
          : "Read only"}
    </span>
  );
  const actions = (
    <>
      <form
        className="table-filter search-capsule"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          table.applyFilter();
        }}
      >
        <Search size={14} aria-hidden="true" />
        {table.searchColumnDraft && (
          <button
            type="button"
            className="search-token"
            aria-label={`Search all columns instead of ${table.searchColumnDraft}`}
            title="Search all columns (Backspace)"
            disabled={locked}
            onClick={() => {
              table.setSearchColumnDraft(null);
              searchInput.current?.focus();
            }}
          >
            <span>{table.searchColumnDraft}</span>
            <X size={11} aria-hidden="true" />
          </button>
        )}
        <input
          ref={searchInput}
          aria-label="Filter table rows"
          placeholder={
            table.searchColumnDraft
              ? `Search ${table.searchColumnDraft}`
              : "Search rows"
          }
          title={`Search rows (${primaryModifierLabel}F) · type column: to search one column`}
          value={table.filterDraft}
          disabled={locked}
          onChange={(event) => {
            const value = event.target.value;
            // "email:" turns into a column token, like a Mail search token.
            const typed =
              !table.searchColumnDraft && /^([^\s:]+):(.*)$/.exec(value);
            const column =
              typed &&
              data?.columns.find(
                (item) => item.name.toLowerCase() === typed[1].toLowerCase(),
              );
            if (typed && column) {
              table.setSearchColumnDraft(column.name);
              table.setFilterDraft(typed[2].trimStart());
            } else table.setFilterDraft(value);
          }}
          onKeyDown={(event) => {
            const input = event.currentTarget;
            if (
              event.key === "Backspace" &&
              table.searchColumnDraft &&
              input.selectionStart === 0 &&
              input.selectionEnd === 0
            ) {
              event.preventDefault();
              table.setSearchColumnDraft(null);
            }
          }}
        />
        <button
          className="apply-filter"
          aria-label="Apply row filter"
          title="Apply (Return)"
          disabled={locked}
        >
          <CornerDownLeft size={13} />
        </button>
      </form>
      <div className="table-toolbar-actions toolbar-capsule">
        <button
          ref={columnsButton}
          aria-label="Columns"
          title={`Columns: find, jump to, show or hide (${primaryModifierLabel}J)`}
          aria-expanded={columnsOpen}
          className={columnsOpen ? "active" : undefined}
          disabled={!data}
          onClick={() => setColumnsOpen((value) => !value)}
        >
          <Columns3 size={16} />
          {table.hiddenColumns.length > 0 && (
            <span className="toolbar-badge" aria-hidden="true">
              {
                table.hiddenColumns.filter((name) =>
                  data?.columns.some((column) => column.name === name),
                ).length
              }
            </span>
          )}
        </button>
        <button
          aria-label="Column filters"
          title={
            table.conditions.length
              ? `Column filters · ${table.conditions.length}`
              : "Column filters"
          }
          ref={filtersButton}
          aria-expanded={filtersOpen}
          className={filtersOpen ? "active" : undefined}
          disabled={!data || locked}
          onClick={() => setFiltersOpen((value) => !value)}
        >
          <ListFilter size={16} />
          {table.conditions.length > 0 && (
            <span className="toolbar-badge" aria-hidden="true">
              {table.conditions.length}
            </span>
          )}
        </button>
        <button
          aria-label="Add row"
          disabled={
            !data?.insertable || locked || changes.summary.rows.length >= 500
          }
          title={data?.insertabilityReason ?? "Add a local row draft"}
          onClick={changes.insert}
        >
          <Plus size={16} />
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
          title="Open SQL"
          onClick={() =>
            onOpenQuery(
              "select *\nfrom " + qualifiedName + "\nlimit 100;",
              tab.table + " query",
            )
          }
        >
          <Code2 size={16} />
        </button>
        <button
          aria-label="Refresh table data"
          title="Refresh"
          disabled={table.busy || changes.busy || exporter.busy}
          onClick={table.refresh}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <span className="table-inspector-slot" ref={setInspectorSlot} />
    </>
  );
  return (
    <section
      className="table-data-view inline-editing-view"
      data-table-density={table.density}
      aria-label={"Data in " + qualifiedName}
    >
      {slots?.actions ? (
        <>
          {createPortal(actions, slots.actions)}
          {slots.subtitle &&
            editability &&
            createPortal(editability, slots.subtitle)}
        </>
      ) : (
        <header className="table-data-toolbar">
          <div className="table-title">
            <strong title={qualifiedName}>{tab.table}</strong>
            <span className="table-subtitle">
              {tab.schema}
              {editability}
            </span>
          </div>
          {actions}
        </header>
      )}
      <div className="table-context-stack">
        {onOpenRelated && structure.error && (
          <div className="table-notice" role="status">
            Relationship navigation unavailable.{" "}
            <button onClick={structure.refresh}>Retry relationships</button>
            <span title={structure.error}>{structure.error}</span>
          </div>
        )}
        <TableFilters
          table={table}
          locked={locked}
          open={filtersOpen}
          onClose={() => {
            setFiltersOpen(false);
            filtersButton.current?.focus();
          }}
          onEdit={() => setFiltersOpen(true)}
        />
        {table.error ? (
          <TableErrorNotice
            title={data ? "Could not refresh table" : "Could not load table"}
            message={table.error}
            hint={
              data
                ? "Showing previously loaded values. Retry refresh to get current data."
                : undefined
            }
            context={[
              `Opaline ${version}`,
              `Build: ${buildCommit}`,
              "Operation: load_table_page",
              `Server: ${session.serverVersion}`,
              `Database: ${session.database}`,
              `Relation: ${qualifiedName}`,
              `Page: ${table.page + 1} · Page size: ${table.pageSize}`,
              `Search active: ${Boolean(table.filter)} · Column filters: ${table.conditions.length} · Sorting active: ${Boolean(table.sort)}`,
            ].join("\n")}
          >
            <button
              className="button ghost"
              disabled={locked}
              onClick={table.refresh}
            >
              Retry
            </button>
            {(table.filter || table.conditions.length > 0 || table.sort) && (
              <button
                className="button ghost"
                disabled={locked}
                onClick={table.resetView}
              >
                Reset filters &amp; sorting
              </button>
            )}
          </TableErrorNotice>
        ) : capabilityReason ? (
          <div className="table-notice" role="status">
            <span>{capabilityReason}</span>
          </div>
        ) : null}
        <TableExportStatus exporter={exporter} part="notice" />
      </div>
      {columnsOpen && data && (
        <TableColumnsPopover
          anchor={columnsButton.current}
          columns={data.columns}
          hidden={table.hiddenColumns}
          onVisible={table.setColumnVisible}
          onShowAll={table.showAllColumns}
          onJump={(name) => {
            setColumnsOpen(false);
            gridApi.current?.revealColumn(name);
          }}
          onClose={() => {
            setColumnsOpen(false);
            columnsButton.current?.focus();
          }}
        />
      )}
      <TableDataGrid
        table={table}
        locked={locked}
        onSearchColumn={searchInColumn}
        relations={structure.data?.foreignKeys ?? []}
        onOpenRelated={onOpenRelated}
        inspectorToggleSlot={inspectorSlot}
        apiRef={gridApi}
      />
      {/* Floating chrome, bottom-centre: export progress above the one
          contextual bar (selection and/or unsaved changes). Never shifts
          the grid. */}
      <div className="table-floating-stack">
        <TableExportStatus exporter={exporter} part="progress" />
        <TableChangesBar
          table={table}
          tab={tab}
          locked={locked}
          selection={{
            copyRows: (json) => gridApi.current?.copySelectedRows(json),
            inspectRow: () => gridApi.current?.inspectSelectedRow(),
          }}
        />
      </div>
      <TablePagination
        table={table}
        locked={table.busy || changes.busy || exporter.busy}
      />
      <TableChangesReview table={table} tab={tab} />
    </section>
  );
}
