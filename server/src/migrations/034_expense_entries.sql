-- ============================================================
-- Bizness-OS: Expenses module (Accounting & Finance)
--
-- Quick-entry recording of expenses paid outside the Procurement module
-- (e.g. rent, utilities, bank charges, sundry/office expenses, interest
-- paid, tax settlements) that still needs to hit the GL as a proper
-- double entry: Dr expense account / Cr payment account (asset).
-- The buy-side mirror of 033_income_entries.sql.
--
-- Presentation follows IAS 1.99-105 (statement of profit or loss
-- classified BY FUNCTION): the expense_account_id here must reference
-- an 'expense' type account, and its account_subtype ('cogs',
-- 'operating_expense'/'other_expense', 'finance_cost', 'tax_expense')
-- drives which of the four IFRS-mandated P&L lines it's grouped under
-- in the UI/report — Cost of Sales, Operating Expenses, Finance Costs,
-- Income Tax Expense — the exact same four buckets
-- financialStatementController.js already uses to build the income
-- statement, so this module's totals always reconcile against it.
-- Which bucket an entry lands in is driven entirely by the chosen
-- account's subtype, not a column on this table itself.
-- ============================================================

CREATE TABLE expense_entries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_no            VARCHAR(50) NOT NULL,
  entry_date          DATE DEFAULT CURRENT_DATE,
  expense_account_id  UUID NOT NULL REFERENCES chart_of_accounts(id), -- expense account (Dr)
  payment_account_id  UUID NOT NULL REFERENCES chart_of_accounts(id), -- asset account paid from (Cr)
  payee               VARCHAR(150),
  description         TEXT NOT NULL,
  amount              NUMERIC(18,4) NOT NULL,
  journal_entry_id    UUID REFERENCES journal_entries(id),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, entry_no)
);

CREATE INDEX idx_expense_entries_company ON expense_entries(company_id);
CREATE INDEX idx_expense_entries_expense_account ON expense_entries(expense_account_id);
CREATE INDEX idx_expense_entries_date ON expense_entries(entry_date);

INSERT INTO permissions (module, action, code, description) VALUES
  ('accounting', 'manage_expenses', 'accounting.expenses.manage', 'Record and view non-procurement expense entries')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'accounting.expenses.manage'
ON CONFLICT DO NOTHING;
