import { Columns3, Table2 } from "lucide-react";
import { useId, useState } from "react";
import { ViewTabs } from "../../shared/components/ViewTabs";
import type { TableTab } from "../query/query-types";
import { StructureInspector } from "../structure/StructureInspector";
import { TableDataView } from "./TableDataView";

type TableWorkspaceProps = {
  tab: TableTab;
  onOpenQuery: (sql: string, title: string) => void;
  onOpenTable: (schema: string, table: string) => void;
};

export function TableWorkspace({
  tab,
  onOpenQuery,
  onOpenTable,
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
        <TableDataView tab={tab} onOpenQuery={onOpenQuery} />
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
            tab={tab}
            onOpenQuery={onOpenQuery}
            onOpenTable={onOpenTable}
          />
        )}
      </div>
    </section>
  );
}
