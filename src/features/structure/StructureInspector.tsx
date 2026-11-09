import {
  AlertTriangle,
  Braces,
  Code2,
  Columns3,
  GitFork,
  ListTree,
  Pencil,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useContext, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ViewTabs } from "../../shared/components/ViewTabs";
import type { TableTab } from "../query/query-types";
import { TableToolbarSlot } from "../table/table-toolbar-slot";
import { StructureColumns } from "./StructureColumns";
import {
  StructureConstraints,
  StructureEmpty,
  StructureIndexes,
} from "./StructureDefinitions";
import { StructureDdl } from "./StructureDdl";
import { StructureForeignKeys } from "./StructureForeignKeys";
import { filterStructure } from "./structure-filter";
import { useRelationStructure } from "./useRelationStructure";
import "./structure.css";

// Placeholder definition rows (name · type · default) for the first load.
const structureSkeleton = Array.from({ length: 9 }, (_, row) => [
  Math.round(88 + ((row * 37) % 5) * 18),
  Math.round(64 + ((row * 23) % 4) * 14),
  Math.round(40 + ((row * 11) % 3) * 24),
]);

type StructureSection =
  "columns" | "indexes" | "foreign-keys" | "constraints" | "ddl";

type StructureInspectorProps = {
  onEditStructure?: () => void;
  tab: TableTab;
  onOpenQuery: (sql: string, title: string) => void;
  onOpenTable: (schema: string, table: string) => void;
};

