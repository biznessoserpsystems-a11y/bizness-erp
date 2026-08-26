-- ============================================================
-- Bizness-OS: Manufacturing Accounting Module (IAS 2 — Inventories)
--
-- IAS 2.10 requires the cost of inventories manufactured (not purchased for
-- resale) to comprise: costs of purchase (direct materials), costs of
-- conversion (direct labour + a systematic allocation of fixed and variable
-- production overheads), and other costs incurred in bringing the
-- inventory to its present location and condition.
--
-- IAS 2.13 is the critical, easy-to-get-wrong rule this schema is built
-- around: the allocation of FIXED production overhead to conversion costs
-- is based on the NORMAL capacity of the production facilities, not actual
-- output for the period — and any unallocated overhead (from operating
-- below normal capacity) must be recognised as an expense in the period
-- incurred, never capitalised into ending inventory. That's why
-- manufacturing_overhead_rates stores a `normal_capacity` figure the
-- predetermined rate is calculated from, and why work order overhead is
-- always "applied" at that predetermined rate rather than actual overhead
-- incurred divided by actual units — the difference (over/under-applied
-- overhead) is a real, trackable variance closed out separately, not
-- silently absorbed into inventory value.
--
-- Deliberately additive and low-risk, not a rework of the existing
-- Inventory/Procurement/Sales flows: only ONE new balance-sheet account is
-- introduced (Work in Progress) — raw materials are still received through
-- the existing GRN/Purchase Invoice flow into the existing `inventory_asset`
-- account exactly as before (nothing there changes), and a completed work
-- order's finished goods flow back into that SAME existing account rather
-- than a separate "Finished Goods" control account. That means a
-- manufactured product is immediately, fully sellable through the existing
-- Sales Order -> Delivery -> COGS pipeline with zero code changes there —
-- the only genuinely new GL territory is the WIP build-up itself (the part
-- that didn't exist in this system at all before this migration) and the
-- clearing accounts overhead/labour absorption need.
-- ============================================================

ALTER TABLE products ADD COLUMN product_type VARCHAR(20) NOT NULL DEFAULT 'trading'
  CHECK (product_type IN ('trading', 'raw_material', 'finished_good'));
-- 'trading' (default): bought and sold as-is — every existing product stays
-- exactly as it behaves today. 'raw_material': consumed by a Bill of
-- Materials. 'finished_good': produced by a Work Order.

-- ---------- New chart-of-accounts entries, seeded for every existing company ----------
-- (mirrors the backfill idiom already used by 012_asset_management.sql and
-- 030_ifrs_alignment.sql: only inserts where the code doesn't already exist)

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('1220', 'Work in Progress', 'asset', 'current_asset', 'debit'),
  ('2350', 'Manufacturing Overhead Applied', 'liability', 'current_liability', 'credit'),
  ('6055', 'Direct Labour — Production', 'expense', 'cogs', 'debit'),
  ('6060', 'Manufacturing Overhead — Actual', 'expense', 'cogs', 'debit'),
  ('6070', 'Manufacturing Overhead Variance', 'expense', 'cogs', 'debit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.mapping_key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES ('1220', 'work_in_progress'), ('2350', 'manufacturing_overhead_applied'),
             ('6055', 'direct_labour_production'), ('6060', 'manufacturing_overhead_actual'),
             ('6070', 'manufacturing_overhead_variance')) AS m(code, mapping_key)
  ON coa.account_code = m.code
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- ---------- Bill of Materials ----------

CREATE TABLE bill_of_materials (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),   -- the finished_good this BOM produces
  name              VARCHAR(150) NOT NULL,
  version           VARCHAR(20) NOT NULL DEFAULT '1.0',
  yield_quantity    NUMERIC(18,4) NOT NULL DEFAULT 1,         -- units of finished good produced per "batch" of this BOM
  labour_hours_per_batch  NUMERIC(18,4) NOT NULL DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, product_id, version)
);

CREATE TABLE bom_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id            UUID NOT NULL REFERENCES bill_of_materials(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id),  -- the raw_material consumed
  quantity_per_batch NUMERIC(18,4) NOT NULL
);

CREATE INDEX idx_bom_lines_bom ON bom_lines(bom_id);
CREATE INDEX idx_bom_product ON bill_of_materials(product_id);

-- ---------- Manufacturing overhead rate (IAS 2.13 — predetermined, based on normal capacity) ----------

