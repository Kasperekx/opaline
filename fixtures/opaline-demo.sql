-- Opaline demo dataset
-- Synthetic data for a fresh PostgreSQL database (14+).
-- Load:
--   createdb opaline_demo
--   psql -d opaline_demo -v ON_ERROR_STOP=1 -f fixtures/opaline-demo.sql
--
-- Approximate volume after load:
--   ~10k customers, ~5k products, ~50k orders, ~150k order lines,
--   ~100k analytics events, ~20k invoices, stock + warehouse rows.
-- Runtime on a local Postgres is typically 30–90s depending on disk.

\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Schemas (includes an empty one for explorer smoke tests)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS empty_lab;

COMMENT ON SCHEMA commerce IS 'Orders, customers, catalog';
COMMENT ON SCHEMA analytics IS 'High-volume event stream';
COMMENT ON SCHEMA billing IS 'Invoices and payments';
COMMENT ON SCHEMA inventory IS 'Warehouses and stock';
COMMENT ON SCHEMA empty_lab IS 'Intentionally empty — useful for namespace UI checks';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE commerce.order_status AS ENUM (
  'draft', 'placed', 'paid', 'fulfilled', 'cancelled', 'refunded'
);
CREATE TYPE commerce.fulfillment_channel AS ENUM ('web', 'mobile', 'pos', 'api');
CREATE TYPE billing.invoice_status AS ENUM ('open', 'paid', 'void', 'past_due');
CREATE TYPE inventory.stock_condition AS ENUM ('sellable', 'reserved', 'damaged', 'quarantine');

-- ---------------------------------------------------------------------------
-- Commerce
-- ---------------------------------------------------------------------------
CREATE TABLE commerce.customers (
  id            bigserial PRIMARY KEY,
  external_id   uuid NOT NULL DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  full_name     text NOT NULL,
  country_code  char(2) NOT NULL DEFAULT 'PL',
  lifetime_value numeric(12,2) NOT NULL DEFAULT 0,
  traits        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_email_unique UNIQUE (email)
);

