import {
  AlertTriangle,
  Braces,
  Check,
  ChevronDown,
  ListTree,
  type LucideIcon,
} from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { CopyButton } from "../../shared/components/CopyButton";
import { useSqlHighlight } from "./sql-highlight";
import type {
  StructureConstraint,
  StructureIndex,
} from "../../shared/types/structure";

export function StructureEmpty({
  title,
  description,
  Icon = ListTree,
}: {
  title: string;
  description: string;
  Icon?: LucideIcon;
}) {
  return (
    <div className="structure-empty">
      <Icon size={24} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function DefinitionContent({ definition }: { definition: string }) {
  const code = useRef<HTMLElement>(null);
  useSqlHighlight(code, definition);
  return (
    <div className="structure-definition-content">
      <pre>
        <code ref={code}>{definition}</code>
      </pre>
      <CopyButton value={definition} label="Copy definition" />
    </div>
  );
}

export function StructureDefinitionRow({
  name,
  children,
  definition,
  columnCount,
}: {
  name: string;
  children: ReactNode;
  definition: string;
  columnCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const definitionId = useId();
  return (
    <tbody className={expanded ? "is-expanded" : undefined}>
      <tr>
        {children}
        <td className="structure-definition-action">
          <button
            type="button"
            className="toolbar-button structure-definition-toggle"
            aria-label={`${expanded ? "Hide" : "Show"} SQL definition for ${name}`}
            aria-expanded={expanded}
            aria-controls={definitionId}
            onClick={() => setExpanded((current) => !current)}
          >
            <span>SQL</span>
            <ChevronDown size={10} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="structure-definition-row">
          <td colSpan={columnCount}>
            <div
              id={definitionId}
              role="region"
              aria-label={`SQL definition for ${name}`}
            >
              <DefinitionContent definition={definition} />
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}

export function StructureIndexes({ indexes }: { indexes: StructureIndex[] }) {
  if (!indexes.length)
    return (
      <StructureEmpty
        title="No indexes"
        description="This relation has no indexes defined."
      />
    );
  return (
    <div className="structure-metadata-scroll">
      <table className="structure-metadata-table indexes" aria-label="Indexes">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Keys</th>
            <th scope="col">Method</th>
            <th scope="col">Status</th>
            <th scope="col">Definition</th>
          </tr>
        </thead>
        {indexes.map((index) => (
          <StructureDefinitionRow
            key={index.name}
            name={index.name}
            definition={index.definition}
            columnCount={5}
          >
            <th scope="row">
              <div className="structure-object-name">
                <code>{index.name}</code>
                {index.primary ? (
                  <span className="structure-badge accent">Primary</span>
                ) : (
                  index.unique && (
                    <span className="structure-badge">Unique</span>
                  )
                )}
              </div>
              {index.constraintName && (
                <div className="structure-metadata-secondary">
                  <span>Constraint</span> <code>{index.constraintName}</code>
                </div>
              )}
            </th>
            <td>
              <code>{index.columns.join(", ")}</code>
              {index.includedColumns.length > 0 && (
                <div className="structure-metadata-secondary">
                  <span>Include</span>{" "}
                  <code>{index.includedColumns.join(", ")}</code>
                </div>
              )}
              {index.predicate && (
                <div className="structure-metadata-secondary">
                  <span>Where</span> <code>{index.predicate}</code>
                </div>
              )}
            </td>
            <td>
              <code>{index.method}</code>
            </td>
            <td>
              <span
                className={`structure-metadata-status${index.valid ? "" : " warning"}`}
              >
                {index.valid ? (
                  <Check size={12} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={12} aria-hidden="true" />
                )}
                {index.valid ? "Valid" : "Invalid"}
              </span>
            </td>
          </StructureDefinitionRow>
        ))}
      </table>
    </div>
  );
}

const constraintNames: Record<string, string> = {
  p: "Primary key",
  u: "Unique",
  f: "Foreign key",
  c: "Check",
  x: "Exclusion",
  n: "Not null",
  t: "Constraint trigger",
};

export function StructureConstraints({
  constraints,
}: {
  constraints: StructureConstraint[];
}) {
  if (!constraints.length)
    return (
      <StructureEmpty
        title="No table constraints"
        description="Column nullability is shown in Columns. No additional constraints are defined."
        Icon={Braces}
      />
    );
  return (
    <div className="structure-metadata-scroll">
      <table
        className="structure-metadata-table constraints"
        aria-label="Constraints"
      >
        <thead>
          <tr>
            <th scope="col">Name / type</th>
            <th scope="col">Columns</th>
            <th scope="col">Timing</th>
            <th scope="col">Validation</th>
            <th scope="col">Definition</th>
          </tr>
        </thead>
        {constraints.map((constraint) => (
          <StructureDefinitionRow
            key={constraint.name}
            name={constraint.name}
            definition={constraint.definition}
            columnCount={5}
          >
            <th scope="row">
              <div className="structure-object-name">
                <code>{constraint.name}</code>
              </div>
              <span className="structure-object-kind">
                {constraintNames[constraint.kind] ?? constraint.kind}
              </span>
            </th>
            <td>
              {constraint.columns.length > 0 ? (
                <code>{constraint.columns.join(", ")}</code>
              ) : (
                <span className="structure-metadata-secondary">
                  Table-level
                </span>
              )}
            </td>
            <td>
              <span>{constraint.deferrable ? "Deferrable" : "Immediate"}</span>
              <span className="structure-metadata-secondary">
                {constraint.deferrable
                  ? `Initially ${constraint.initiallyDeferred ? "deferred" : "immediate"}`
                  : "Not deferrable"}
              </span>
            </td>
            <td>
              <span
                className={`structure-metadata-status${constraint.validated ? "" : " warning"}`}
              >
                {constraint.validated ? (
                  <Check size={12} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={12} aria-hidden="true" />
                )}
                {constraint.validated ? "Validated" : "Not validated"}
              </span>
            </td>
          </StructureDefinitionRow>
        ))}
      </table>
    </div>
  );
}
