-- ============================================================
-- Bizness-OS: Module 05 — Inventory & Warehouse Management
-- ============================================================

-- ---------- Catalog / master data ----------

CREATE TABLE units_of_measure (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,      -- e.g. "Kilogram"
  symbol            VARCHAR(20) NOT NULL,        -- e.g. "kg"
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE brands (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,
  description       TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE product_categories (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  name              VARCHAR(150) NOT NULL,
  description       TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE warehouses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES branches(id) ON DELETE SET NULL,
  name              VARCHAR(150) NOT NULL,
  code              VARCHAR(50),
  location          TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ---------- Product Master ----------

CREATE TABLE products (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku               VARCHAR(100) NOT NULL,
  barcode           VARCHAR(100),
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  category_id       UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  uom_id            UUID REFERENCES units_of_measure(id) ON DELETE SET NULL,
  cost_price        NUMERIC(18,4) DEFAULT 0,      -- last known unit cost (informational; true cost is weighted-avg in stock_levels)
  selling_price     NUMERIC(18,4) DEFAULT 0,
  is_batch_tracked  BOOLEAN DEFAULT FALSE,
  is_expiry_tracked BOOLEAN DEFAULT FALSE,
  reorder_level     NUMERIC(18,4) DEFAULT 0,      -- company-wide default; can be overridden per warehouse
  reorder_quantity  NUMERIC(18,4) DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, sku)
);

CREATE TABLE product_warehouse_settings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  reorder_level     NUMERIC(18,4),                -- overrides product default when set
  reorder_quantity  NUMERIC(18,4),
  UNIQUE(product_id, warehouse_id)
);

-- ---------- Batch / Lot tracking ----------

CREATE TABLE stock_batches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  batch_no          VARCHAR(100) NOT NULL,
  expiry_date       DATE,
  received_date     DATE DEFAULT CURRENT_DATE,
  unit_cost         NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_remaining NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id, batch_no)
);

-- ---------- Current stock (materialized balance, kept in sync by the app layer) ----------

CREATE TABLE stock_levels (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity          NUMERIC(18,4) NOT NULL DEFAULT 0,
  average_cost      NUMERIC(18,4) NOT NULL DEFAULT 0,  -- moving weighted-average unit cost
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id)
);

-- ---------- Stock ledger (append-only source of truth for every quantity change) ----------

CREATE TABLE stock_movements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  batch_id          UUID REFERENCES stock_batches(id) ON DELETE SET NULL,
  movement_type     VARCHAR(30) NOT NULL,   -- stock_in, stock_out, transfer_out, transfer_in, adjustment_increase, adjustment_decrease, damaged, count_adjustment
  quantity          NUMERIC(18,4) NOT NULL, -- always positive; direction is implied by movement_type
  unit_cost         NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_cost        NUMERIC(18,4) NOT NULL DEFAULT 0,
  reference_type    VARCHAR(50),            -- 'manual', 'transfer', 'adjustment', 'count', 'damage'
  reference_id      UUID,                   -- points to stock_transfers.id / inventory_counts.id / etc
  reason            TEXT,
  notes             TEXT,
  performed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Stock Transfers ----------

CREATE TABLE stock_transfers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transfer_no       VARCHAR(50) NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  to_warehouse_id   UUID NOT NULL REFERENCES warehouses(id),
  status            VARCHAR(20) DEFAULT 'completed', -- pending, in_transit, completed, cancelled
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, transfer_no)
);

CREATE TABLE stock_transfer_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id       UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  batch_id          UUID REFERENCES stock_batches(id),
  quantity          NUMERIC(18,4) NOT NULL,
  unit_cost         NUMERIC(18,4) NOT NULL DEFAULT 0
);

-- ---------- Inventory Count (physical stock take) ----------

CREATE TABLE inventory_counts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  count_no          VARCHAR(50) NOT NULL,
  status            VARCHAR(20) DEFAULT 'draft', -- draft, completed
  count_date        DATE DEFAULT CURRENT_DATE,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  UNIQUE(company_id, count_no)
);

CREATE TABLE inventory_count_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  count_id          UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  batch_id          UUID REFERENCES stock_batches(id),
  system_quantity   NUMERIC(18,4) NOT NULL DEFAULT 0,
  counted_quantity  NUMERIC(18,4),
  variance          NUMERIC(18,4),
  notes             TEXT
);

-- ---------- Damaged Goods (specialized log on top of stock_movements) ----------

CREATE TABLE damaged_goods (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  batch_id          UUID REFERENCES stock_batches(id),
  quantity          NUMERIC(18,4) NOT NULL,
  reason            TEXT NOT NULL,
  movement_id       UUID REFERENCES stock_movements(id),
  reported_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Indexes ----------
CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_warehouses_company ON warehouses(company_id);
CREATE INDEX idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX idx_stock_levels_warehouse ON stock_levels(warehouse_id);
CREATE INDEX idx_stock_movements_company ON stock_movements(company_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at);
CREATE INDEX idx_stock_batches_product_wh ON stock_batches(product_id, warehouse_id);
CREATE INDEX idx_stock_batches_expiry ON stock_batches(expiry_date);

-- ---------- Seed: default units of measure per existing company (idempotent-ish) ----------
INSERT INTO units_of_measure (company_id, name, symbol)
SELECT c.id, u.name, u.symbol
FROM companies c
CROSS JOIN (VALUES
  ('Piece', 'pc'), ('Kilogram', 'kg'), ('Gram', 'g'), ('Litre', 'L'),
  ('Millilitre', 'ml'), ('Box', 'box'), ('Carton', 'ctn'), ('Dozen', 'dz')
) AS u(name, symbol)
ON CONFLICT DO NOTHING;

-- ---------- Seed: additional permissions for Module 05 ----------
INSERT INTO permissions (module, action, code, description) VALUES
  ('inventory', 'manage_products', 'inventory.products.manage', 'Create/edit product master, categories, brands, UoM'),
  ('inventory', 'manage_warehouses', 'inventory.warehouses.manage', 'Create/edit warehouses'),
  ('inventory', 'stock_in', 'inventory.stock_in.create', 'Receive stock into a warehouse'),
  ('inventory', 'stock_out', 'inventory.stock_out.create', 'Issue stock out of a warehouse'),
  ('inventory', 'transfer', 'inventory.transfers.manage', 'Transfer stock between warehouses'),
  ('inventory', 'adjust', 'inventory.adjustments.manage', 'Adjust stock quantities'),
  ('inventory', 'damage', 'inventory.damage.manage', 'Log damaged/written-off goods'),
  ('inventory', 'count', 'inventory.counts.manage', 'Perform physical inventory counts'),
  ('inventory', 'view_reports', 'inventory.reports.view', 'View inventory reports and valuation')
ON CONFLICT DO NOTHING;

-- Grant all new inventory permissions to every existing Super Admin role automatically.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'inventory'
ON CONFLICT DO NOTHING;
