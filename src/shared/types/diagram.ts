import type { StructureForeignKey } from "./structure";

export type DiagramTable = {
  schema: string;
  name: string;
  objectType: string;
  parent: { schema: string; name: string } | null;
  columns: {
    name: string;
    dataType: string;
    nullable: boolean;
    primaryKey: boolean;
  }[];
};
export type DatabaseDiagram = {
  tables: DiagramTable[];
  foreignKeys: StructureForeignKey[];
  omittedTables: number;
};
