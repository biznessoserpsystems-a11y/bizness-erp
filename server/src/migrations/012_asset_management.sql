-- ================================================================
-- Bizness-OS: Module 12 — Asset Management (IFRS-compliant)
--
-- Implements the fixed-asset lifecycle per:
--   IAS 16 Property, Plant and Equipment — recognition at cost, depreciation
--     over useful life, subsequent measurement under either the cost model
--     or the revaluation model, and derecognition (disposal) with gain/loss
--     in profit or loss.
--   IAS 36 Impairment of Assets — impairment losses recognised when carrying
--     amount exceeds recoverable amount, with reversals capped at what the
--     depreciated historical cost would have been had no impairment occurred.
--
-- Design notes:
--   - Each asset class ("category") maps to its own cost / accumulated
--     depreciation / depreciation expense GL accounts, since IAS 16 requires
--     separate classes of PP&E to be presented separately.
--   - `fixed_assets.cost` is the *current* depreciable gross carrying amount.
--     Under the cost model this never changes after acquisition (subsequent
--     capitalised additions aside). Under the revaluation model, a
--     revaluation event restates it to fair value and eliminates
--     accumulated depreciation against it (IAS 16.35(b), the more common of
--     the two permitted restatement approaches).
--   - `original_cost` is the historical acquisition cost and never changes;
--     it anchors the IAS 36.117 cap on impairment-loss reversals.
--   - Depreciation, disposals, and revaluation/impairment events are each
--     logged to their own immutable ledger table (mirroring the
--     stock_movements pattern from Module 05), so the asset register's
--     running balances can always be reconciled back to source postings.
-- ================================================================

-- ---------- Asset Categories (asset classes, each with their own GL accounts) ----------

CREATE TABLE asset_categories (
  id                                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                              VARCHAR(150) NOT NULL,
  description                       TEXT,
  default_depreciation_method       VARCHAR(20) NOT NULL DEFAULT 'straight_line', -- straight_line, reducing_balance, units_of_production
  default_useful_life_years         NUMERIC(6,2),
  default_residual_pct              NUMERIC(5,2) DEFAULT 0, -- % of cost assumed as residual value
  asset_account_id                  UUID NOT NULL REFERENCES chart_of_accounts(id), -- gross carrying amount (asset)
  accumulated_depreciation_account_id UUID NOT NULL REFERENCES chart_of_accounts(id), -- contra-asset
  depreciation_expense_account_id   UUID NOT NULL REFERENCES chart_of_accounts(id), -- P&L expense
  is_active                         BOOLEAN DEFAULT TRUE,
  created_at                        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE INDEX idx_asset_categories_company ON asset_categories(company_id);

-- ---------- Fixed Asset Register ----------

CREATE TABLE fixed_assets (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id                   UUID REFERENCES branches(id) ON DELETE SET NULL,
  category_id                 UUID NOT NULL REFERENCES asset_categories(id),
  asset_code                  VARCHAR(50) NOT NULL,
  name                        VARCHAR(255) NOT NULL,
  description                 TEXT,
  serial_number               VARCHAR(100),
  location                    VARCHAR(150),
  custodian                   VARCHAR(150),
  supplier_id                 UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_invoice_id         UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL,

  acquisition_date            DATE NOT NULL,
  original_cost               NUMERIC(18,4) NOT NULL,        -- historical cost, never changes (IAS 36.117 reversal cap)
  cost                        NUMERIC(18,4) NOT NULL,        -- current depreciable gross carrying amount
  residual_value              NUMERIC(18,4) NOT NULL DEFAULT 0,

  depreciation_method         VARCHAR(20) NOT NULL DEFAULT 'straight_line', -- straight_line, reducing_balance, units_of_production
  useful_life_years           NUMERIC(6,2),                   -- straight_line / reducing_balance
  reducing_balance_rate       NUMERIC(5,2),                   -- % per annum, reducing_balance only
  total_estimated_units       NUMERIC(18,4),                  -- units_of_production only
  units_consumed_to_date      NUMERIC(18,4) NOT NULL DEFAULT 0,
  depreciation_start_date     DATE,

  accumulated_depreciation    NUMERIC(18,4) NOT NULL DEFAULT 0,

  measurement_model           VARCHAR(20) NOT NULL DEFAULT 'cost', -- cost or revaluation (IAS 16.29)
  revaluation_surplus_balance NUMERIC(18,4) NOT NULL DEFAULT 0,     -- cumulative OCI/equity balance for this asset
  revaluation_pl_decrease_balance NUMERIC(18,4) NOT NULL DEFAULT 0, -- cumulative past revaluation decreases recognised in P&L (available for future reversal, IAS 16.39)
  last_revaluation_date       DATE,

  accumulated_impairment      NUMERIC(18,4) NOT NULL DEFAULT 0,     -- IAS 36

  status                      VARCHAR(20) NOT NULL DEFAULT 'active', -- under_construction, active, fully_depreciated, disposed
  disposed_at                 TIMESTAMPTZ,

  created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, asset_code),
  CHECK (depreciation_method IN ('straight_line', 'reducing_balance', 'units_of_production')),
  CHECK (measurement_model IN ('cost', 'revaluation')),
  CHECK (status IN ('under_construction', 'active', 'fully_depreciated', 'disposed'))
);