CREATE TABLE manufacturing_overhead_rates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,
  allocation_base   VARCHAR(20) NOT NULL DEFAULT 'labour_hours' CHECK (allocation_base IN ('labour_hours', 'units_produced')),
  budgeted_overhead_cost NUMERIC(18,4) NOT NULL,   -- total fixed + variable production overhead budgeted for the period
  normal_capacity   NUMERIC(18,4) NOT NULL,        -- budgeted labour hours (or units) at NORMAL capacity — IAS 2.13, not actual
  rate_per_unit     NUMERIC(18,6) GENERATED ALWAYS AS (
                      CASE WHEN normal_capacity > 0 THEN budgeted_overhead_cost / normal_capacity ELSE 0 END
                    ) STORED,
  effective_from    DATE NOT NULL,
  effective_to      DATE,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Work Orders ----------

CREATE TABLE work_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_no     VARCHAR(50) NOT NULL,
  bom_id            UUID NOT NULL REFERENCES bill_of_materials(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),  -- where materials are drawn from and finished goods are received into
  quantity_to_produce NUMERIC(18,4) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft',     -- draft, materials_issued, in_progress, completed, cancelled
  start_date        DATE,
  completion_date   DATE,
  overhead_rate_id  UUID REFERENCES manufacturing_overhead_rates(id),
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, work_order_no)
);

-- Materials issued from the existing shared Inventory account into this
-- work order's WIP (crediting whatever GL account `inventory_asset` is
-- mapped to — the same one every purchase/sale already uses).
-- unit_cost is captured at issue time (from the existing FIFO/weighted-
-- average costing already used for stock_levels) — the same actual-cost
-- discipline IAS 2 requires, not a standard/assumed cost.
CREATE TABLE work_order_material_issues (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id     UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity_issued   NUMERIC(18,4) NOT NULL,
  unit_cost         NUMERIC(18,4) NOT NULL,
  total_cost        NUMERIC(18,4) GENERATED ALWAYS AS (quantity_issued * unit_cost) STORED,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  issued_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Direct labour logged against a work order (a cost of conversion, IAS
-- 2.10) — kept separate from the general payroll module since it's costing
-- hours to a specific production run, not paying an employee.
CREATE TABLE work_order_labour_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id     UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  employee_id       UUID REFERENCES employees(id) ON DELETE SET NULL,
  hours             NUMERIC(18,4) NOT NULL,
  rate_per_hour     NUMERIC(18,4) NOT NULL,
  total_cost        NUMERIC(18,4) GENERATED ALWAYS AS (hours * rate_per_hour) STORED,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  logged_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Overhead APPLIED at the predetermined rate x actual activity (IAS 2.13) —
-- never actual overhead incurred divided by actual output, which would
-- let idle-capacity cost leak into inventory value.
CREATE TABLE work_order_overhead_applications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id     UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  overhead_rate_id  UUID NOT NULL REFERENCES manufacturing_overhead_rates(id),
  activity_quantity NUMERIC(18,4) NOT NULL,     -- hours or units, matching the rate's allocation_base
  applied_cost      NUMERIC(18,4) NOT NULL,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  applied_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wo_material_issues_wo ON work_order_material_issues(work_order_id);
CREATE INDEX idx_wo_labour_wo ON work_order_labour_entries(work_order_id);
CREATE INDEX idx_wo_overhead_wo ON work_order_overhead_applications(work_order_id);
CREATE INDEX idx_work_orders_company ON work_orders(company_id);

-- ---------- Overhead variance closing log (period-end, IAS 2.13) ----------
-- A record of each time over/under-applied overhead was closed out — the
-- actual closing entry itself is a normal journal_entries row (reference_
-- type = 'overhead_variance_closing'); this table is just the audit trail
-- of which period was closed and by how much, so the same period can't be
-- closed twice by accident.
CREATE TABLE overhead_variance_closings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_date         DATE NOT NULL,
  to_date           DATE NOT NULL,
  actual_overhead   NUMERIC(18,4) NOT NULL,
  applied_overhead  NUMERIC(18,4) NOT NULL,
  variance          NUMERIC(18,4) GENERATED ALWAYS AS (actual_overhead - applied_overhead) STORED,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  closed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, from_date, to_date)
);

-- ---------- Permissions ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('manufacturing', 'manage_bom', 'manufacturing.bom.manage', 'Create and edit Bills of Materials'),
  ('manufacturing', 'manage_work_orders', 'manufacturing.work_orders.manage', 'Create, run, and complete Work Orders'),
  ('manufacturing', 'manage_overhead_rates', 'manufacturing.overhead_rates.manage', 'Configure manufacturing overhead allocation rates'),
  ('manufacturing', 'view_reports', 'manufacturing.reports.view', 'View the Cost of Goods Manufactured statement and overhead variance')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code IN (
  'manufacturing.bom.manage', 'manufacturing.work_orders.manage',
  'manufacturing.overhead_rates.manage', 'manufacturing.reports.view'
)
ON CONFLICT DO NOTHING;
