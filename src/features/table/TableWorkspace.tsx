import { useId, useMemo, useState } from "react";
import { ViewTabs } from "../../shared/components/ViewTabs";
import type { TableTab } from "../query/query-types";
import { StructureInspector } from "../structure/StructureInspector";
import { TableDataView } from "./TableDataView";
import type { OpenRelatedTable } from "./table-relations";
import { TableToolbarSlot } from "./table-toolbar-slot";

type TableWorkspaceProps = {
  onEditStructure?: () => void;
  tab: TableTab;
  active: boolean;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onOpenQuery: (sql: string, title: string) => void;
  onOpenTable: (schema: string, table: string) => void;
  onOpenRelated: OpenRelatedTable;
};

export function TableWorkspace({
  onEditStructure,
  tab,
  active,
  onDirtyChange,
  onOpenQuery,
  onOpenTable,
  onOpenRelated,
}: TableWorkspaceProps) {
  const id = useId();
  const [view, setView] = useState<"data" | "structure">("data");
  const [structureVisited, setStructureVisited] = useState(false);
  const [subtitle, setSubtitle] = useState<HTMLSpanElement | null>(null);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  const slots = useMemo(() => ({ subtitle, actions }), [subtitle, actions]);
  return (
    <section className="table-workspace">
      <header className="table-workspace-bar">
        <div className="table-title">
          <strong title={`${tab.schema}.${tab.table}`}>{tab.table}</strong>
          <span className="table-subtitle">
            {tab.schema}
            <span ref={setSubtitle} />
          </span>
        </div>
        <ViewTabs
          id={id}
          label="Table view"
          active={view}
          tabs={[
            { id: "data", label: "Data" },
            { id: "structure", label: "Structure" },
          ]}
          onChange={(next) => {
            setView(next);
            if (next === "structure") setStructureVisited(true);
          }}
        />
        <div className="table-workspace-actions" ref={setActions} />
      </header>
      <div
        className="table-view-panel"
        role="tabpanel"
        id={`${id}-panel-data`}
        aria-labelledby={`${id}-tab-data`}
        hidden={view !== "data"}
      >
        <TableToolbarSlot.Provider value={view === "data" ? slots : null}>
          <TableDataView
            tab={tab}
            active={active && view === "data"}
            onDirtyChange={onDirtyChange}
            onOpenQuery={onOpenQuery}
            onOpenRelated={onOpenRelated}
          />
        </TableToolbarSlot.Provider>
      </div>
      <div
        className="table-view-panel"
        role="tabpanel"
        id={`${id}-panel-structure`}
        aria-labelledby={`${id}-tab-structure`}
        hidden={view !== "structure"}
      >
        <TableToolbarSlot.Provider value={view === "structure" ? slots : null}>
          {structureVisited && (
            <StructureInspector
              onEditStructure={onEditStructure}
              tab={tab}
              onOpenQuery={onOpenQuery}
              onOpenTable={onOpenTable}
            />
          )}
        </TableToolbarSlot.Provider>
      </div>
    </section>
  );
}