export function StructureInspector({
  onEditStructure,
  tab,
  onOpenQuery,
  onOpenTable,
}: StructureInspectorProps) {
  const id = useId();
  const [section, setSection] = useState<StructureSection>("columns");
  const [filter, setFilter] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const slots = useContext(TableToolbarSlot);
  const { data, busy, error, refresh } = useRelationStructure(
    tab.schema,
    tab.table,
  );
  const sections = [
    {
      id: "columns" as const,
      label: "Columns",
      Icon: Columns3,
      count: data?.columns.length,
    },
    {
      id: "indexes" as const,
      label: "Indexes",
      Icon: ListTree,
      count: data?.indexes.length,
    },
    {
      id: "foreign-keys" as const,
      label: "Foreign keys",
      Icon: GitFork,
      count: data?.foreignKeys.length,
    },
    {
      id: "constraints" as const,
      label: "Constraints",
      Icon: Braces,
      count: data?.constraints.length,
    },
    { id: "ddl" as const, label: "DDL", Icon: Code2 },
  ];
  const filtered = data ? filterStructure(data, filter) : null;
  const visibleCounts = {
    columns: filtered?.columns.length ?? 0,
    indexes: filtered?.indexes.length ?? 0,
    "foreign-keys": filtered?.foreignKeys.length ?? 0,
    constraints: filtered?.constraints.length ?? 0,
  };
  const activeLabel = sections
    .find((item) => item.id === section)!
    .label.toLowerCase();
  const total = sections.find((item) => item.id === section)?.count ?? 0;
  const noMatches =
    section !== "ddl" && filter.trim() !== "" && visibleCounts[section] === 0;
  const meta = data && (
    <div className="structure-object-meta">
      <span>
        Owner <strong>{data.owner}</strong>
      </span>
      {data.comment && <p>{data.comment}</p>}
    </div>
  );
  const actions = (
    <div className="toolbar-capsule structure-header-actions">
      {onEditStructure && data?.objectType === "Table" && (
        <button type="button" onClick={onEditStructure}>
          <Pencil size={14} aria-hidden="true" /> Edit structure
        </button>
      )}
      <button
        type="button"
        className="structure-refresh"
        disabled={busy}
        onClick={refresh}
        aria-label="Refresh structure"
        title="Refresh structure"
      >
        <RefreshCw
          size={15}
          aria-hidden="true"
          className={busy ? "spin" : ""}
        />
      </button>
    </div>
  );
  return (
    <section
      className="structure-inspector"
      aria-label={`Structure of ${tab.schema}.${tab.table}`}
      aria-busy={busy}
    >
      {slots?.actions ? (
        <>
          {createPortal(actions, slots.actions)}
          {slots.subtitle &&
            data &&
            createPortal(
              <span className="structure-object-type">
                {" · "}
                {data.objectType}
              </span>,
              slots.subtitle,
            )}
          {meta && <div className="structure-meta-row">{meta}</div>}
        </>
      ) : (
        <header className="structure-header">
          <div className="structure-object">
            <div className="structure-identity">
              <strong>{tab.table}</strong>
              <span>
                {tab.schema}
                {data && <> · {data.objectType}</>}
              </span>
            </div>
            {meta}
          </div>
          {actions}
        </header>
      )}
      {error && (
        <div className="structure-error" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <div>
            <strong>
              {data
                ? "Structure could not be refreshed"
                : "Structure could not be loaded"}
            </strong>
            <p>{error}</p>
            {data && (
              <p className="structure-muted">Showing the previous snapshot.</p>
            )}
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={refresh}
          >
            Retry
          </button>
        </div>
      )}
      <div className="structure-section-bar">
        <ViewTabs
          id={id}
          label="Structure sections"
          tabs={sections}
          active={section}
          onChange={(next) => {
            setSection(next);
            setFilter("");
          }}
        />
        {section !== "ddl" && data && (
          <div className="structure-section-toolbar">
            <span className="structure-section-count" role="status">
              {filter.trim() ? `${visibleCounts[section]} of ${total}` : total}{" "}
              {activeLabel}
            </span>
            <div className="search-capsule structure-search">
              <Search size={13} aria-hidden="true" />
              <input
                ref={searchInput}
                aria-label={`Filter ${activeLabel}`}
                placeholder={`Filter ${activeLabel}`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {filter && (
                <button
                  type="button"
                  className="icon-button subtle"
                  aria-label="Clear filter"
                  onClick={() => {
                    setFilter("");
                    searchInput.current?.focus();
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {sections.map(({ id: value }) => (
        <div
          key={value}
          className={`structure-panel ${value === "ddl" ? "ddl-panel" : ""}`}
          role="tabpanel"
          tabIndex={0}
          id={`${id}-panel-${value}`}
          aria-labelledby={`${id}-tab-${value}`}
          hidden={section !== value}
        >
          {busy && !data ? (
            <div className="structure-skeleton skeleton" role="status">
              <span className="sr-only">Loading structure…</span>
              {structureSkeleton.map((widths, row) => (
                <div className="skeleton-row" aria-hidden="true" key={row}>
                  {widths.map((width, column) => (
                    <i
                      key={column}
                      style={
                        { "--skeleton-width": `${width}px` } as CSSProperties
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : !data ? (
            <StructureEmpty
              title="Metadata unavailable"
              description="Retry loading the structure to inspect this object."
            />
          ) : noMatches ? (
            <StructureEmpty
              title={`No matching ${activeLabel}`}
              description="Try another name, column or definition."
              Icon={Search}
            />
          ) : (
            filtered &&
            section === value && (
              <>
                {value === "columns" && (
                  <StructureColumns columns={filtered.columns} />
                )}
                {value === "indexes" && (
                  <StructureIndexes indexes={filtered.indexes} />
                )}
                {value === "foreign-keys" && (
                  <StructureForeignKeys
                    foreignKeys={filtered.foreignKeys}
                    onOpenTable={onOpenTable}
                  />
                )}
                {value === "constraints" && (
                  <StructureConstraints constraints={filtered.constraints} />
                )}
                {value === "ddl" && (
                  <StructureDdl
                    ddl={data.ddl}
                    notes={data.ddlNotes}
                    onOpenQuery={(sql) => onOpenQuery(sql, `${tab.table} DDL`)}
                  />
                )}
              </>
            )
          )}
        </div>
      ))}
    </section>
  );
}