CREATE INDEX idx_fixed_assets_company ON fixed_assets(company_id);
CREATE INDEX idx_fixed_assets_category ON fixed_assets(category_id);
CREATE INDEX idx_fixed_assets_status ON fixed_assets(company_id, status);

-- ---------- Depreciation Ledger (immutable, one row per asset per run) ----------

CREATE TABLE asset_depreciation_entries (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id                  UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_start              DATE NOT NULL,
  period_end                DATE NOT NULL,
  method_used               VARCHAR(20) NOT NULL,
  units_used                NUMERIC(18,4),                    -- units_of_production only
  depreciation_amount       NUMERIC(18,4) NOT NULL,
  accumulated_depreciation_after NUMERIC(18,4) NOT NULL,
  carrying_amount_after     NUMERIC(18,4) NOT NULL,
  journal_entry_id          UUID REFERENCES journal_entries(id),
  created_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_asset_depr_entries_asset ON asset_depreciation_entries(asset_id, period_end);
CREATE INDEX idx_asset_depr_entries_period ON asset_depreciation_entries(company_id, period_end);

-- A given asset can only be depreciated once for a given period end (prevents double-running).
CREATE UNIQUE INDEX idx_asset_depr_entries_unique_period ON asset_depreciation_entries(asset_id, period_end);

-- ---------- Revaluations & Impairments (IAS 16 revaluation model + IAS 36) ----------

CREATE TABLE asset_value_adjustments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id              UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  adjustment_type       VARCHAR(20) NOT NULL, -- revaluation, impairment, impairment_reversal
  adjustment_date       DATE NOT NULL,
  carrying_amount_before NUMERIC(18,4) NOT NULL,
  new_amount            NUMERIC(18,4) NOT NULL, -- fair value (revaluation) or recoverable amount (impairment/reversal)
  amount_to_oci         NUMERIC(18,4) NOT NULL DEFAULT 0, -- revaluation surplus movement (equity, no P&L impact)
  amount_to_pl          NUMERIC(18,4) NOT NULL DEFAULT 0, -- impairment loss / reversal / excess decrease recognised in P&L
  notes                 TEXT,
  journal_entry_id      UUID REFERENCES journal_entries(id),
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  CHECK (adjustment_type IN ('revaluation', 'impairment', 'impairment_reversal'))
);

CREATE INDEX idx_asset_value_adj_asset ON asset_value_adjustments(asset_id, adjustment_date);

-- ---------- Disposals ----------

