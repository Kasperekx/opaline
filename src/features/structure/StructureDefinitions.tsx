import { Braces, Check, KeyRound, ListTree } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "../../shared/components/CopyButton";
import type {
  StructureConstraint,
  StructureIndex,
} from "../../shared/types/structure";

export function StructureEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="structure-empty">
      <ListTree size={24} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function DefinitionDetails({ definition }: { definition: string }) {
  return (
    <details className="structure-definition">
      <summary>SQL definition</summary>
      <div>
        <pre>{definition}</pre>
        <CopyButton value={definition} label="Copy definition" />
      </div>
    </details>
  );
}

function DefinitionItem({
  name,
  badge,
  children,
  definition,
}: {
  name: string;
  badge: ReactNode;
  children: ReactNode;
  definition: string;
}) {
  return (
    <article className="structure-definition-item">
      <header>
        <strong>{name}</strong>
        <div className="structure-badges">{badge}</div>
      </header>
      {children}
      <DefinitionDetails definition={definition} />
    </article>
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
    <div className="structure-definition-list">
      {indexes.map((index) => (
        <DefinitionItem
          key={index.name}
          name={index.name}
          definition={index.definition}
          badge={
            <>
              {index.primary ? (
                <span className="structure-badge accent">
                  <KeyRound size={12} /> Primary
                </span>
              ) : (
                index.unique && (
                  <span className="structure-badge accent">Unique</span>
                )
              )}
              <span className="structure-badge">{index.method}</span>
              <span
                className={`structure-badge ${index.valid ? "" : "warning"}`}
              >
                {index.valid ? (
                  <>
                    <Check size={12} /> Valid
                  </>
                ) : (
                  "Invalid"
                )}
              </span>
            </>
          }
        >
          <dl className="structure-properties">
            <div>
              <dt>Keys</dt>
              <dd>
                <code>{index.columns.join(", ")}</code>
              </dd>
            </div>
            {index.includedColumns.length > 0 && (
              <div>
                <dt>Included</dt>
                <dd>
                  <code>{index.includedColumns.join(", ")}</code>
                </dd>
              </div>
            )}
            {index.predicate && (
              <div>
                <dt>Where</dt>
                <dd>
                  <code>{index.predicate}</code>
                </dd>
              </div>
            )}
            {index.constraintName && (
              <div>
                <dt>Constraint</dt>
                <dd>{index.constraintName}</dd>
              </div>
            )}
          </dl>
        </DefinitionItem>
      ))}
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
      />
    );
  return (
    <div className="structure-definition-list">
      {constraints.map((constraint) => (
        <DefinitionItem
          key={constraint.name}
          name={constraint.name}
          definition={constraint.definition}
          badge={
            <>
              <span className="structure-badge accent">
                <Braces size={12} />{" "}
                {constraintNames[constraint.kind] ?? constraint.kind}
              </span>
              <span
                className={`structure-badge ${constraint.validated ? "" : "warning"}`}
              >
                {constraint.validated ? "Validated" : "Not validated"}
              </span>
            </>
          }
        >
          <dl className="structure-properties">
            {constraint.columns.length > 0 && (
              <div>
                <dt>Columns</dt>
                <dd>
                  <code>{constraint.columns.join(", ")}</code>
                </dd>
              </div>
            )}
            <div>
              <dt>Timing</dt>
              <dd>
                {constraint.deferrable
                  ? `Deferrable · initially ${constraint.initiallyDeferred ? "deferred" : "immediate"}`
                  : "Immediate · not deferrable"}
              </dd>
            </div>
          </dl>
        </DefinitionItem>
      ))}
    </div>
  );
}
