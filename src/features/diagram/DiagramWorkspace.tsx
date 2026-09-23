import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import {
  Focus,
  Info,
  LayoutGrid,
  Loader2,
  Network,
  RefreshCw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
  Plus,
} from "lucide-react";
import { useDatabaseSession } from "../connections/SessionContext";
import type { SessionStatus } from "../connections/connection-types";
import type { DiagramTab } from "../query/query-types";
import type { DatabaseObject } from "../../shared/types/database";
import type { DatabaseDiagram } from "../../shared/types/diagram";
import { errorMessage } from "../../shared/lib/database-api";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";
import { useMediaQuery } from "../../shared/hooks/useMediaQuery";
import { arrangeGraph } from "./diagram-layout";
import {
  buildGraph,
  neighborhood,
  parseLayout,
  tableId,
  type TableNode,
  type RelationEdge,
} from "./diagram-model";
import { DiagramTableNode, DiagramRelationEdge } from "./DiagramTableNode";
import { DiagramInspector } from "./DiagramInspector";
import "@xyflow/react/dist/style.css";
import "./diagram.css";

const nodeTypes = { table: DiagramTableNode };
const edgeTypes = { relation: DiagramRelationEdge };
const fitOptions = {
  padding: { top: "40px", right: "48px", bottom: "100px", left: "48px" },
  maxZoom: 1,
} as const;

