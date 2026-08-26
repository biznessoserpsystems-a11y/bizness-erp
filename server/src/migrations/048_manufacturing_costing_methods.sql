-- ============================================================
-- Bizness-OS: Manufacturing Costing Methods
--
-- Two of the five requested methods already exist, just not labelled as
-- such:
--   - Job Costing IS the existing Work Order system — each Work Order
--     accumulates its own materials/labour/overhead as a distinct job.
--     No new schema; the controller adds an explicit "Job Cost Report"
--     view over the same data.
--   - Actual Costing IS the Manufacturing Account statement (041, 047) —
--     materials at real FIFO/weighted-average cost, real labour hours,
--     real factory overhead incurred. Same story: a labelled view over
--     data that already exists, not new tables.
--
-- The other three are genuinely new computational models this migration
-- adds real schema for:
--
--   - Standard Costing: a BOM gets a standard_cost_card (what materials,
--     labour, and overhead SHOULD cost per unit, set in advance) — a
--     completed Work Order's actual cost is compared against it to
--     compute Material/Labour/Overhead variances, the classic standard-
--     costing control mechanism.
--
--   - Process Costing: for continuous, homogeneous production (as
--     opposed to discrete jobs) where cost is best tracked per PERIOD
--     across many identical units rather than per Work Order — a
--     process_cost_batches row for a period records units completed,
--     units still in process with an estimated % completion, and total
--     costs, from which equivalent units and cost-per-equivalent-unit are
--     computed. Deliberately doesn't try to auto-detect "how far along"
--     in-process units are — that percentage is a real production
--     judgement call this system has no sensor data to infer, so it's
--     entered directly rather than guessed at.
--
--   - Activity-Based Costing: overhead allocated by multiple cost
--     drivers (machine setups, inspections, material moves, etc.) each
--     with their own pool and rate, rather than one single predetermined
--     rate — a genuine alternative to the existing single-rate overhead
--     application (work_order_overhead_applications), not a replacement
--     of it; a Work Order can use either or both.
-- ============================================================

ALTER TABLE bill_of_materials ADD COLUMN costing_method VARCHAR(20) NOT NULL DEFAULT 'actual'
  CHECK (costing_method IN ('standard', 'actual', 'job', 'process', 'abc'));
-- Which costing method this product line is managed under. Defaults to
-- 'actual' since that's what every existing BOM has effectively been
-- using — this column doesn't change any existing Work Order behaviour,
-- it's informational/selectable, steering which of the reports below
-- makes sense for this product.

-- ---------- Standard Costing ----------

CREATE TABLE standard_cost_cards (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bom_id                  UUID NOT NULL REFERENCES bill_of_materials(id) ON DELETE CASCADE,
  standard_material_cost  NUMERIC(18,4) NOT NULL,   -- per unit of finished good
  standard_labour_cost    NUMERIC(18,4) NOT NULL,   -- per unit
  standard_overhead_cost  NUMERIC(18,4) NOT NULL,   -- per unit
  standard_unit_cost      NUMERIC(18,4) GENERATED ALWAYS AS (standard_material_cost + standard_labour_cost + standard_overhead_cost) STORED,
  effective_from          DATE NOT NULL,
  is_active               BOOLEAN DEFAULT TRUE,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_standard_cost_cards_bom ON standard_cost_cards(bom_id);

-- ---------- Process Costing ----------

CREATE TABLE process_cost_batches (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bom_id                UUID NOT NULL REFERENCES bill_of_materials(id),
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  units_completed       NUMERIC(18,4) NOT NULL DEFAULT 0,
  units_in_process      NUMERIC(18,4) NOT NULL DEFAULT 0,
  percent_complete_in_process NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percent_complete_in_process BETWEEN 0 AND 100),
  material_cost         NUMERIC(18,4) NOT NULL DEFAULT 0,
  labour_cost           NUMERIC(18,4) NOT NULL DEFAULT 0,
  overhead_cost         NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_process_cost_batches_bom ON process_cost_batches(bom_id);

-- ---------- Activity-Based Costing ----------

CREATE TABLE abc_activity_pools (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,             -- e.g. "Machine Setups", "Quality Inspections"
  cost_driver_unit  VARCHAR(50) NOT NULL,               -- the unit the driver is measured in, e.g. "setup", "inspection", "machine hour"
  pool_cost         NUMERIC(18,4) NOT NULL,             -- total budgeted cost of this activity for the period
  total_driver_volume NUMERIC(18,4) NOT NULL,           -- total budgeted driver units for the period (e.g. 50 setups)
  rate_per_driver   NUMERIC(18,6) GENERATED ALWAYS AS (
                      CASE WHEN total_driver_volume > 0 THEN pool_cost / total_driver_volume ELSE 0 END
                    ) STORED,
  effective_from    DATE NOT NULL,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE work_order_abc_allocations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id       UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  activity_pool_id    UUID NOT NULL REFERENCES abc_activity_pools(id),
  driver_quantity     NUMERIC(18,4) NOT NULL,   -- how many units of this activity's driver this work order consumed
  allocated_cost      NUMERIC(18,4) NOT NULL,   -- driver_quantity x the pool's rate_per_driver at the time of allocation
  allocated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wo_abc_allocations_wo ON work_order_abc_allocations(work_order_id);
CREATE INDEX idx_abc_pools_company ON abc_activity_pools(company_id);

-- ---------- Permissions ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('manufacturing', 'manage_costing', 'manufacturing.costing.manage', 'Configure standard cost cards, process cost batches, and ABC activity pools')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'manufacturing.costing.manage'
ON CONFLICT DO NOTHING;
