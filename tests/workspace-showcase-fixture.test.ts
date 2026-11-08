import { describe, expect, it } from "vitest";
import {
  workspaceCatalog,
  workspaceDiagram,
  workspaceObjects,
  workspaceStructure,
  workspaceTablePage,
  workspaceTableRow,
} from "./workspace-showcase-fixture";

const pageFor = (table: string) =>
  workspaceTablePage({
    schema: "public",
    table,
    page: 0,
    pageSize: 50,
    filter: null,
    sort: null,
  });

describe("workspace showcase screenshot fixture", () => {
  it("provides only a synthetic Atlas profile and the seven public tables", () => {
    expect(workspaceCatalog.workspaces).toEqual([
      { id: "workspace-atlas", name: "Atlas" },
    ]);
    expect(workspaceCatalog.profiles[0]).toMatchObject({
      workspaceId: "workspace-atlas",
      name: "Atlas · Local",
      host: "localhost",
      database: "atlas",
      credentialId: null,
    });
    expect(workspaceObjects.map((table) => table.name)).toEqual([
      "customers",
      "orders",
      "subscriptions",
      "products",
      "invoices",
      "payments",
      "events",
    ]);
    expect(() => workspaceStructure("private", "orders")).toThrow(
      "Unknown workspace fixture table",
    );
  });

  it("keeps every row, primary key, structure, and diagram in agreement", () => {
    for (const table of workspaceDiagram.tables) {
      const page = pageFor(table.name);
      const structure = workspaceStructure(table.schema, table.name);
      expect(page.rows).toHaveLength(
        workspaceObjects.find((object) => object.name === table.name)!
          .estimatedRows,
      );
      expect(
        structure.columns.map(({ name, dataType, nullable, primaryKey }) => ({
          name,
          dataType,
          nullable,
          primaryKey,
        })),
      ).toEqual(table.columns);
      expect(new Set(page.rows.map((row) => row.values[0])).size).toBe(
        page.rows.length,
      );
      expect(structure.constraints[0].columns).toEqual([page.columns[0].name]);
      for (const row of page.rows) {
        expect(row.values).toHaveLength(page.columns.length);
        expect(row.values.every((value) => typeof value === "string")).toBe(
          true,
        );
        page.columns.forEach((column, index) => {
          if (column.dataType === "jsonb")
            expect(() => JSON.parse(row.values[index]!)).not.toThrow();
        });
      }
      expect(page.editable).toBe(true);
      expect(page.insertable).toBe(true);
    }
  });

  it("resolves every foreign key to an existing synthetic row", () => {
    for (const fk of workspaceDiagram.foreignKeys) {
      const source = pageFor(fk.sourceTable);
      const target = pageFor(fk.targetTable);
      const sourceIndex = source.columns.findIndex(
        (column) => column.name === fk.sourceColumns[0],
      );
      const targetIndex = target.columns.findIndex(
        (column) => column.name === fk.targetColumns[0],
      );
      const targetValues = new Set(
        target.rows.map((row) => row.values[targetIndex]),
      );
      expect(sourceIndex).toBeGreaterThanOrEqual(0);
      expect(targetIndex).toBeGreaterThanOrEqual(0);
      expect(
        source.rows.every((row) => targetValues.has(row.values[sourceIndex])),
      ).toBe(true);
      expect(
        workspaceStructure("public", fk.sourceTable).foreignKeys,
      ).toContainEqual(fk);
      expect(
        workspaceStructure("public", fk.targetTable).foreignKeys,
      ).toContainEqual({ ...fk, direction: "incoming" });
    }
  });

  it("provides 28 varied orders, numeric sorting, pagination, and exact row lookup", () => {
    const page = pageFor("orders");
    expect(page.rows).toHaveLength(28);
    expect(page.columns.map((column) => column.name)).toEqual([
      "order_id",
      "customer",
      "status",
      "total",
      "currency",
      "placed_at",
      "metadata",
      "customer_id",
    ]);
    expect(new Set(page.rows.map((row) => row.values[2])).size).toBe(5);
    const sorted = workspaceTablePage({
      schema: "public",
      table: "orders",
      page: 1,
      pageSize: 10,
      filter: null,
      sort: { column: "total", direction: "asc" },
    });
    const totals = page.rows
      .map((row) => Number(row.values[3]))
      .sort((a, b) => a - b);
    expect(sorted.rows.map((row) => Number(row.values[3]))).toEqual(
      totals.slice(10, 20),
    );
    expect(sorted.hasMore).toBe(true);
    expect(
      workspaceTableRow({
        schema: "public",
        table: "orders",
        key: [{ column: "order_id", value: "ORD-1048" }],
      }).row,
    ).toEqual(page.rows[0]);
  });
});