export default function DiagramWorkspace({
  tab,
  active,
  status,
  onOpenTable,
  onCreateTable,
  onEditTable,
  schemaRevision = 0,
}: {
  tab: DiagramTab;
  active: boolean;
  status: SessionStatus;
  onOpenTable: (table: DatabaseObject) => void;
  onCreateTable?: () => void;
  onEditTable?: (
    table: { schema: string; name: string },
    drop?: boolean,
  ) => void;
  schemaRevision?: number;
}) {
  const { api, session } = useDatabaseSession();
  const storageKey = `opaline.diagram.v1.${JSON.stringify([session.profileId, session.host, session.port, session.database])}`;
  const [saved] = useState(() => parseLayout(readLocalJson(storageKey, null)));
  const positions = useRef(saved.positions);
  const viewport = useRef(saved.viewport);
  const handledFocus = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<DatabaseDiagram | null>(null);
  const [loading, setLoading] = useState(true);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [arrangement, setArrangement] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [partitions, setPartitions] = useState(false);
  const [schema, setSchema] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [pointerSelection, setPointerSelection] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [nodes, setNodes] = useState<TableNode[]>([]);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [flow, setFlow] = useState<ReactFlowInstance<
    TableNode,
    RelationEdge
  > | null>(null);
  const [fitPending, setFitPending] = useState(false);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const graph = useMemo(
    () =>
      snapshot
        ? buildGraph(snapshot, expanded, partitions)
        : { nodes: [], edges: [], unavailableRelations: 0 },
    [snapshot, expanded, partitions],
  );
  const online = status !== "lost" && status !== "unknown";
  const persist = useCallback(() => {
    writeLocalJson(storageKey, {
      positions: positions.current,
      viewport: viewport.current,
    });
  }, [storageKey]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    api
      .diagram()
      .then((data) => {
        if (current) setSnapshot(data);
      })
      .catch((caught) => {
        if (current) setError(errorMessage(caught));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, revision, schemaRevision]);

  useEffect(() => {
    if (!snapshot) return;
    let current = true;
    setLayoutBusy(true);
    const task = arrangeGraph(graph.nodes, graph.edges, positions.current);
    task.promise
      .then((result) => {
        if (!current) return;
        setNodes(result.nodes);
        setPaths(result.paths);
        positions.current = Object.fromEntries(
          result.nodes.map((node) => [node.id, node.position]),
        );
        persist();
        setFitPending(!viewport.current);
      })
      .catch((caught) => {
        if (current)
          setError(`Could not arrange diagram: ${errorMessage(caught)}`);
      })
      .finally(() => {
        task.cancel();
        if (current) setLayoutBusy(false);
      });
    return () => {
      current = false;
      task.cancel();
    };
  }, [snapshot, graph, arrangement, persist]);

  useEffect(() => {
    if (!active || !flow || !fitPending || !nodes.length) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ ...fitOptions, duration: 0 });
      setFitPending(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, flow, fitPending, nodes.length]);

  const center = useCallback(
    (id: string, animate = false) => {
      setSelected(id);
      setSelectedEdge(null);
      setFocus(null);
      setSchema("");
      setSearch("");
      const node = flow?.getNode(id);
      if (node)
        void flow?.setCenter(
          node.position.x + 150,
          node.position.y + (node.height ?? 200) / 2,
          { zoom: 1, duration: animate && !reducedMotion ? 200 : 0 },
        );
    },
    [flow, reducedMotion],
  );
  useEffect(() => {
    if (
      !active ||
      !tab.focus ||
      !nodes.length ||
      layoutBusy ||
      handledFocus.current === tab.focus.request
    )
      return;
    const id = tableId(tab.focus);
    const table = snapshot?.tables.find((item) => tableId(item) === id);
    if (table?.parent && !partitions) {
      setPartitions(true);
      return;
    }
    if (nodes.some((node) => node.id === id)) {
      center(id);
      handledFocus.current = tab.focus.request;
    }
  }, [tab.focus, active, nodes, layoutBusy, center, snapshot, partitions]);

  const nearby = useMemo(
    () => (focus ? neighborhood(focus, graph.edges) : null),
    [focus, graph.edges],
  );
  const highlighted = useMemo(
    () => (selected ? neighborhood(selected, graph.edges) : null),
    [selected, graph.edges],
  );
  const visibleNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === selected,
        hidden:
          (!!schema && node.data.table.schema !== schema) ||
          (!!nearby && !nearby.has(node.id)),
        className:
          highlighted && !highlighted.has(node.id) ? "diagram-node-muted" : "",
      })),
    [nodes, selected, schema, nearby, highlighted],
  );
  const visibleIds = new Set(
    visibleNodes.filter((node) => !node.hidden).map((node) => node.id),
  );
  const edges = graph.edges.map((edge) => ({
    ...edge,
    data: { relation: edge.data!.relation, path: paths[edge.id] },
    hidden: !visibleIds.has(edge.source) || !visibleIds.has(edge.target),
    selected: edge.id === selectedEdge,
    animated:
      active && !reducedMotion && pointerSelection && edge.id === selectedEdge,
    className:
      edge.id === selectedEdge ||
      (selected && (edge.source === selected || edge.target === selected))
        ? "diagram-edge-highlight"
        : "",
  }));
  const selectedTable = nodes.find((node) => node.id === selected);
  const relation = graph.edges.find((edge) => edge.id === selectedEdge)?.data
    ?.relation;
  const schemas = [
    ...new Set(snapshot?.tables.map((table) => table.schema) ?? []),
  ];
  const matches = search.trim()
    ? nodes.filter((node) =>
        `${node.data.table.schema}.${node.data.table.name}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : [];
  const busy = loading || layoutBusy;
  const openSelected = () => {
    if (selectedTable)
      onOpenTable({ ...selectedTable.data.table, estimatedRows: 0 });
  };
  const saveViewport = (_: unknown, next: Viewport) => {
    viewport.current = next;
    persist();
  };

  return (
    <section
      className="diagram-workspace"
      aria-label="Database diagram"
      aria-busy={busy}
      onPointerDownCapture={() => setPointerSelection(true)}
      onKeyDownCapture={() => setPointerSelection(false)}
    >
      <header className="diagram-toolbar">
        {onCreateTable && (
          <button
            className="toolbar-button"
            disabled={session.readOnly || !online}
            onClick={onCreateTable}
          >
            <Plus size={15} />
            New table
          </button>
        )}
        <div className="diagram-heading">
          <Network size={18} />
          <div>
            <strong>Database diagram</strong>
            <span>
              {session.database} <span aria-hidden="true">/</span> PostgreSQL
            </span>
          </div>
        </div>
        <div className="diagram-search-wrap">
          <form
            className="diagram-search"
            onSubmit={(event) => {
              event.preventDefault();
              if (matches[0]) center(matches[0].id);
            }}
          >
            <Search size={15} />
            <input
              aria-label="Find a table in diagram"
              placeholder="Find a table…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setSearch("");
                }
              }}
            />
            {search && (
              <button
                type="button"
                className="icon-button"
                aria-label="Clear table search"
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </form>
          {search.trim() && (
            <div
              className="diagram-search-results"
              aria-label="Matching tables"
            >
              {matches.slice(0, 20).map((node) => (
                <button
                  key={node.id}
                  onClick={(event) => center(node.id, event.detail > 0)}
                >
                  <span>{node.data.table.name}</span>
                  <small>{node.data.table.schema}</small>
                </button>
              ))}
              {!matches.length && <p>No matching tables.</p>}
              {matches.length > 20 && (
                <p>Keep typing to narrow {matches.length} matches.</p>
              )}
            </div>
          )}
        </div>
        <select
          aria-label="Diagram schema"
          value={schema}
          onChange={(event) => {
            setSchema(event.target.value);
            setFocus(null);
            setFitPending(true);
          }}
        >
          <option value="">All schemas</option>
          {schemas.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <button
          className="toolbar-button"
          disabled={busy || !nodes.length}
          onClick={() => {
            positions.current = {};
            viewport.current = undefined;
            setArrangement((value) => value + 1);
          }}
          title="Reset table positions and arrange automatically"
        >
          <LayoutGrid size={15} />
          Arrange
        </button>
        <button
          className="icon-button"
          disabled={busy || !online}
          onClick={() => setRevision((value) => value + 1)}
          title="Refresh database diagram"
          aria-label="Refresh database diagram"
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {error && (
        <div className="diagram-notice" role="alert">
          <span>
            {error}
            {snapshot ? " Previous diagram retained." : ""}
          </span>
          <button
            className="button ghost"
            disabled={busy || !online}
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {!!snapshot?.omittedTables && (
        <div className="diagram-notice" role="status">
          {snapshot.omittedTables} tables are omitted because this role lacks
          access. This diagram is incomplete.
        </div>
      )}
      {!!graph.unavailableRelations && (
        <div className="diagram-notice" role="status">
          {graph.unavailableRelations} relationships reference tables outside
          the available diagram.
        </div>
      )}
      <div className="diagram-body">
        <div className="diagram-canvas">
          <ReactFlow<TableNode, RelationEdge>
            nodes={visibleNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={setFlow}
            defaultViewport={saved.viewport}
            minZoom={0.05}
            maxZoom={1.8}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            ariaLabelConfig={{
              "node.a11yDescription.default":
                "Press Enter or Space to select a table. Use arrow keys to move it. Open selection details for table actions.",
              "node.a11yDescription.keyboardDisabled":
                "Press Enter or Space to select a table. Open selection details for table actions.",
              "edge.a11yDescription.default":
                "Press Enter or Space to inspect this relationship. Schema changes require SQL review.",
            }}
            panOnScroll
            zoomOnDoubleClick={false}
            onlyRenderVisibleElements
            colorMode="dark"
            onNodesChange={(changes) => {
              if (changes.some((change) => change.type === "position"))
                setPaths({});
              for (const change of changes) {
                if (
                  change.type === "position" &&
                  change.position &&
                  !change.dragging
                ) {
                  positions.current[change.id] = change.position;
                  persist();
                }
              }
              setNodes((current) => applyNodeChanges(changes, current));
              const selection = changes.find(
                (change) => change.type === "select" && change.selected,
              );
              if (selection?.type === "select") {
                setSelected(selection.id);
                setSelectedEdge(null);
              }
            }}
            onEdgesChange={(changes) => {
              const selection = changes.find(
                (change) => change.type === "select" && change.selected,
              );
              if (selection?.type === "select") {
                setSelectedEdge(selection.id);
                setDetails(true);
              }
            }}
            onNodeClick={(_, node) => {
              setSelected(node.id);
              setSelectedEdge(null);
            }}
            onNodeDoubleClick={(_, node) =>
              onOpenTable({ ...node.data.table, estimatedRows: 0 })
            }
            onEdgeClick={(_, edge) => {
              setSelectedEdge(edge.id);
              setDetails(true);
            }}
            onPaneClick={() => {
              setSelected(null);
              setSelectedEdge(null);
              setDetails(false);
            }}
            onNodeDragStop={(_, node, moved) => {
              for (const item of moved.length ? moved : [node])
                positions.current[item.id] = item.position;
              persist();
            }}
            onMoveEnd={saveViewport}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="var(--line-strong)"
            />
          </ReactFlow>
          {busy && (
            <div className="diagram-progress" role="status">
              <Loader2 size={15} className="spin" />
              {loading ? "Reading database structure…" : "Arranging tables…"}
            </div>
          )}
          {!busy && snapshot && !nodes.length && (
            <div className="diagram-empty">
              <Network size={30} />
              <h2>No tables to map</h2>
              <p>
                This view shows accessible user tables and declared foreign
                keys. Views and system schemas are not included.
              </p>
            </div>
          )}
          {!!nodes.length && (
            <div className="diagram-floating-tools">
              <button
                className="icon-button"
                aria-label="Zoom out diagram"
                onClick={(event) =>
                  void flow?.zoomOut({
                    duration: event.detail && !reducedMotion ? 160 : 0,
                  })
                }
              >
                <ZoomOut size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Zoom in diagram"
                onClick={(event) =>
                  void flow?.zoomIn({
                    duration: event.detail && !reducedMotion ? 160 : 0,
                  })
                }
              >
                <ZoomIn size={17} />
              </button>
              <button
                className="toolbar-button"
                onClick={(event) =>
                  void flow?.fitView({
                    ...fitOptions,
                    duration: event.detail && !reducedMotion ? 200 : 0,
                  })
                }
              >
                <Focus size={16} />
                Fit
              </button>
              <span />
              {focus ? (
                <button
                  className="toolbar-button"
                  onClick={() => {
                    setFocus(null);
                    setSchema("");
                    setFitPending(true);
                  }}
                >
                  Show all
                </button>
              ) : (
                <button
                  className="toolbar-button"
                  disabled={!selected}
                  onClick={() => {
                    setFocus(selected);
                    setSchema("");
                    setFitPending(true);
                  }}
                >
                  Focus relationships
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Diagram selection details"
                aria-pressed={details}
                disabled={!selected && !selectedEdge}
                onClick={() => setDetails(!details)}
              >
                <Info size={17} />
              </button>
            </div>
          )}
        </div>
        {details && (selectedTable || relation) && (
          <DiagramInspector
            onEdit={
              (selectedTable || relation) &&
              onEditTable &&
              !session.readOnly &&
              online
                ? () =>
                    onEditTable(
                      relation
                        ? {
                            schema: relation.sourceSchema,
                            name: relation.sourceTable,
                          }
                        : selectedTable!.data.table,
                    )
                : undefined
            }
            onDrop={
              selectedTable && onEditTable && !session.readOnly && online
                ? () => onEditTable(selectedTable.data.table, true)
                : undefined
            }
            table={selectedTable}
            relation={relation}
            onClose={() => setDetails(false)}
            onOpen={openSelected}
            onToggleColumns={() => {
              if (!selectedTable) return;
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(selectedTable.id)) next.delete(selectedTable.id);
                else next.add(selectedTable.id);
                return next;
              });
            }}
          />
        )}
      </div>
      <footer className="diagram-status">
        <span>
          {visibleIds.size} / {snapshot?.tables.length ?? 0} tables ·{" "}
          {edges.filter((edge) => !edge.hidden).length} relationships
        </span>
        {snapshot?.tables.some((table) => table.parent) && (
          <label>
            <input
              type="checkbox"
              checked={partitions}
              onChange={(event) => setPartitions(event.target.checked)}
            />
            Show partitions
          </label>
        )}
        <span>
          {!online
            ? "Offline · last loaded structure"
            : snapshot && !snapshot.foreignKeys.length
              ? "No declared foreign keys"
              : "Structure only · no table data"}
        </span>
      </footer>
    </section>
  );
}
