// Synthetic data for screenshots of the real workspace. Never contacts a database.
import type { ConnectionCatalog } from "../src/features/connections/connection-types";
import type {
  DatabaseObject,
  TableDataPage,
  TablePageRequest,
  TableRowSnapshot,
  TableCellValue,
} from "../src/shared/types/database";
import type { DatabaseDiagram } from "../src/shared/types/diagram";
import type {
  RelationStructure,
  StructureColumn,
  StructureForeignKey,
} from "../src/shared/types/structure";

export const workspaceCatalog: ConnectionCatalog = {
  version: 1,
  workspaces: [{ id: "workspace-atlas", name: "Atlas" }],
  profiles: [
    {
      id: "workspace-local",
      workspaceId: "workspace-atlas",
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

type Column = [name: string, dataType: string];
type Row = Record<string, string | null>;
const definitions: Record<string, Column[]> = {
  customers: [
    ["customer_id", "text"],
    ["name", "text"],
    ["email", "text"],
    ["company", "text"],
    ["country", "text"],
    ["created_at", "timestamp with time zone"],
  ],
  orders: [
    ["order_id", "text"],
    ["customer", "text"],
    ["status", "text"],
    ["total", "numeric(10,2)"],
    ["currency", "character(3)"],
    ["placed_at", "timestamp with time zone"],
    ["metadata", "jsonb"],
    ["customer_id", "text"],
  ],
  subscriptions: [
    ["subscription_id", "text"],
    ["customer_id", "text"],
    ["product_id", "text"],
    ["status", "text"],
    ["billing_interval", "text"],
    ["current_period_end", "timestamp with time zone"],
  ],
  products: [
    ["product_id", "text"],
    ["name", "text"],
    ["sku", "text"],
    ["price", "numeric(10,2)"],
    ["currency", "character(3)"],
    ["active", "boolean"],
  ],
  invoices: [
    ["invoice_id", "text"],
    ["order_id", "text"],
    ["customer_id", "text"],
    ["status", "text"],
    ["amount_due", "numeric(10,2)"],
    ["currency", "character(3)"],
    ["issued_at", "timestamp with time zone"],
  ],
  payments: [
    ["payment_id", "text"],
    ["invoice_id", "text"],
    ["method", "text"],
    ["status", "text"],
    ["amount", "numeric(10,2)"],
    ["currency", "character(3)"],
    ["processed_at", "timestamp with time zone"],
  ],
  events: [
    ["event_id", "text"],
    ["customer_id", "text"],
    ["event_type", "text"],
    ["payload", "jsonb"],
    ["created_at", "timestamp with time zone"],
  ],
};

const customers = [
  ["Amelia Chen", "Northstar", "US"],
  ["Oliver Martin", "Forma", "GB"],
  ["Sofia Andersson", "Studio North", "SE"],
  ["Noah Williams", "Linear Labs", "US"],
  ["Isabella Rossi", "Arco", "IT"],
  ["Liam O’Brien", "Good Measure", "IE"],
  ["Mia Schneider", "Neue", "DE"],
  ["Ethan Brooks", "Common Ground", "CA"],
  ["Charlotte Dubois", "Atelier", "FR"],
  ["Lucas Silva", "Sol Studio", "BR"],
  ["Harper Wilson", "Fieldwork", "AU"],
  ["Henry Tanaka", "Paperplane", "JP"],
  ["Evelyn Novak", "Orbit", "CZ"],
  ["Leo Kowalski", "Monogram", "PL"],
];
const totals = [
  "149.00",
  "89.00",
  "249.00",
  "49.00",
  "179.00",
  "299.00",
  "129.00",
  "59.00",
  "199.00",
  "89.00",
  "349.00",
  "149.00",
  "79.00",
  "229.00",
  "99.00",
  "449.00",
  "159.00",
  "69.00",
  "289.00",
  "119.00",
  "199.00",
  "49.00",
  "329.00",
  "89.00",
  "179.00",
  "249.00",
  "129.00",
  "59.00",
];
const statuses = [
  "paid",
  "fulfilled",
  "paid",
  "pending",
  "fulfilled",
  "paid",
  "fulfilled",
  "refunded",
  "paid",
  "fulfilled",
  "paid",
  "pending",
  "fulfilled",
  "paid",
  "fulfilled",
  "paid",
  "paid",
  "failed",
  "fulfilled",
  "paid",
  "fulfilled",
  "pending",
  "paid",
  "fulfilled",
  "paid",
  "refunded",
  "fulfilled",
  "paid",
];
const customerId = (index: number) => `CUS-${String(index + 101)}`;
const orderRows: Row[] = totals.map((total, index) => {
  const customerIndex = index % customers.length;
  const [customer, , country] = customers[customerIndex];
  return {
    order_id: `ORD-${1048 - index}`,
    customer,
    status: statuses[index],
    total,
    currency: "USD",
    placed_at: `2026-09-${23 - Math.floor(index / 7)} ${String(16 - (index % 7)).padStart(2, "0")}:${String((42 + index * 7) % 60).padStart(2, "0")}:00+00`,
    metadata: JSON.stringify({
      source: index % 4 === 0 ? "api" : "web",
      country,
      items: (index % 3) + 1,
      campaign: index % 3 === 0 ? "autumn-launch" : null,
    }),
    customer_id: customerId(customerIndex),
  };
});
const invoiceRows: Row[] = orderRows.map((order, index) => ({
  invoice_id: `INV-${2048 - index}`,
  order_id: order.order_id,
  customer_id: order.customer_id,
  status:
    order.status === "pending"
      ? "open"
      : order.status === "failed"
        ? "void"
        : "paid",
  amount_due: order.total,
  currency: order.currency,
  issued_at: order.placed_at,
}));
const rowsByTable: Record<string, Row[]> = {
  customers: customers.map(([name, company, country], index) => ({
    customer_id: customerId(index),
    name,
    email: `hello@${company.toLowerCase().replace(/ /g, "")}.example`,
    company,
    country,
    created_at: `2026-08-${String(index + 3).padStart(2, "0")} 10:30:00+00`,
  })),
  orders: orderRows,
  subscriptions: customers.slice(0, 10).map((_, index) => ({
    subscription_id: `SUB-${301 + index}`,
    customer_id: customerId(index),
    product_id: `PRD-${(index % 3) + 1}`,
    status: index === 7 ? "trialing" : "active",
    billing_interval: index % 3 === 0 ? "year" : "month",
    current_period_end: `2026-10-${String(index + 3).padStart(2, "0")} 00:00:00+00`,
  })),
  products: [
    {
      product_id: "PRD-1",
      name: "Atlas Starter",
      sku: "ATLAS-STARTER",
      price: "49.00",
      currency: "USD",
      active: "true",
    },
    {
      product_id: "PRD-2",
      name: "Atlas Pro",
      sku: "ATLAS-PRO",
      price: "149.00",
      currency: "USD",
      active: "true",
    },
    {
      product_id: "PRD-3",
      name: "Atlas Team",
      sku: "ATLAS-TEAM",
      price: "299.00",
      currency: "USD",
      active: "true",
    },
    {
      product_id: "PRD-4",
      name: "Atlas Archive",
      sku: "ATLAS-ARCHIVE",
      price: "29.00",
      currency: "USD",
      active: "false",
    },
  ],
  invoices: invoiceRows,
  payments: invoiceRows
    .filter((invoice) => invoice.status === "paid")
    .map((invoice, index) => ({
      payment_id: `PAY-${501 + index}`,
      invoice_id: invoice.invoice_id,
      method: index % 4 === 0 ? "bank_transfer" : "card",
      status: "succeeded",
      amount: invoice.amount_due,
      currency: invoice.currency,
      processed_at: invoice.issued_at,
    })),
  events: orderRows.map((order, index) => ({
    event_id: `EVT-${701 + index}`,
    customer_id: order.customer_id,
    event_type: "order.created",
    payload: JSON.stringify({
      order_id: order.order_id,
      total: order.total,
      currency: order.currency,
    }),
    created_at: order.placed_at,
  })),
};

const foreignKeys: StructureForeignKey[] = [
  ["orders", "customer_id", "customers"],
  ["subscriptions", "customer_id", "customers"],
  ["subscriptions", "product_id", "products"],
  ["invoices", "order_id", "orders"],
  ["invoices", "customer_id", "customers"],
  ["payments", "invoice_id", "invoices"],
  ["events", "customer_id", "customers"],
].map(([sourceTable, column, targetTable]) => ({
  name: `${sourceTable}_${column}_fkey`,
  direction: "outgoing",
  sourceSchema: "public",
  sourceTable,
  sourceColumns: [column],
  targetSchema: "public",
  targetTable,
  targetColumns: [column],
  onUpdate: "NO ACTION",
  onDelete: "RESTRICT",
  definition: `FOREIGN KEY (${column}) REFERENCES public.${targetTable} (${column}) ON DELETE RESTRICT`,
  validated: true,
}));

export const workspaceObjects: DatabaseObject[] = Object.keys(definitions).map(
  (name) => ({
    schema: "public",
    name,
    objectType: "table",
    estimatedRows: rowsByTable[name].length,
  }),
);

export function workspaceStructure(
  schema: string,
  name: string,
): RelationStructure {
  if (
    schema !== "public" ||
    !Object.prototype.hasOwnProperty.call(definitions, name)
  )
    throw new Error(`Unknown workspace fixture table: ${schema}.${name}`);
  const columns: StructureColumn[] = definitions[name].map(
    ([column, dataType], index) => ({
      name: column,
      dataType,
      nullable: false,
      primaryKey: index === 0,
      position: index + 1,
      defaultValue:
        column === "metadata"
          ? "'{}'::jsonb"
          : column === "created_at" || column === "placed_at"
            ? "now()"
            : null,
      comment: null,
      identity: false,
      generated: false,
      enumValues: [],
      identityGeneration: "",
      generationKind: "",
      collation: null,
      identityOptions: null,
    }),
  );
  const primaryKey = columns[0].name;
  const outgoing = foreignKeys.filter((fk) => fk.sourceTable === name);
  const constraints: RelationStructure["constraints"] = [
    {
      name: `${name}_pkey`,
      kind: "p",
      columns: [primaryKey],
      definition: `PRIMARY KEY (${primaryKey})`,
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
  return {
    relationOid: 2000 + Object.keys(definitions).indexOf(name),
    schema,
    name,
    objectType: "Table",
    owner: "atlas",
    comment:
      name === "orders"
        ? "Customer orders, payment status, and checkout metadata."
        : null,
    columns,
    constraints,
    indexes: [
      {
        name: `${name}_pkey`,
        method: "btree",
        columns: [primaryKey],
        includedColumns: [],
        unique: true,
        primary: true,
        valid: true,
        predicate: null,
        definition: `CREATE UNIQUE INDEX ${name}_pkey ON public.${name} USING btree (${primaryKey})`,
        constraintName: `${name}_pkey`,
      },
    ],
    foreignKeys: foreignKeys.flatMap<StructureForeignKey>((fk) =>
      fk.sourceTable === name
        ? [{ ...fk, direction: "outgoing" as const }]
        : fk.targetTable === name
          ? [{ ...fk, direction: "incoming" as const }]
          : [],
    ),
    ddl: `CREATE TABLE public.${name} (\n${[...columns.map((column) => `  ${column.name} ${column.dataType} NOT NULL${column.defaultValue ? ` DEFAULT ${column.defaultValue}` : ""}`), ...constraints.map((constraint) => `  CONSTRAINT ${constraint.name} ${constraint.definition}`)].join(",\n")}\n);`,
    ddlNotes: ["Synthetic workspace fixture. No live database connection."],
  };
}

export const workspaceDiagram: DatabaseDiagram = {
  omittedTables: 0,
  tables: workspaceObjects.map(({ schema, name, objectType }) => ({
    schema,
    name,
    objectType,
    parent: null,
    columns: workspaceStructure(schema, name).columns.map(
      ({ name: column, dataType, nullable, primaryKey }) => ({
        name: column,
        dataType,
        nullable,
        primaryKey,
      }),
    ),
  })),
  foreignKeys,
};

export function workspaceTablePage(input: TablePageRequest): TableDataPage {
  const columns = workspaceStructure(input.schema, input.table).columns;
  const rows = [...rowsByTable[input.table]];
  if (input.sort) {
    const { column, direction } = input.sort;
    const numeric = columns
      .find((item) => item.name === column)
      ?.dataType.startsWith("numeric");
    rows.sort(
      (a, b) =>
        (numeric
          ? Number(a[column]) - Number(b[column])
          : String(a[column]).localeCompare(String(b[column]))) *
        (direction === "asc" ? 1 : -1),
    );
  }
  const offset = input.page * input.pageSize;
  return {
    columns,
    rows: rows.slice(offset, offset + input.pageSize).map((row) => ({
      values: columns.map((column) => row[column.name]),
      rowVersion: row[columns[0].name],
    })),
    page: input.page,
    pageSize: input.pageSize,
    hasMore: rows.length > offset + input.pageSize,
    editable: true,
    insertable: true,
    editabilityReason: null,
    insertabilityReason: null,
  };
}

export function workspaceTableRow(input: {
  schema: string;
  table: string;
  key: TableCellValue[];
}): TableRowSnapshot {
  const page = workspaceTablePage({
    ...input,
    page: 0,
    pageSize: 100,
    sort: null,
    filter: null,
  });
  const columns = page.columns.map((column) => column.name);
  return {
    columns,
    row:
      page.rows.find((row) =>
        input.key.every(
          ({ column, value }) => row.values[columns.indexOf(column)] === value,
        ),
      ) ?? null,
  };
}
