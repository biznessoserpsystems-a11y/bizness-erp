-- ============================================================
-- Bizness-OS: Income module (Accounting & Finance)
--
-- Quick-entry recording of income received outside the Sales module
-- (e.g. rental income, interest income, grants, gains on disposal) that
-- still needs to hit the GL as a proper double entry: Dr deposit account
-- (asset) / Cr income account (revenue).
--
-- Presentation follows IAS 1: revenue accounts are split by
-- account_subtype into 'operating_revenue' (the entity's core trading
-- income) and 'other_revenue' (everything else — IAS 1.85/BC56 lets an
-- entity present "other income" as a separate line from revenue). The
-- income_account_id here must reference a 'revenue' type account; which
-- of the two subtypes it is drives the IFRS ordering in the UI/report,
-- not a column on this table itself.
-- ============================================================

CREATE TABLE income_entries (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_no           VARCHAR(50) NOT NULL,
  entry_date         DATE DEFAULT CURRENT_DATE,
  income_account_id  UUID NOT NULL REFERENCES chart_of_accounts(id), -- revenue account (Cr)
  deposit_account_id UUID NOT NULL REFERENCES chart_of_accounts(id), -- asset account received into (Dr)
  payer              VARCHAR(150),
  description        TEXT NOT NULL,
  amount             NUMERIC(18,4) NOT NULL,
  journal_entry_id   UUID REFERENCES journal_entries(id),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, entry_no)
);

CREATE INDEX idx_income_entries_company ON income_entries(company_id);
CREATE INDEX idx_income_entries_income_account ON income_entries(income_account_id);
CREATE INDEX idx_income_entries_date ON income_entries(entry_date);

INSERT INTO permissions (module, action, code, description) VALUES
  ('accounting', 'manage_income', 'accounting.income.manage', 'Record and view non-sales income entries')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'accounting.income.manage'
ON CONFLICT DO NOTHING;
