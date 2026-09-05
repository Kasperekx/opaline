import {
  AlertTriangle,
  Braces,
  Code2,
  Columns3,
  GitFork,
  ListTree,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useId, useState } from "react";
import { ViewTabs } from "../../shared/components/ViewTabs";
import type { TableTab } from "../query/query-types";
import { StructureColumns } from "./StructureColumns";
import { StructureConstraints, StructureIndexes } from "./StructureDefinitions";
import { StructureDdl } from "./StructureDdl";
import { StructureForeignKeys } from "./StructureForeignKeys";
import { useRelationStructure } from "./useRelationStructure";
import "./structure.css";

type StructureSection =
  | "columns"
  | "indexes"
  | "foreign-keys"
  | "constraints"
  | "ddl";

type StructureInspectorProps = {
  tab: TableTab;
  onOpenQuery: (sql: string, title: string) => void;
  onOpenTable: (schema: string, table: string) => void;
};

export function StructureInspector({
  tab,
  onOpenQuery,
  onOpenTable,
}: StructureInspectorProps) {
  const id = useId();
  const [section, setSection] = useState<StructureSection>("columns");
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
  return (
    <section
      className="structure-inspector"
      aria-label={`Structure of ${tab.schema}.${tab.table}`}
      aria-busy={busy}
    >
      <header className="structure-header">
        <div>
          <div className="structure-identity">
            <span>{tab.schema}</span>
            <strong>{tab.table}</strong>
            {data && <span className="structure-badge">{data.objectType}</span>}
          </div>
          <p>
            {data?.comment ||
              "Columns, relationships and definitions for this database object."}
          </p>
        </div>
        <div className="structure-header-actions">
          {data && (
            <span className="structure-owner">
              Owner <strong>{data.owner}</strong>
            </span>
          )}
          <button
            type="button"
            className="toolbar-button"
            disabled={busy}
            onClick={refresh}
            aria-label="Refresh structure"
          >
            <RefreshCw size={15} className={busy ? "spin" : ""} /> Refresh
          </button>
        </div>
      </header>
      {error && (
        <div className="table-notice error" role="alert">
          <AlertTriangle size={15} />
          <span>
            {error}
            {data && " Showing the previous snapshot."}
          </span>
          <button type="button" disabled={busy} onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      <ViewTabs
        id={id}
        label="Structure sections"
        tabs={sections}
        active={section}
        onChange={setSection}
      />
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
            <div className="structure-empty" role="status">
              <Loader2 className="spin" size={22} />
              Loading structure…
            </div>
          ) : (
            data &&
            section === value && (
              <>
                {value === "columns" && (
                  <StructureColumns columns={data.columns} />
                )}
                {value === "indexes" && (
                  <StructureIndexes indexes={data.indexes} />
                )}
                {value === "foreign-keys" && (
                  <StructureForeignKeys
                    foreignKeys={data.foreignKeys}
                    onOpenTable={onOpenTable}
                  />
                )}
                {value === "constraints" && (
                  <StructureConstraints constraints={data.constraints} />
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