CREATE TABLE commerce.products (
  id            bigserial PRIMARY KEY,
  sku           text NOT NULL UNIQUE,
  name          text NOT NULL,
  category      text NOT NULL,
  unit_price    numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  active        boolean NOT NULL DEFAULT true,
  attrs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commerce.orders (
  id              bigserial PRIMARY KEY,
  customer_id     bigint NOT NULL REFERENCES commerce.customers(id),
  status          commerce.order_status NOT NULL DEFAULT 'placed',
  channel         commerce.fulfillment_channel NOT NULL DEFAULT 'web',
  currency        char(3) NOT NULL DEFAULT 'PLN',
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,
  tax_total       numeric(12,2) NOT NULL DEFAULT 0,
  grand_total     numeric(12,2) NOT NULL DEFAULT 0,
  placed_at       timestamptz NOT NULL DEFAULT now(),
  notes           text,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE commerce.order_items (
  id            bigserial PRIMARY KEY,
  order_id      bigint NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
  product_id    bigint NOT NULL REFERENCES commerce.products(id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  line_total    numeric(12,2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX orders_customer_idx ON commerce.orders (customer_id);
CREATE INDEX orders_status_placed_idx ON commerce.orders (status, placed_at DESC);
CREATE INDEX order_items_order_idx ON commerce.order_items (order_id);
CREATE INDEX order_items_product_idx ON commerce.order_items (product_id);
CREATE INDEX customers_traits_gin ON commerce.customers USING gin (traits);
CREATE INDEX products_attrs_gin ON commerce.products USING gin (attrs);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
CREATE TABLE inventory.warehouses (
  id          bigserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  city        text NOT NULL,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE inventory.stock_levels (
  warehouse_id  bigint NOT NULL REFERENCES inventory.warehouses(id),
  product_id    bigint NOT NULL REFERENCES commerce.products(id),
  condition     inventory.stock_condition NOT NULL DEFAULT 'sellable',
  quantity      integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id, condition)
);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
CREATE TABLE billing.invoices (
  id            bigserial PRIMARY KEY,
  order_id      bigint NOT NULL REFERENCES commerce.orders(id),
  status        billing.invoice_status NOT NULL DEFAULT 'open',
  issued_at     timestamptz NOT NULL DEFAULT now(),
  due_at        timestamptz NOT NULL,
  amount_due    numeric(12,2) NOT NULL CHECK (amount_due >= 0),
  amount_paid   numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency      char(3) NOT NULL DEFAULT 'PLN',
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX invoices_order_idx ON billing.invoices (order_id);
CREATE INDEX invoices_status_idx ON billing.invoices (status, due_at);

-- ---------------------------------------------------------------------------
-- Analytics (high volume)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.events (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL,
  customer_id   bigint REFERENCES commerce.customers(id),
  event_name    text NOT NULL,
  properties    jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_key   text NOT NULL
);

CREATE INDEX events_occurred_idx ON analytics.events (occurred_at DESC);
CREATE INDEX events_name_idx ON analytics.events (event_name);
CREATE INDEX events_customer_idx ON analytics.events (customer_id);
CREATE INDEX events_properties_gin ON analytics.events USING gin (properties);

CREATE TABLE analytics.daily_rollups (
  day           date NOT NULL,
  event_name    text NOT NULL,
  event_count   bigint NOT NULL,
  unique_customers bigint NOT NULL,
  PRIMARY KEY (day, event_name)
);

-- ---------------------------------------------------------------------------
-- Seed: warehouses (fixed)
-- ---------------------------------------------------------------------------
INSERT INTO inventory.warehouses (code, name, city)
VALUES
  ('WAW-01', 'Warsaw Central', 'Warsaw'),
  ('KRK-01', 'Krakow Hub', 'Krakow'),
  ('GDN-01', 'Gdansk Port', 'Gdansk'),
  ('WRO-01', 'Wroclaw Crossdock', 'Wroclaw'),
  ('POZ-01', 'Poznan West', 'Poznan'),
  ('LDZ-01', 'Lodz Softgoods', 'Lodz'),
  ('SZZ-01', 'Szczecin North', 'Szczecin'),
  ('KTW-01', 'Katowice South', 'Katowice');

-- ---------------------------------------------------------------------------
-- Seed: customers (~10_000)
-- ---------------------------------------------------------------------------
INSERT INTO commerce.customers (email, full_name, country_code, lifetime_value, traits, created_at, updated_at)
SELECT
  format('customer%s@opaline.test', lpad(g::text, 6, '0')),
  format('Customer %s', g),
  (ARRAY['PL','DE','CZ','SK','LT','GB','US','FR','ES','IT'])[1 + (g % 10)],
  round(((g % 900) + random() * 100)::numeric, 2),
  jsonb_build_object(
    'segment', (ARRAY['starter','growth','enterprise','churn_risk'])[1 + (g % 4)],
    'score', (g % 100),
    'tags', jsonb_build_array(
      (ARRAY['newsletter','vip','beta','wholesale'])[1 + (g % 4)],
      (ARRAY['pl','eu','row'])[1 + (g % 3)]
    )
  ),
  timestamptz '2024-01-01 00:00:00+00' + ((g % 600) || ' days')::interval + ((g % 86400) || ' seconds')::interval,
  timestamptz '2024-01-01 00:00:00+00' + ((g % 600) || ' days')::interval + ((g % 86400) || ' seconds')::interval
FROM generate_series(1, 10000) AS g;

-- ---------------------------------------------------------------------------
-- Seed: products (~5_000)
-- ---------------------------------------------------------------------------
INSERT INTO commerce.products (sku, name, category, unit_price, active, attrs, created_at)
SELECT
  format('SKU-%s', lpad(g::text, 5, '0')),
  format('%s %s',
    (ARRAY['Cedar','Graphite','Amber','Opal','Moss','Slate','River','Forge'])[1 + (g % 8)],
    (ARRAY['Desk','Lamp','Chair','Cable','Notebook','Stand','Case','Kit'])[1 + (g % 8)]
  ),
  (ARRAY['furniture','lighting','accessories','apparel','software','services'])[1 + (g % 6)],
  round((10 + (g % 490) + random() * 9)::numeric, 2),
  (g % 17) <> 0,
  jsonb_build_object(
    'color', (ARRAY['graphite','amber','teal','sand','ink'])[1 + (g % 5)],
    'weight_g', 100 + (g % 2400),
    'warranty_months', (ARRAY[12,24,36])[1 + (g % 3)]
  ),
  timestamptz '2023-06-01 00:00:00+00' + ((g % 400) || ' days')::interval
FROM generate_series(1, 5000) AS g;

-- ---------------------------------------------------------------------------
-- Seed: orders (~50_000)
-- ---------------------------------------------------------------------------
INSERT INTO commerce.orders (
  customer_id, status, channel, currency, subtotal, tax_total, grand_total, placed_at, notes, meta
)
SELECT
  1 + ((g * 37) % 10000),
  (ARRAY[
    'draft'::commerce.order_status,
    'placed'::commerce.order_status,
    'paid'::commerce.order_status,
    'fulfilled'::commerce.order_status,
    'cancelled'::commerce.order_status,
    'refunded'::commerce.order_status
  ])[1 + (g % 6)],
  (ARRAY[
    'web'::commerce.fulfillment_channel,
    'mobile'::commerce.fulfillment_channel,
    'pos'::commerce.fulfillment_channel,
    'api'::commerce.fulfillment_channel
  ])[1 + (g % 4)],
  (ARRAY['PLN','EUR','USD'])[1 + (g % 3)],
  round((20 + (g % 800) + random() * 40)::numeric, 2),
  round(((20 + (g % 800)) * 0.23)::numeric, 2),
  round(((20 + (g % 800)) * 1.23 + random() * 10)::numeric, 2),
  timestamptz '2024-03-01 00:00:00+00' + ((g % 500) || ' days')::interval + ((g % 86400) || ' seconds')::interval,
  CASE WHEN g % 23 = 0 THEN format('Note for order %s', g) ELSE NULL END,
  jsonb_build_object(
    'campaign', (ARRAY['spring','summer','black_friday','quiet'])[1 + (g % 4)],
    'device', (ARRAY['mac','windows','ios','android'])[1 + (g % 4)]
  )
FROM generate_series(1, 50000) AS g;

-- ---------------------------------------------------------------------------
-- Seed: order items (~150_000) — 3 lines per order
-- ---------------------------------------------------------------------------
INSERT INTO commerce.order_items (order_id, product_id, quantity, unit_price, line_total)
SELECT
  o.id,
  1 + (((o.id * 17) + line.n) % 5000),
  1 + ((o.id + line.n) % 5),
  p.unit_price,
  round((1 + ((o.id + line.n) % 5)) * p.unit_price, 2)
FROM commerce.orders o
CROSS JOIN generate_series(1, 3) AS line(n)
JOIN commerce.products p
  ON p.id = 1 + (((o.id * 17) + line.n) % 5000);

-- ---------------------------------------------------------------------------
-- Seed: stock levels (~40k sellable + ~8k reserved)
-- ---------------------------------------------------------------------------
INSERT INTO inventory.stock_levels (warehouse_id, product_id, condition, quantity, updated_at)
SELECT
  w.id,
  p.id,
  'sellable'::inventory.stock_condition,
  (p.id * 3 + w.id * 7) % 400,
  now() - (((p.id + w.id) % 90) || ' days')::interval
FROM inventory.warehouses w
CROSS JOIN commerce.products p;

INSERT INTO inventory.stock_levels (warehouse_id, product_id, condition, quantity, updated_at)
SELECT
  w.id,
  p.id,
  'reserved'::inventory.stock_condition,
  (p.id + w.id) % 40,
  now() - (((p.id) % 20) || ' days')::interval
FROM inventory.warehouses w
CROSS JOIN commerce.products p
WHERE p.id % 5 = 0;

-- ---------------------------------------------------------------------------
-- Seed: invoices (~20_000) — every other paid/fulfilled-ish order
-- ---------------------------------------------------------------------------
INSERT INTO billing.invoices (order_id, status, issued_at, due_at, amount_due, amount_paid, currency, payload)
SELECT
  o.id,
  (ARRAY[
    'open'::billing.invoice_status,
    'paid'::billing.invoice_status,
    'void'::billing.invoice_status,
    'past_due'::billing.invoice_status
  ])[1 + (o.id % 4)],
  o.placed_at + interval '1 hour',
  o.placed_at + interval '14 days',
  o.grand_total,
  CASE WHEN o.id % 4 = 1 THEN o.grand_total ELSE round((o.grand_total * (o.id % 5) / 10.0)::numeric, 2) END,
  o.currency,
  jsonb_build_object('invoice_no', format('INV-%s', lpad(o.id::text, 8, '0')), 'terms', 'net14')
FROM commerce.orders o
WHERE o.id % 2 = 0 AND o.id <= 40000;

-- ---------------------------------------------------------------------------
-- Seed: analytics events (~100_000)
-- ---------------------------------------------------------------------------
INSERT INTO analytics.events (occurred_at, customer_id, event_name, properties, session_key)
SELECT
  timestamptz '2024-06-01 00:00:00+00' + ((g % 120) || ' days')::interval + ((g % 86400) || ' seconds')::interval,
  1 + ((g * 11) % 10000),
  (ARRAY[
    'page_view','add_to_cart','checkout_start','purchase','search','filter_apply','signup','login'
  ])[1 + (g % 8)],
  jsonb_build_object(
    'path', format('/app/%s', (ARRAY['home','catalog','cart','account','docs'])[1 + (g % 5)]),
    'ms', (g % 1800),
    'ok', (g % 17) <> 0
  ),
  format('sess-%s-%s', (g % 8000), (g % 50))
FROM generate_series(1, 100000) AS g;

INSERT INTO analytics.daily_rollups (day, event_name, event_count, unique_customers)
SELECT
  occurred_at::date,
  event_name,
  count(*),
  count(DISTINCT customer_id)
FROM analytics.events
GROUP BY 1, 2;

-- ---------------------------------------------------------------------------
-- Helpful views
-- ---------------------------------------------------------------------------
CREATE VIEW commerce.order_overview AS
SELECT
  o.id,
  o.status,
  o.channel,
  o.grand_total,
  o.placed_at,
  c.email AS customer_email,
  c.country_code,
  (SELECT count(*) FROM commerce.order_items oi WHERE oi.order_id = o.id) AS item_count
FROM commerce.orders o
JOIN commerce.customers c ON c.id = o.customer_id;

CREATE VIEW inventory.low_stock AS
SELECT
  w.code AS warehouse,
  p.sku,
  p.name AS product,
  s.quantity,
  s.updated_at
FROM inventory.stock_levels s
JOIN inventory.warehouses w ON w.id = s.warehouse_id
JOIN commerce.products p ON p.id = s.product_id
WHERE s.condition = 'sellable' AND s.quantity < 15;

ANALYZE commerce.customers;
ANALYZE commerce.products;
ANALYZE commerce.orders;
ANALYZE commerce.order_items;
ANALYZE inventory.stock_levels;
ANALYZE billing.invoices;
ANALYZE analytics.events;
ANALYZE analytics.daily_rollups;

COMMIT;

-- Summary (runs after commit)
SELECT 'customers' AS entity, count(*)::text AS rows FROM commerce.customers
UNION ALL SELECT 'products', count(*)::text FROM commerce.products
UNION ALL SELECT 'orders', count(*)::text FROM commerce.orders
UNION ALL SELECT 'order_items', count(*)::text FROM commerce.order_items
UNION ALL SELECT 'stock_levels', count(*)::text FROM inventory.stock_levels
UNION ALL SELECT 'invoices', count(*)::text FROM billing.invoices
UNION ALL SELECT 'events', count(*)::text FROM analytics.events
UNION ALL SELECT 'daily_rollups', count(*)::text FROM analytics.daily_rollups
UNION ALL SELECT 'schemas', count(*)::text FROM pg_namespace
  WHERE nspname IN ('commerce','analytics','billing','inventory','empty_lab')
ORDER BY 1;
