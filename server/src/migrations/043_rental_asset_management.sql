-- ============================================================
-- Bizness-OS: Rental Asset Management
--
-- Extends the Rental Services module with the parts a real rental
-- operation needs beyond just booking and billing: taking an item out of
-- rotation for maintenance (with a real cost posted to the GL, not just a
-- status flag), recording its condition at check-out and check-in so
-- damage disputes have something to point to, and a utilization report
-- that actually answers "is this item worth what we paid for it" — rented
-- days vs. available days, revenue earned, maintenance cost incurred.
--
-- Maintenance cost is a real operating expense (Dr Repairs & Maintenance /
-- Cr Cash-or-Payable) the moment it's completed — not folded into the
-- item's book value. A rental item being maintained more than it's rented
-- should show up as a cost problem in the P&L, not get quietly absorbed
-- into an asset's carrying amount.
-- ============================================================

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('6045', 'Repairs & Maintenance Expense', 'expense', 'operating_expense', 'debit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, 'repairs_maintenance_expense', coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '6045'
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- ---------- Condition tracking on check-out / check-in ----------

ALTER TABLE rental_agreements ADD COLUMN condition_at_checkout VARCHAR(20) CHECK (condition_at_checkout IN ('excellent', 'good', 'fair', 'damaged'));
ALTER TABLE rental_agreements ADD COLUMN checkout_notes TEXT;
ALTER TABLE rental_agreements ADD COLUMN condition_at_checkin VARCHAR(20) CHECK (condition_at_checkin IN ('excellent', 'good', 'fair', 'damaged'));
ALTER TABLE rental_agreements ADD COLUMN checkin_notes TEXT;

-- ---------- Maintenance records ----------

CREATE TABLE rental_asset_maintenance (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rental_item_id    UUID NOT NULL REFERENCES rental_items(id) ON DELETE CASCADE,
  maintenance_type  VARCHAR(20) NOT NULL DEFAULT 'routine' CHECK (maintenance_type IN ('routine', 'repair', 'inspection')),
  description       TEXT NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_date    DATE NOT NULL,
  completed_date    DATE,
  cost              NUMERIC(18,4),
  journal_entry_id  UUID REFERENCES journal_entries(id),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rental_maintenance_item ON rental_asset_maintenance(rental_item_id);
CREATE INDEX idx_rental_maintenance_company ON rental_asset_maintenance(company_id);