CREATE TABLE asset_disposals (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id                        UUID NOT NULL UNIQUE REFERENCES fixed_assets(id),
  disposal_date                   DATE NOT NULL,
  disposal_method                 VARCHAR(20) NOT NULL DEFAULT 'sale', -- sale, scrap, donation, write_off
  proceeds                        NUMERIC(18,4) NOT NULL DEFAULT 0,
  carrying_amount_at_disposal     NUMERIC(18,4) NOT NULL,
  gain_loss_amount                NUMERIC(18,4) NOT NULL DEFAULT 0, -- positive = gain, negative = loss, recognised in P&L
  revaluation_surplus_transferred NUMERIC(18,4) NOT NULL DEFAULT 0, -- IAS 16.41: moved straight to retained earnings, never through P&L
  notes                           TEXT,
  journal_entry_id                UUID REFERENCES journal_entries(id),
  created_by                      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (disposal_method IN ('sale', 'scrap', 'donation', 'write_off'))
);

CREATE INDEX idx_asset_disposals_company ON asset_disposals(company_id);

-- ---------- Seed: permissions for Module 12 ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('assets', 'manage_categories', 'assets.categories.manage', 'Create/edit asset categories and their GL account mappings'),
  ('assets', 'manage_register', 'assets.register.manage', 'Create and edit fixed assets in the register'),
  ('assets', 'run_depreciation', 'assets.depreciation.run', 'Run periodic depreciation and post to the GL'),
  ('assets', 'manage_disposals', 'assets.disposals.manage', 'Record asset disposals'),
  ('assets', 'manage_revaluation', 'assets.revaluation.manage', 'Record revaluations and impairment assessments'),
  ('assets', 'view_reports', 'assets.reports.view', 'View the asset register, depreciation schedule, and disposal reports')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'assets'
ON CONFLICT DO NOTHING;

-- ---------- Seed: extra GL accounts + mappings for companies that already have a chart of accounts ----------
-- New companies get these via seedDefaultChartOfAccounts at registration (accountingService.js).

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, x.code, x.name, x.type, x.subtype, x.normal_balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('1520', 'Capital Work in Progress', 'asset', 'fixed_asset', 'debit'),
  ('3200', 'Revaluation Surplus', 'equity', 'equity', 'credit'),
  ('4910', 'Gain on Disposal of Assets', 'revenue', 'other_revenue', 'credit'),
  ('4920', 'Reversal of Impairment Loss', 'revenue', 'other_revenue', 'credit'),
  ('6910', 'Loss on Disposal of Assets', 'expense', 'other_expense', 'debit'),
  ('6920', 'Impairment Loss', 'expense', 'other_expense', 'debit')
) AS x(code, name, type, subtype, normal_balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts y WHERE y.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts y WHERE y.company_id = c.id AND y.account_code = x.code)
ON CONFLICT DO NOTHING;

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.mapping_key, coa.id
FROM chart_of_accounts coa
CROSS JOIN LATERAL (
  SELECT CASE coa.account_code
    WHEN '3200' THEN 'asset_revaluation_surplus'
    WHEN '4910' THEN 'asset_disposal_gain'
    WHEN '4920' THEN 'asset_impairment_reversal_gain'
    WHEN '6910' THEN 'asset_disposal_loss'
    WHEN '6920' THEN 'asset_impairment_loss'
  END AS mapping_key
) m
WHERE coa.account_code IN ('3200', '4910', '4920', '6910', '6920')
  AND m.mapping_key IS NOT NULL
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- ---------- Depreciation expense account ----------
-- The base chart ships Accumulated Depreciation (1510) but no matching expense
-- account, which left asset categories with nowhere sensible to post the charge.
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, '6050', 'Depreciation Expense', 'expense', 'operating_expense', 'debit', TRUE
FROM companies c
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = '6050');

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, 'depreciation_expense', coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '6050'
ON CONFLICT (company_id, mapping_key) DO NOTHING;
