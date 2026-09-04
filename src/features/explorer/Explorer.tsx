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
import { useEffect, useMemo, useRef } from "react";
import type {
  ColumnInfo,
  ConnectionInfo,
  DatabaseObject,
} from "../../shared/types/database";

type ExplorerProps = {
  connection: ConnectionInfo;
  objects: DatabaseObject[];
  selected: DatabaseObject | null;
  columns: ColumnInfo[];
  filter: string;
  loading: boolean;
  error: string | null;
  onFilter: (value: string) => void;
  onRefresh: () => void;
  onSelect: (object: DatabaseObject) => void;
};

export function Explorer({
  connection,
  objects,
  selected,
  columns,
  filter,
  loading,
  error,
  onFilter,
  onRefresh,
  onSelect,
}: ExplorerProps) {
  const searchRef = useRef<HTMLInputElement>(null);

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

  return (
    <aside className="explorer" aria-label="Database explorer">
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
              <div className="tree-schema">
                <ChevronDown size={14} />
                <Folder size={15} /> <span>{schema}</span>
              </div>
              <div className="tree-branch">
                {schemaObjects.map((object) => {
                  const isSelected =
                    selected?.schema === object.schema && selected?.name === object.name;
                  const isView = object.objectType.includes("view");
                  return (
                    <div key={`${object.schema}.${object.name}`}>
                      <button
                        className={`tree-item ${isSelected ? "selected" : ""}`}
                        onClick={() => onSelect(object)}
                        aria-expanded={isSelected}
                      >
                        <ChevronRight
                          size={13}
                          className={isSelected ? "open" : ""}
                        />
                        {isView ? <Eye size={14} /> : <Table2 size={14} />}
                        <span>{object.name}</span>
                      </button>
                      {isSelected && columns.length > 0 && (
                        <div className="column-list">
                          {columns.map((column) => (
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
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
