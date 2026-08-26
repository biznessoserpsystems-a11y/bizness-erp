-- ============================================================
-- Bizness-OS: Inventory & Warehouse Settings
--
-- Company-wide configuration for Inventory & Warehouse, following the same
-- pattern as Procurement Settings (035), HR's Statutory Settings, and
-- Manufacturing Settings (049) — one editable row per company.
--
--   - default_warehouse_id: falls back for a stock operation that doesn't
--     specify a warehouse. Nullable — a company with several sites may
--     prefer to always choose explicitly, so no default is forced.
--   - allow_negative_stock: a real behavioural change, not just a display
--     preference. stockService.issueStock has always hard-blocked any
--     issue that would take a non-batch-tracked product's quantity below
--     zero (see stockService.js's own "Insufficient stock" check) — some
--     businesses genuinely need to record a sale before the matching
--     receipt is entered (backdated paperwork, a supplier delivery that's
--     physically arrived but not yet logged) and true the balance up
--     later. Defaults to FALSE, preserving every existing company's exact
--     current behaviour unless they deliberately opt in. Deliberately
--     scoped to non-batch-tracked products only — going "negative" on a
--     specific physical batch has no real-world meaning, so batch-tracked
--     issues stay hard-blocked regardless of this setting.
--   - default_reorder_level / default_reorder_quantity: pre-fill a new
--     product's reorder fields instead of the hardcoded 0 the product
--     controller used before this, so newly-created products aren't
--     silently invisible to the Low Stock report until someone remembers
--     to set a threshold.
--   - expiry_alert_window_days: the default "expiring within N days"
--     window the Expiry report and Inventory Workspace dashboard use when
--     no explicit window is requested, instead of the 30-day figure that
--     was hardcoded into the frontend's own API calls.
--   - stock_count_variance_tolerance_pct: the |variance| / system_quantity
--     percentage above which a completed inventory count's line is
--     flagged as materially significant — the same "isSignificant"
--     pattern Manufacturing Settings already established for overhead
--     variance, applied here to stock count variance instead.
-- ============================================================

CREATE TABLE inventory_settings (
  company_id                          UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  default_warehouse_id                UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  allow_negative_stock                BOOLEAN NOT NULL DEFAULT FALSE,
  default_reorder_level               NUMERIC(18,4) NOT NULL DEFAULT 0,
  default_reorder_quantity            NUMERIC(18,4) NOT NULL DEFAULT 0,
  expiry_alert_window_days            INTEGER NOT NULL DEFAULT 30 CHECK (expiry_alert_window_days > 0),
  stock_count_variance_tolerance_pct  NUMERIC(5,2) NOT NULL DEFAULT 5.00
                                       CHECK (stock_count_variance_tolerance_pct >= 0 AND stock_count_variance_tolerance_pct <= 100),
  updated_at                          TIMESTAMPTZ DEFAULT NOW(),
  created_at                          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a default-valued row for every existing company so the settings
-- page has something real to show immediately, without waiting on the
-- lazy get-or-create the API also does for companies created afterwards.
INSERT INTO inventory_settings (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO permissions (module, action, code, description) VALUES
  ('inventory', 'manage_settings', 'inventory.settings.manage', 'View and edit Inventory & Warehouse module settings')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'inventory.settings.manage'
ON CONFLICT DO NOTHING;
