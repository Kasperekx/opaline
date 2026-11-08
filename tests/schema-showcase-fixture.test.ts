import { describe, expect, it } from "vitest";
import { diagramFixture } from "./diagram-fixture";
import {
  showcaseCatalog,
  showcaseDiagram,
  showcaseStructure,
  showcaseTablePage,
} from "./schema-showcase-fixture";

describe("schema showcase screenshot fixture", () => {
  it("uses a separate synthetic catalog and does not modify the shared diagram fixture", () => {
    expect(showcaseCatalog.workspaces).toEqual([
      { id: "showcase-atlas", name: "Atlas" },
    ]);
    expect(showcaseCatalog.profiles[0]).toMatchObject({
      database: "atlas",
      credentialId: null,
    });
    expect(showcaseDiagram.tables).toHaveLength(6);
    expect(showcaseDiagram.foreignKeys).toHaveLength(5);
    expect(
      diagramFixture.tables
        .find((table) => table.name === "players")
        ?.columns.find((column) => column.name === "level")?.dataType,
    ).toBe("text");
    expect(
      showcaseStructure("public", "players").columns.find(
        (column) => column.name === "level",
      )?.dataType,
    ).toBe("integer");
  });

  it("keeps diagram nodes, structure columns, and FK endpoints consistent", () => {
    for (const table of showcaseDiagram.tables) {
      const structure = showcaseStructure(table.schema, table.name);
      expect(
        structure.columns.map(({ name, dataType, nullable, primaryKey }) => ({
          name,
          dataType,
          nullable,
          primaryKey,
        })),
      ).toEqual(table.columns);
      expect(structure.indexes[0]).toMatchObject({
        primary: true,
        columns: ["id"],
      });
      expect(structure.constraints[0]).toMatchObject({
        kind: "p",
        columns: ["id"],
      });
    }
    for (const fk of showcaseDiagram.foreignKeys) {
      const source = showcaseStructure(fk.sourceSchema, fk.sourceTable);
      const target = showcaseStructure(fk.targetSchema, fk.targetTable);
      expect(source.foreignKeys).toContainEqual({
        ...fk,
        direction: "outgoing",
      });
      expect(target.foreignKeys).toContainEqual({
        ...fk,
        direction: "incoming",
      });
      expect(
        source.constraints.some(
          (constraint) =>
            constraint.name === fk.name && constraint.kind === "f",
        ),
      ).toBe(true);
      expect(
        fk.sourceColumns.every((name) =>
          source.columns.some((column) => column.name === name),
        ),
      ).toBe(true);
      expect(
        fk.targetColumns.every((name) =>
          target.columns.some((column) => column.name === name),
        ),
      ).toBe(true);
    }
  });

  it("provides read-only player rows in the actual schema column order", () => {
    const page = showcaseTablePage({
      schema: "public",
      table: "players",
      page: 0,
      pageSize: 50,
      filter: null,
      sort: null,
    });
    expect(page.rows).toHaveLength(3);
    expect(page.columns.map((column) => column.name)).toEqual([
      "id",
      "account_id",
      "name",
      "class",
      "level",
      "experience",
    ]);
    expect(
      page.rows.every((row) => row.values.length === page.columns.length),
    ).toBe(true);
    expect(page.editable).toBe(false);
    expect(page.insertable).toBe(false);
    expect(() => showcaseStructure("public", "not_a_fixture_table")).toThrow(
      "Unknown showcase table",
    );
  });
});
