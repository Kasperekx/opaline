import type {
  DatabaseDiagram,
  DiagramTable,
} from "../src/shared/types/diagram";
import type { StructureForeignKey } from "../src/shared/types/structure";

const table = (
  schema: string,
  name: string,
  columns: string[],
): DiagramTable => ({
  schema,
  name,
  objectType: "table",
  parent: null,
  columns: columns.map((name, index) => ({
    name,
    dataType: name === "id" || name.endsWith("_id") ? "uuid" : "text",
    nullable: index > 1,
    primaryKey: index === 0,
  })),
});
const fk = (
  name: string,
  source: string,
  target: string,
  column: string,
  sourceSchema = "public",
  targetSchema = "public",
): StructureForeignKey => ({
  name,
  direction: "outgoing",
  sourceSchema,
  sourceTable: source,
  sourceColumns: [column],
  targetSchema,
  targetTable: target,
  targetColumns: ["id"],
  onDelete: "CASCADE",
  onUpdate: "NO ACTION",
  definition: "",
  validated: true,
});
export const diagramFixture: DatabaseDiagram = {
  omittedTables: 0,
  tables: [
    table("public", "accounts", ["id", "email", "display_name", "created_at"]),
    table("public", "players", [
      "id",
      "account_id",
      "name",
      "class",
      "level",
      "experience",
    ]),
    table("public", "inventory_slots", [
      "id",
      "player_id",
      "item_id",
      "quantity",
    ]),
    table("public", "items", ["id", "name", "rarity", "description"]),
    table("billing", "purchases", [
      "id",
      "account_id",
      "item_id",
      "amount",
      "currency",
      "status",
    ]),
    table("public", "schema_migrations", ["id", "version", "applied_at"]),
  ],
  foreignKeys: [
    fk("players_account_id_fkey", "players", "accounts", "account_id"),
    fk("inventory_player_fkey", "inventory_slots", "players", "player_id"),
    fk("inventory_item_fkey", "inventory_slots", "items", "item_id"),
    fk(
      "purchase_account_fkey",
      "purchases",
      "accounts",
      "account_id",
      "billing",
    ),
    fk("purchase_item_fkey", "purchases", "items", "item_id", "billing"),
  ],
};
