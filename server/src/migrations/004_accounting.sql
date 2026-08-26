-- ============================================================
-- Bizness-OS: Module 10 — Accounting & Finance
-- ============================================================

-- ---------- Chart of Accounts ----------

CREATE TABLE chart_of_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_code      VARCHAR(20) NOT NULL,
  account_name      VARCHAR(150) NOT NULL,
  account_type      VARCHAR(20) NOT NULL,   -- asset, liability, equity, revenue, expense
  account_subtype   VARCHAR(30),            -- current_asset, fixed_asset, current_liability, long_term_liability,
                                             -- equity, operating_revenue, other_revenue, cogs, operating_expense,
                                             -- other_expense, finance_cost, tax_expense (the last two added by
                                             -- 030_ifrs_alignment.sql so P&L can present them as their own IAS 1 lines)
  normal_balance    VARCHAR(10) NOT NULL,   -- debit or credit
  parent_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  description       TEXT,
  is_system_account BOOLEAN DEFAULT FALSE,  -- true for accounts wired to gl_account_mappings; blocks deletion
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, account_code)
);

-- Maps semantic roles (e.g. "where does AR post to?") to a real account,
-- so the Sales module can auto-post without hardcoding account IDs.
CREATE TABLE gl_account_mappings (
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  mapping_key       VARCHAR(50) NOT NULL,   -- accounts_receivable, accounts_payable, sales_revenue, vat_payable,
                                             -- customer_advances, cash_default, inventory_asset, cogs, retained_earnings
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id),
  PRIMARY KEY (company_id, mapping_key)
);

-- ---------- Opening Balances ----------

CREATE TABLE opening_balances (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit             NUMERIC(18,4) DEFAULT 0,
  credit            NUMERIC(18,4) DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(financial_year_id, account_id)
);

-- ---------- General Journal / Ledger ----------

CREATE TABLE journal_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_no          VARCHAR(50) NOT NULL,
  entry_date        DATE DEFAULT CURRENT_DATE,
  fiscal_period_id  UUID REFERENCES fiscal_periods(id),
  reference_type    VARCHAR(30) DEFAULT 'manual', -- manual, sales_invoice, customer_payment, sales_return, petty_cash, closing, opening_balance
  reference_id      UUID,
  description       TEXT,
  status            VARCHAR(20) DEFAULT 'posted', -- draft, posted, reversed
  total_debit       NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_credit      NUMERIC(18,4) NOT NULL DEFAULT 0,
  reversed_by_entry_id UUID REFERENCES journal_entries(id),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, entry_no)
);

CREATE TABLE journal_entry_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit             NUMERIC(18,4) NOT NULL DEFAULT 0,
  credit            NUMERIC(18,4) NOT NULL DEFAULT 0,
  description       TEXT,
  customer_id       UUID REFERENCES customers(id),  -- optional AR subledger tie
  line_order        INT DEFAULT 0
);

-- ---------- Banking & Reconciliation ----------

CREATE TABLE bank_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id), -- the GL cash/bank account this represents
  bank_name         VARCHAR(150) NOT NULL,
  account_number    VARCHAR(50),
  branch            VARCHAR(150),
  currency          VARCHAR(10) DEFAULT 'GHS',
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bank_statement_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_account_id   UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  transaction_date  DATE NOT NULL,
  description       TEXT,
  amount            NUMERIC(18,4) NOT NULL, -- positive = deposit, negative = withdrawal
  reference         VARCHAR(150),
  is_reconciled     BOOLEAN DEFAULT FALSE,
  matched_journal_entry_line_id UUID REFERENCES journal_entry_lines(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Petty Cash ----------

CREATE TABLE petty_cash_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id), -- the GL petty cash asset account
  name              VARCHAR(150) NOT NULL,
  custodian_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  float_amount      NUMERIC(18,4) DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE petty_cash_vouchers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  petty_cash_account_id UUID NOT NULL REFERENCES petty_cash_accounts(id) ON DELETE CASCADE,
  voucher_no        VARCHAR(50) NOT NULL,
  voucher_date      DATE DEFAULT CURRENT_DATE,
  payee             VARCHAR(150),
  description       TEXT NOT NULL,
  amount            NUMERIC(18,4) NOT NULL,
  expense_account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  journal_entry_id  UUID REFERENCES journal_entries(id),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(petty_cash_account_id, voucher_no)
);

-- ---------- Budgeting ----------

CREATE TABLE budgets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,
  status            VARCHAR(20) DEFAULT 'draft', -- draft, approved
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE budget_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id         UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id),
  fiscal_period_id  UUID NOT NULL REFERENCES fiscal_periods(id),
  budgeted_amount   NUMERIC(18,4) NOT NULL DEFAULT 0,
  UNIQUE(budget_id, account_id, fiscal_period_id)
);

-- ---------- Indexes ----------
CREATE INDEX idx_coa_company ON chart_of_accounts(company_id);
CREATE INDEX idx_coa_type ON chart_of_accounts(account_type);
CREATE INDEX idx_journal_entries_company ON journal_entries(company_id);
CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_journal_entry_lines_account ON journal_entry_lines(account_id);
CREATE INDEX idx_bank_accounts_company ON bank_accounts(company_id);
CREATE INDEX idx_bank_statement_lines_account ON bank_statement_lines(bank_account_id);
CREATE INDEX idx_petty_cash_vouchers_account ON petty_cash_vouchers(petty_cash_account_id);
CREATE INDEX idx_budget_lines_budget ON budget_lines(budget_id);

-- ---------- Seed: additional permissions for Module 10 ----------
INSERT INTO permissions (module, action, code, description) VALUES
  ('accounting', 'manage_coa', 'accounting.coa.manage', 'Create/edit chart of accounts and GL mappings'),
  ('accounting', 'manage_journal', 'accounting.journal.manage', 'Create and post manual journal entries'),
  ('accounting', 'view_ledger', 'accounting.ledger.view', 'View general ledger, trial balance, and financial statements'),
  ('accounting', 'manage_banking', 'accounting.banking.manage', 'Manage bank accounts and reconciliation'),
  ('accounting', 'manage_petty_cash', 'accounting.petty_cash.manage', 'Manage petty cash accounts and vouchers'),
  ('accounting', 'manage_budgets', 'accounting.budgets.manage', 'Create and manage budgets'),
  ('accounting', 'manage_closing', 'accounting.closing.manage', 'Perform month-end and year-end closing')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'accounting'
ON CONFLICT DO NOTHING;
