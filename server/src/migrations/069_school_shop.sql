-- ============================================================
-- Bizness-OS: School Management — Phase 11 (School Shop)
--
-- A small on-campus shop (stationery, uniforms, snacks) that genuinely
-- buys and sells real items for real money, so — unlike Attendance or
-- Library, which deliberately stay outside the ledger — this DOES post
-- proper double-entry journal entries, the same discipline already
-- used for Fees Management and Service Business.
--
--   - shop_items: the catalog, tracking a real stock_quantity, a
--     selling_price, and a cost_price (needed for a genuine COGS entry
--     at the moment of sale, not just revenue).
--   - shop_purchases / shop_purchase_items: restocking — buying more of
--     an item increases stock_quantity and posts Dr Shop Inventory /
--     Cr Cash.
--   - shop_sales / shop_sale_items: selling — decreases stock_quantity
--     (blocked outright if insufficient stock) and posts TWO entries at
--     once, the real accounting for a merchandise sale: Dr Cash / Cr
--     Shop Sales Revenue for the price charged, AND Dr Cost of Goods
--     Sold / Cr Shop Inventory for what the item actually cost — not
--     just the revenue side, which would overstate profit.
--   - A sale can optionally link to a student (a real customer,
--     tracked by name) but doesn't require one — walk-in staff
--     purchases are just as real.
-- ============================================================

CREATE TABLE shop_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(200) NOT NULL,
  sku               VARCHAR(50),
  category          VARCHAR(100),
  selling_price     NUMERIC(10,2) NOT NULL CHECK (selling_price >= 0),
  cost_price        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  stock_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reorder_level     INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shop_items_company ON shop_items(company_id);

CREATE TABLE shop_purchases (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_no       VARCHAR(30) NOT NULL,
  supplier_name     VARCHAR(200),
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  purchase_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, purchase_no)
);

CREATE INDEX idx_shop_purchases_company ON shop_purchases(company_id);

CREATE TABLE shop_purchase_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id   UUID NOT NULL REFERENCES shop_purchases(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES shop_items(id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost     NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0),
  line_total    NUMERIC(12,2) NOT NULL
);

CREATE INDEX idx_shop_purchase_items_purchase ON shop_purchase_items(purchase_id);

CREATE TABLE shop_sales (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_no           VARCHAR(30) NOT NULL,
  student_id        UUID REFERENCES students(id) ON DELETE SET NULL,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method    VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'mobile_money', 'card')),
  sale_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  sold_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, sale_no)
);

CREATE INDEX idx_shop_sales_company ON shop_sales(company_id);

CREATE TABLE shop_sale_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id       UUID NOT NULL REFERENCES shop_sales(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES shop_items(id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost     NUMERIC(10,2) NOT NULL DEFAULT 0,  -- copied at sale time, so a later cost_price change never rewrites history
  line_total    NUMERIC(12,2) NOT NULL
);

CREATE INDEX idx_shop_sale_items_sale ON shop_sale_items(sale_id);

-- ---------- New GL accounts ----------

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('1240', 'Shop Inventory', 'asset', 'current_asset', 'debit'),
  ('4220', 'Shop Sales Revenue', 'revenue', 'operating_revenue', 'credit'),
  ('6080', 'Cost of Goods Sold — Shop', 'expense', 'cogs', 'debit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.mapping_key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES ('1240', 'shop_inventory'), ('4220', 'shop_sales_revenue'), ('6080', 'shop_cogs')) AS m(code, mapping_key)
  ON coa.account_code = m.code
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
