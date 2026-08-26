-- ============================================================
-- Bizness-OS: Rental Services Module
--
-- A rentable "item" is either an existing Fixed Asset (IAS 16 — the
-- company's own equipment/vehicles, already depreciating on their own
-- schedule; renting one out doesn't change that) or an existing Product
-- (identical units held as stock, e.g. a fleet of the same tool). Either
-- way, this module doesn't own or duplicate the underlying asset/product
-- record — it just references it and manages the rental lifecycle on top.
--
-- Deliberately built as its own billing flow rather than reusing the
-- existing sales_invoices/sales_invoice_lines tables: those require a
-- product_id and post revenue through a single flat `sales_revenue`
-- mapping shared by every invoice line in the system — which would bury
-- rental income inside ordinary goods-sales revenue rather than its own
-- disclosed line, a real IAS 1 presentation concern for a business where
-- rental is a distinct revenue stream. Rental charges post directly to a
-- dedicated Rental Income account instead, at the cost of not appearing
-- in the general Sales Invoice list — a deliberate, documented trade-off,
-- the same one Income/Expense quick-entry already made for the same
-- reason.
--
-- Security deposits are a LIABILITY, not revenue, until refunded or
-- forfeited (IFRS Conceptual Framework — a deposit is a present
-- obligation to return cash, not yet-earned income) — held in a
-- dedicated Rental Deposits Held account, never mixed into Rental Income
-- until the point it's actually forfeited.
-- ============================================================

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('2360', 'Rental Deposits Held', 'liability', 'current_liability', 'credit'),
  ('4200', 'Rental Income', 'revenue', 'operating_revenue', 'credit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.mapping_key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES ('2360', 'rental_deposits_held'), ('4200', 'rental_income')) AS m(code, mapping_key)
  ON coa.account_code = m.code
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- ---------- Rental Items ----------

CREATE TABLE rental_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,
  item_type         VARCHAR(20) NOT NULL CHECK (item_type IN ('fixed_asset', 'product')),
  fixed_asset_id    UUID REFERENCES fixed_assets(id),   -- set when item_type = 'fixed_asset'
  product_id        UUID REFERENCES products(id),        -- set when item_type = 'product'
  daily_rate        NUMERIC(18,4),
  weekly_rate       NUMERIC(18,4),
  monthly_rate      NUMERIC(18,4),
  deposit_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance', 'retired')),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rental_items_source_check CHECK (
    (item_type = 'fixed_asset' AND fixed_asset_id IS NOT NULL AND product_id IS NULL) OR
    (item_type = 'product' AND product_id IS NOT NULL AND fixed_asset_id IS NULL)
  )
);

CREATE INDEX idx_rental_items_company ON rental_items(company_id);

-- ---------- Rental Agreements ----------

CREATE TABLE rental_agreements (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agreement_no          VARCHAR(50) NOT NULL,
  customer_id           UUID NOT NULL REFERENCES customers(id),
  rental_item_id        UUID NOT NULL REFERENCES rental_items(id),
  rate_type             VARCHAR(20) NOT NULL CHECK (rate_type IN ('daily', 'weekly', 'monthly')),
  rate_amount           NUMERIC(18,4) NOT NULL,
  start_date            DATE NOT NULL,
  expected_return_date  DATE NOT NULL,
  actual_return_date    DATE,
  deposit_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
  deposit_status        VARCHAR(20) NOT NULL DEFAULT 'not_collected' CHECK (deposit_status IN ('not_collected', 'held', 'refunded', 'forfeited', 'partially_forfeited')),
  status                VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'returned', 'cancelled')),
  notes                 TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, agreement_no),
  CONSTRAINT rental_agreements_dates_check CHECK (expected_return_date >= start_date)
);

CREATE INDEX idx_rental_agreements_company ON rental_agreements(company_id);
CREATE INDEX idx_rental_agreements_item ON rental_agreements(rental_item_id);

-- ---------- Rental Charges (billed directly to GL, see header note) ----------

CREATE TABLE rental_charges (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agreement_id      UUID NOT NULL REFERENCES rental_agreements(id) ON DELETE CASCADE,
  charge_type       VARCHAR(20) NOT NULL CHECK (charge_type IN ('rental', 'late_fee', 'damage')),
  description       TEXT NOT NULL,
  amount            NUMERIC(18,4) NOT NULL,
  tax_percent       NUMERIC(5,2) NOT NULL DEFAULT 0,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  charged_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  charged_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rental_charges_agreement ON rental_charges(agreement_id);

-- ---------- Deposit transactions (collect / refund / forfeit) ----------

CREATE TABLE rental_deposit_transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agreement_id      UUID NOT NULL REFERENCES rental_agreements(id) ON DELETE CASCADE,
  transaction_type  VARCHAR(20) NOT NULL CHECK (transaction_type IN ('collected', 'refunded', 'forfeited')),
  amount            NUMERIC(18,4) NOT NULL,
  bank_account_id   UUID REFERENCES bank_accounts(id),
  journal_entry_id  UUID REFERENCES journal_entries(id),
  transacted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  transacted_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rental_deposit_tx_agreement ON rental_deposit_transactions(agreement_id);

-- ---------- Permissions ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('rental', 'manage_items', 'rental.items.manage', 'Add and configure rentable items'),
  ('rental', 'manage_agreements', 'rental.agreements.manage', 'Create rental agreements, bill charges, and process check-in/check-out'),
  ('rental', 'view_reports', 'rental.reports.view', 'View rental utilization and revenue reports')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code IN ('rental.items.manage', 'rental.agreements.manage', 'rental.reports.view')
ON CONFLICT DO NOTHING;
