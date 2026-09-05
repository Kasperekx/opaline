import type { ColumnInfo } from "./database";

export type StructureColumn = ColumnInfo & {
  position: number;
  comment: string | null;
  identityGeneration: string;
  generationKind: string;
  collation: string | null;
  identityOptions: string | null;
};

export type StructureIndex = {
  name: string;
  method: string;
  columns: string[];
  includedColumns: string[];
  unique: boolean;
  primary: boolean;
  valid: boolean;
  predicate: string | null;
  definition: string;
  constraintName: string | null;
};

export type StructureConstraint = {
  name: string;
  kind: string;
  columns: string[];
  definition: string;
  validated: boolean;
  deferrable: boolean;
  initiallyDeferred: boolean;
};

export type StructureForeignKey = {
  name: string;
  direction: "incoming" | "outgoing";
  sourceSchema: string;
  sourceTable: string;
  sourceColumns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
  onUpdate: string;
  onDelete: string;
  definition: string;
  validated: boolean;
};

export type RelationStructure = {
  schema: string;
  name: string;
  objectType: string;
  owner: string;
  comment: string | null;
  columns: StructureColumn[];
  indexes: StructureIndex[];
  constraints: StructureConstraint[];
  foreignKeys: StructureForeignKey[];
  ddl: string | null;
  ddlNotes: string[];
};
