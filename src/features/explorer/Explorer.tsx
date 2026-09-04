import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Database,
  Eye,
  Folder,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { databaseObjectKey } from "../../shared/lib/database-object";
import type {
  ColumnInfo,
  ConnectionInfo,
  DatabaseObject,
} from "../../shared/types/database";

type ExplorerProps = {
  connection: ConnectionInfo;
  objects: DatabaseObject[];
  selected: DatabaseObject | null;
  expandedObjectKey: string | null;
  columns: ColumnInfo[];
  filter: string;
  loading: boolean;
  columnsLoading: boolean;
  error: string | null;
  columnsError: string | null;
  onFilter: (value: string) => void;
  onRefresh: () => void;
  onSelect: (object: DatabaseObject) => void;
  onToggle: (object: DatabaseObject) => void;
};

export function Explorer({
  connection,
  objects,
  selected,
  expandedObjectKey,
  columns,
  filter,
  loading,
  columnsLoading,
  error,
  columnsError,
  onFilter,
  onRefresh,
  onSelect,
  onToggle,
}: ExplorerProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [collapsedSchemas, setCollapsedSchemas] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const schemas = useMemo(() => {
    const groups = new Map<string, DatabaseObject[]>();
    const normalizedFilter = filter.trim().toLowerCase();

    for (const object of objects) {
      const qualifiedName = `${object.schema}.${object.name}`.toLowerCase();
      if (normalizedFilter && !qualifiedName.includes(normalizedFilter)) continue;
      const group = groups.get(object.schema);
      if (group) group.push(object);
      else groups.set(object.schema, [object]);
    }

    return [...groups.entries()];
  }, [objects, filter]);

  const toggleSchema = (schema: string) => {
    setCollapsedSchemas((current) => {
      const next = new Set(current);
      if (next.has(schema)) next.delete(schema);
      else next.add(schema);
      return next;
    });
  };

  return (
    <aside id="database-explorer" className="explorer" aria-label="Database explorer">
      <div className="explorer-connection">
        <div className="tiny-db">
          <Database size={15} />
        </div>
        <div>
          <strong>{connection.name || connection.database}</strong>
          <span>{connection.database}</span>
        </div>
        <ChevronDown size={15} />
      </div>
      <div className="search-box">
        <Search size={14} />
        <input
          ref={searchRef}
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          placeholder="Filter objects"
          aria-label="Filter database objects"
        />
        <kbd>⌘K</kbd>
      </div>
      <div className="explorer-label">
        <span>Database objects</span>
        <button onClick={onRefresh} aria-label="Refresh database objects" disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} size={13} />
        </button>
      </div>
      <div className="tree-scroll">
        {error ? (
          <div className="tree-empty tree-error">
            <span>{error}</span>
            <button onClick={onRefresh}>Try again</button>
          </div>
        ) : loading && objects.length === 0 ? (
          <div className="tree-empty loading-state">
            <Loader2 className="spin" size={16} /> Loading database objects…
          </div>
        ) : schemas.length === 0 ? (
          <div className="tree-empty">No tables or views found.</div>
        ) : (
          schemas.map(([schema, schemaObjects]) => (
            <div className="tree-group" key={schema}>
              <button
                className="tree-schema"
                onClick={() => toggleSchema(schema)}
                aria-expanded={!collapsedSchemas.has(schema)}
              >
                <ChevronRight
                  className={collapsedSchemas.has(schema) ? "" : "open"}
                  size={14}
                />
                <Folder size={15} /> <span>{schema}</span>
              </button>
              {!collapsedSchemas.has(schema) && (
                <div className="tree-branch">
                  {schemaObjects.map((object) => {
                    const objectKey = databaseObjectKey(object);
                    const isSelected =
                      selected?.schema === object.schema &&
                      selected?.name === object.name;
                    const isExpanded = expandedObjectKey === objectKey;
                    const isView = object.objectType.includes("view");
                    return (
                      <div className="tree-node" key={objectKey}>
                        <div
                          className={`tree-node-row ${isSelected ? "selected" : ""}`}
                        >
                          <button
                            className="tree-toggle"
                            onClick={() => onToggle(object)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${object.name}`}
                          >
                            <ChevronRight
                              size={13}
                              className={isExpanded ? "open" : ""}
                            />
                          </button>
                          <button
                            className="tree-item"
                            onClick={() => onSelect(object)}
                            aria-current={isSelected ? "true" : undefined}
                          >
                            {isView ? <Eye size={14} /> : <Table2 size={14} />}
                            <span>{object.name}</span>
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="column-list">
                            {columnsLoading ? (
                              <div className="column-state">
                                <Loader2 className="spin" size={12} /> Loading columns…
                              </div>
                            ) : columnsError ? (
                              <div className="column-state error">{columnsError}</div>
                            ) : columns.length === 0 ? (
                              <div className="column-state">No visible columns.</div>
                            ) : (
                              columns.map((column) => (
                                <div
                                  className="column-item"
                                  key={column.name}
                                  title={`${column.dataType}${column.nullable ? " · nullable" : ""}`}
                                >
                                  {column.primaryKey ? (
                                    <KeyRound size={12} />
                                  ) : (
                                    <Columns3 size={12} />
                                  )}
                                  <span>{column.name}</span>
                                  <small>{column.dataType}</small>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="explorer-footer">
        <span className="online-dot" />
        <span>
          {connection.host}:{connection.port}
        </span>
      </div>
    </aside>
  );
}
