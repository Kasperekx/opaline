// Synthetic catalog for screenshots of the real app. Never contacts PostgreSQL.
import type { ConnectionCatalog } from "../src/features/connections/connection-types";
import type {
  TableDataPage,
  TablePageRequest,
} from "../src/shared/types/database";
import type { DatabaseDiagram } from "../src/shared/types/diagram";
import type {
  RelationStructure,
  StructureColumn,
  StructureForeignKey,
} from "../src/shared/types/structure";
import { diagramFixture } from "./diagram-fixture";

export const showcaseCatalog: ConnectionCatalog = {
  version: 1,
  workspaces: [{ id: "showcase-atlas", name: "Atlas" }],
  profiles: [
    {
      id: "showcase-local",
      workspaceId: "showcase-atlas",
      name: "Atlas · Local",
      host: "localhost",
      port: 5432,
      database: "atlas",
      username: "atlas",
      sslMode: "prefer",
      caPath: null,
      environment: "local",
      readOnly: false,
      credentialId: null,
    },
  ],
};

const types: Record<string, string> = {
  created_at: "timestamp with time zone",
  applied_at: "timestamp with time zone",
  level: "integer",
  experience: "integer",
  quantity: "integer",
  amount: "numeric(10,2)",
};
const defaults: Record<string, string> = {
  id: "gen_random_uuid()",
  created_at: "now()",
  applied_at: "now()",
  level: "1",
  experience: "0",
  quantity: "1",
  status: "'pending'::text",
};
const comments: Record<string, string> = {
  id: "Unique player identifier",
  account_id: "Account that owns this player",
  name: "Player display name",
  class: "Selected character class",
  level: "Current progression level",
  experience: "Total experience earned",
};

export const showcaseDiagram: DatabaseDiagram = {
  ...diagramFixture,
  tables: diagramFixture.tables.map((table) => ({
    ...table,
    columns: table.columns.map((column) => ({
      ...column,
      dataType: types[column.name] ?? column.dataType,
      nullable: column.name === "description",
    })),
  })),
  foreignKeys: diagramFixture.foreignKeys.map((fk) => ({
    ...fk,
    definition: `FOREIGN KEY (${fk.sourceColumns.join(", ")}) REFERENCES ${fk.targetSchema}.${fk.targetTable} (${fk.targetColumns.join(", ")}) ON DELETE ${fk.onDelete}`,
  })),
};

export function showcaseStructure(
  schema: string,
  name: string,
): RelationStructure {
  const table = showcaseDiagram.tables.find(
    (table) => table.schema === schema && table.name === name,
  );
  if (!table) throw new Error(`Unknown showcase table: ${schema}.${name}`);
  const outgoing = showcaseDiagram.foreignKeys.filter(
    (fk) => fk.sourceSchema === schema && fk.sourceTable === name,
  );
  const columns: StructureColumn[] = table.columns.map((column, index) => ({
    ...column,
    position: index + 1,
    defaultValue: defaults[column.name] ?? null,
    comment: name === "players" ? (comments[column.name] ?? null) : null,
    identity: false,
    generated: false,
    enumValues: [],
    identityGeneration: "",
    generationKind: "",
    collation: null,
    identityOptions: null,
  }));
  const constraints: RelationStructure["constraints"] = [
    {
      name: `${name}_pkey`,
      kind: "p",
      columns: ["id"],
      definition: "PRIMARY KEY (id)",
      validated: true,
      deferrable: false,
      initiallyDeferred: false,
    },
    ...outgoing.map((fk) => ({
      name: fk.name,
      kind: "f",
      columns: fk.sourceColumns,
      definition: fk.definition,
      validated: true,
      deferrable: false,
      initiallyDeferred: false,
    })),
  ];
  if (name === "players")
    constraints.push({
      name: "players_level_check",
      kind: "c",
      columns: ["level"],
      definition: "CHECK (level >= 1)",
      validated: true,
      deferrable: false,
      initiallyDeferred: false,
    });
  const indexes: RelationStructure["indexes"] = [
    {
      name: `${name}_pkey`,
      method: "btree",
      columns: ["id"],
      includedColumns: [],
      unique: true,
      primary: true,
      valid: true,
      predicate: null,
      definition: `CREATE UNIQUE INDEX ${name}_pkey ON ${schema}.${name} USING btree (id)`,
      constraintName: `${name}_pkey`,
    },
    ...outgoing.map((fk) => ({
      name: `${name}_${fk.sourceColumns.join("_")}_idx`,
      method: "btree",
      columns: fk.sourceColumns,
      includedColumns: [],
      unique: false,
      primary: false,
      valid: true,
      predicate: null,
      definition: `CREATE INDEX ${name}_${fk.sourceColumns.join("_")}_idx ON ${schema}.${name} USING btree (${fk.sourceColumns.join(", ")})`,
      constraintName: null,
    })),
  ];
  return {
    relationOid: 1000 + showcaseDiagram.tables.indexOf(table),
    schema,
    name,
    objectType: "Table",
    owner: "atlas",
    comment:
      name === "players"
        ? "Player profiles, progression, and their owning accounts."
        : null,
    columns,
    indexes,
    constraints,
    foreignKeys: showcaseDiagram.foreignKeys.flatMap<StructureForeignKey>(
      (fk) => {
        if (fk.sourceSchema === schema && fk.sourceTable === name)
          return [{ ...fk, direction: "outgoing" as const }];
        if (fk.targetSchema === schema && fk.targetTable === name)
          return [{ ...fk, direction: "incoming" as const }];
        return [];
      },
    ),
    ddl: `CREATE TABLE ${schema}.${name} (\n${[
      ...columns.map(
        (column) =>
          `  ${column.name} ${column.dataType}${column.nullable ? "" : " NOT NULL"}${column.defaultValue ? ` DEFAULT ${column.defaultValue}` : ""}`,
      ),
      ...constraints.map(
        (constraint) =>
          `  CONSTRAINT ${constraint.name} ${constraint.definition}`,
      ),
    ].join(",\n")}\n);`,
    ddlNotes: ["Synthetic showcase schema. No live database connection."],
  };
}

const playerRows = [
  [
    "00000000-0000-4000-8000-000000000101",
    "00000000-0000-4000-8000-000000000001",
    "Nova",
    "Ranger",
    "24",
    "18600",
  ],
  [
    "00000000-0000-4000-8000-000000000102",
    "00000000-0000-4000-8000-000000000002",
    "Orion",
    "Guardian",
    "18",
    "12400",
  ],
  [
    "00000000-0000-4000-8000-000000000103",
    "00000000-0000-4000-8000-000000000003",
    "Lyra",
    "Mage",
    "31",
    "28750",
  ],
];

export function showcaseTablePage(input: TablePageRequest): TableDataPage {
  return {
    columns: showcaseStructure(input.schema, input.table).columns,
    rows:
      input.schema === "public" && input.table === "players"
        ? playerRows.map((values, index) => ({
            values,
            rowVersion: String(index + 1),
          }))
        : [],
    page: 0,
    pageSize: input.pageSize,
    hasMore: false,
    editable: false,
    insertable: false,
    editabilityReason: "Screenshot fixture: data is read-only.",
    insertabilityReason: "Screenshot fixture: data is read-only.",
  };
}
