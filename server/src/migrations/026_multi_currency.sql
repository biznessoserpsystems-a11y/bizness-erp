-- ============================================================
-- Bizness-OS: Multi-Currency Support
-- ============================================================
-- Builds on the `currencies` and `exchange_rates` tables already scaffolded
-- in 001_init_schema.sql (previously unused). This migration:
--   1. Seeds a few more common currencies alongside the existing GHS/USD/EUR/GBP
--   2. Adds a per-company enabled-currency list (company_currencies) — the
--      global `currencies.is_active` flag shouldn't be one company's dial
--      for every other company
--   3. Adds `currency` + `exchange_rate` to every sales/procurement document
--      that carries money, plus a default currency on customers/suppliers
--   4. Adds an audit-only (currency, exchange_rate, foreign_total) trio to
--      journal_entries, and an FX Gain / FX Loss account pair
--
-- Design principle: a document's subtotal/tax/total columns stay in ITS OWN
-- currency (what the customer/supplier actually sees). `exchange_rate` is
-- the rate to the company's base_currency at the time the document was
-- created (or settled, for payments). Every GL posting converts to base
-- currency using that stored rate BEFORE calling postJournalEntry — the
-- ledger itself never stores foreign amounts in debit/credit, so every
-- existing report (trial balance, financial statements, ledgers) keeps
-- working completely unmodified. The journal_entries columns added here
-- are pure audit trail — nothing reads them for calculations.
--
-- Inventory valuation is the one exception worth calling out: stock_batches
-- and stock_levels.average_cost are ALWAYS in base currency (it's one shared
-- costing pool used for COGS regardless of which currency any given purchase
-- happened in), so GRN receipts convert to base currency before touching the
-- stock ledger, not at GL-posting time.

INSERT INTO currencies (code, name, symbol, is_active) VALUES
  ('NGN', 'Nigerian Naira', '₦', TRUE),
  ('ZAR', 'South African Rand', 'R', TRUE),
  ('CNY', 'Chinese Yuan', '¥', TRUE),
  ('XOF', 'CFA Franc BCEAO', 'CFA', TRUE)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE company_currencies (
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  currency_code   VARCHAR(10) NOT NULL REFERENCES currencies(code),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, currency_code)
);

-- Every existing company gets its own base currency enabled automatically.
INSERT INTO company_currencies (company_id, currency_code)
SELECT id, base_currency FROM companies
ON CONFLICT DO NOTHING;

-- ---------- Default currency on customers/suppliers (NULL = company base currency) ----------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS currency VARCHAR(10);

-- ---------- Sales documents ----------
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;

-- ---------- Procurement documents ----------
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'GHS';
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1;

-- bank_accounts.currency already existed (004_accounting.sql) — used as-is.

-- ---------- Journal entries: audit-only foreign-currency annotation ----------
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS foreign_total NUMERIC(18,4);

-- ---------- FX Gain / FX Loss accounts + mappings (existing companies) ----------
-- Mirrors the existing asset_disposal_gain / asset_disposal_loss pattern: one
-- account per direction rather than a single account netted at report time.
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, x.code, x.name, x.type, x.subtype, x.normal, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('4930', 'Foreign Exchange Gain', 'revenue', 'other_revenue', 'credit'),
  ('6930', 'Foreign Exchange Loss', 'expense', 'other_expense', 'debit')
) AS x(code, name, type, subtype, normal)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts existing WHERE existing.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts dup WHERE dup.company_id = c.id AND dup.account_code = x.code)
ON CONFLICT DO NOTHING;

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES ('4930', 'fx_gain'), ('6930', 'fx_loss')) AS m(code, key) ON m.code = coa.account_code
ON CONFLICT (company_id, mapping_key) DO NOTHING;
