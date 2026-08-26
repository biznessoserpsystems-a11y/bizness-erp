-- ============================================================
-- Bizness-OS: IFRS alignment for financial statement presentation (IAS 1)
--
-- Three things IAS 1 requires that the base chart didn't have a home for:
--   1. A current/non-current split on the statement of financial position
--      (IAS 1.60-76) - account_subtype already supports this in principle
--      (current_asset/fixed_asset, current_liability/long_term_liability)
--      but every liability the base chart ships was current_liability, so
--      there was no non-current liability account to classify against.
--   2. Finance costs presented as their own line, separate from other
--      operating expenses (IAS 1.82(b)).
--   3. Income tax expense presented as its own line (IAS 1.82(d)).
-- Same backfill idiom as 012_asset_management.sql's Depreciation Expense
-- account: only inserts into companies that already have a chart of
-- accounts, and only if the code isn't already present.
-- ============================================================

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, '2500', 'Long-term Loans Payable', 'liability', 'long_term_liability', 'credit', TRUE
FROM companies c
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = '2500');

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, '6800', 'Finance Costs', 'expense', 'finance_cost', 'debit', TRUE
FROM companies c
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = '6800');

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, '6950', 'Income Tax Expense', 'expense', 'tax_expense', 'debit', TRUE
FROM companies c
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = '6950');
