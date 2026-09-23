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
  relationOid?: number;
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

export type ColumnDraft = {
  original: string | null;
  name: string;
  dataType: string;
  enumType?: { schema: string; name: string } | null;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
  defaultMode?: "keep" | "literal" | "drop" | "currentTimestamp" | "randomUuid";
  identity: boolean;
  removed: boolean;
};
export type SchemaChange = {
  schema: string;
  table: string;
  original: string | null;
  expected: RelationStructure | null;
  columns: ColumnDraft[];
  dropTable: boolean;
  constraints?: ConstraintChange[];
  enumChanges?: EnumDraft[];
};
export type EnumType = {
  schema: string;
  name: string;
  oid: number;
  values: string[];
};
export type EnumDraft = {
  schema: string;
  name: string;
  original: EnumType | null;
  values: string[];
};
export type ConstraintChange =
  | { kind: "createIndex"; name: string; columns: string[]; unique: boolean }
  | { kind: "dropIndex" | "dropForeignKey"; name: string }
  | {
      kind: "addForeignKey";
      name: string;
      columns: string[];
      targetSchema: string;
      targetTable: string;
      targetColumns: string[];
      onDelete: string;
      onUpdate: string;
    };
export type SchemaPlan = { sql: string; destructive: boolean };
