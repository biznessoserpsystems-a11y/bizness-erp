-- ============================================================
-- Bizness-OS: Manufacturing Settings (Module — Manufacturing Accounting)
--
-- Company-wide configuration for the Manufacturing module, following the
-- same pattern as Procurement Settings (035) and HR's Statutory Settings —
-- one editable row per company, under Manufacturing → Settings.
--
--   - default_warehouse_id: pre-fills / falls back for a new Work Order's
--     warehouse (where raw materials are drawn from and finished goods are
--     received into) when the caller doesn't specify one. Nullable — a
--     company with several plants may prefer to always choose explicitly,
--     so no default is forced.
--   - default_overhead_allocation_base: pre-fills a new
--     manufacturing_overhead_rate's allocation_base ('labour_hours' or
--     'units_produced') instead of the hardcoded 'labour_hours' the
--     controller used before this.
--   - default_costing_method: pre-fills a new Bill of Materials'
--     costing_method (048_manufacturing_costing_methods.sql) instead of
--     relying on that column's hardcoded 'actual' default — lets a company
--     that mostly does, say, job costing skip re-selecting it per BOM.
--   - overhead_variance_threshold_pct: the |variance| / applied_overhead
--     percentage above which the Overhead Variance report (IAS 2.13) flags
--     a period as materially significant, surfaced as `isSignificant` in
--     that endpoint's response rather than left for every user to eyeball.
-- ============================================================

CREATE TABLE manufacturing_settings (
  company_id                        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  default_warehouse_id              UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  default_overhead_allocation_base  VARCHAR(20) NOT NULL DEFAULT 'labour_hours'
                                     CHECK (default_overhead_allocation_base IN ('labour_hours', 'units_produced')),
  default_costing_method            VARCHAR(20) NOT NULL DEFAULT 'actual'
                                     CHECK (default_costing_method IN ('standard', 'actual', 'job', 'process', 'abc')),
  overhead_variance_threshold_pct   NUMERIC(5,2) NOT NULL DEFAULT 10.00
                                     CHECK (overhead_variance_threshold_pct >= 0 AND overhead_variance_threshold_pct <= 100),
  updated_at                        TIMESTAMPTZ DEFAULT NOW(),
  created_at                        TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a default-valued row for every existing company so the settings
-- page has something real to show immediately, without waiting on the
-- lazy get-or-create the API also does for companies created afterwards.
INSERT INTO manufacturing_settings (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO permissions (module, action, code, description) VALUES
  ('manufacturing', 'manage_settings', 'manufacturing.settings.manage', 'View and edit Manufacturing module settings')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'manufacturing.settings.manage'
ON CONFLICT DO NOTHING;
