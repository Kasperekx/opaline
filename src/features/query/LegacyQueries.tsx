import { useState } from "react";
import { readLocalJson } from "../../shared/lib/local-storage";

type EarlierQuery = { title: string; sql: string };

function loadEarlierQueries(): EarlierQuery[] {
  const session = readLocalJson<{ tabs?: unknown }>(
    "opaline.query-session.v1",
    {},
  );
  const history = readLocalJson<unknown>("opaline.query-history.v1", []);
  return [
    ...(Array.isArray(session?.tabs) ? session.tabs : []),
    ...(Array.isArray(history) ? history : []),
  ]
    .filter(
      (item): item is EarlierQuery =>
        item && typeof item.title === "string" && typeof item.sql === "string",
    )
    .slice(0, 100);
}

export function LegacyQueries({
  onOpen,
}: {
  onOpen: (sql: string, title: string) => void;
}) {
  const [queries] = useState(loadEarlierQueries);
  if (!queries.length) return null;
  return (
    <details className="legacy-queries">
      <summary>Queries from the earlier app version ({queries.length})</summary>
      <p>
        These queries were not linked to a saved profile. Check their database
        before running them. Opening a copy does not execute SQL.
      </p>
      {queries.map((query, index) => (
        <button
          className="history-entry"
          key={index}
          onClick={() => onOpen(query.sql, query.title)}
        >
          <span className="history-entry-copy">
            <strong>{query.title}</strong>
            <small>{query.sql.slice(0, 100)}</small>
          </span>
        </button>
      ))}
    </details>
  );
}
