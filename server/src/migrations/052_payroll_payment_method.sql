-- ============================================================
-- Bizness-OS: Payroll payment method
--
-- markPayrollRunPaid has always posted the net salaries payment as
-- Dr Net Salaries Payable / Cr [a single hardcoded 'cash_default' GL
-- account] — meaning every payroll run, regardless of how salaries are
-- actually disbursed, posted as if paid in physical cash. For a Ghana SME
-- that's the less common case in practice — most pay by bank transfer or
-- increasingly Mobile Money — so this adds a real Payment Option, selected
-- when the run is created ("running payroll"), that decides which GL
-- account the eventual payment posts against.
--
--   - payment_method: the same cash/bank_transfer/mobile_money/cheque/card
--     vocabulary customer_payments (003_sales.sql) and supplier payments
--     (005_procurement.sql) already use — reused here rather than
--     inventing a parallel set of values. Defaults to 'bank_transfer'
--     rather than 'cash', since that's the realistic default for payroll
--     specifically (unlike, say, a small cash sale).
--   - bank_account_id: which specific bank account to credit when the
--     method isn't cash. Nullable — a run left as 'cash' (or one that
--     picks a non-cash method but doesn't specify which account) falls
--     back to the existing 'cash_default' mapping exactly as before,
--     preserving current behaviour for every payroll run that predates
--     this column.
-- ============================================================

ALTER TABLE payroll_runs ADD COLUMN payment_method VARCHAR(30) NOT NULL DEFAULT 'bank_transfer'
  CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'));
ALTER TABLE payroll_runs ADD COLUMN bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;
