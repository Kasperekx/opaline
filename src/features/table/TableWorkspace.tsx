import { Columns3, Table2 } from "lucide-react";
import { useId, useState } from "react";
import { ViewTabs } from "../../shared/components/ViewTabs";
import type { TableTab } from "../query/query-types";
import { StructureInspector } from "../structure/StructureInspector";
import { TableDataView } from "./TableDataView";
import type { OpenRelatedTable } from "./table-relations";

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
  return (
    <section className="table-workspace">
      <ViewTabs
        id={id}
        label="Table view"
        active={view}
        tabs={[
          { id: "data", label: "Data", Icon: Table2 },
          { id: "structure", label: "Structure", Icon: Columns3 },
        ]}
        onChange={(next) => {
          setView(next);
          if (next === "structure") setStructureVisited(true);
        }}
      />
      <div
        className="table-view-panel"
        role="tabpanel"
        id={`${id}-panel-data`}
        aria-labelledby={`${id}-tab-data`}
        hidden={view !== "data"}
      >
        <TableDataView
          tab={tab}
          active={active && view === "data"}
          onDirtyChange={onDirtyChange}
          onOpenQuery={onOpenQuery}
          onOpenRelated={onOpenRelated}
        />
      </div>
      <div
        className="table-view-panel"
        role="tabpanel"
        id={`${id}-panel-structure`}
        aria-labelledby={`${id}-tab-structure`}
        hidden={view !== "structure"}
      >
        {structureVisited && (
          <StructureInspector
            onEditStructure={onEditStructure}
            tab={tab}
            onOpenQuery={onOpenQuery}
            onOpenTable={onOpenTable}
          />
        )}
      </div>
    </section>
  );
}
