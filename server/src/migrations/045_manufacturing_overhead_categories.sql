-- ============================================================
-- Bizness-OS: Manufacturing Overhead — real category breakdown
--
-- The original Manufacturing module created a single "Manufacturing
-- Overhead — Actual" account (6060) meant to hold actual factory overhead
-- for comparison against applied overhead (IAS 2.13's variance check) —
-- but no endpoint was ever built to actually post to it, so it has always
-- shown zero. This replaces that one lump account with nine real,
-- individually-trackable overhead categories, and a genuine recording
-- endpoint for each (see manufacturingController.js's recordOverheadActual).
--
-- Why separate accounts rather than one account with a "category" column:
-- these are genuinely different cost centers a manufacturer wants to see
-- broken out on their own P&L lines (how much are we actually spending on
-- factory rent vs. security vs. indirect labour), not just sub-categories
-- of one number — matching how the rest of this system's chart of
-- accounts already works (e.g. PAYE Payable and SSNIT Payable are
-- separate accounts, not one "Statutory Payable" with a type column).
--
-- "Factory Maintenance" here is deliberately its own account, distinct
-- from the Rental module's "Repairs & Maintenance Expense" (6045) added
-- earlier — factory production maintenance and rental asset maintenance
-- are different cost pools that happen to share a similar name.
--
-- "Factory Depreciation" is also its own account, separate from the
-- general "Depreciation Expense" (6050) every fixed asset already posts
-- to via the existing Asset Management depreciation run — this migration
-- doesn't touch that flow at all. A company that wants factory equipment
-- depreciation counted as manufacturing overhead records it here
-- separately/manually, rather than this migration silently rerouting
-- existing depreciation postings (a much riskier change to a tested,
-- unrelated module).
-- ============================================================

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('6061', 'Manufacturing Overhead — Indirect Labour', 'expense', 'cogs', 'debit'),
  ('6062', 'Manufacturing Overhead — Factory Rent', 'expense', 'cogs', 'debit'),
  ('6063', 'Manufacturing Overhead — Utilities', 'expense', 'cogs', 'debit'),
  ('6064', 'Manufacturing Overhead — Insurance', 'expense', 'cogs', 'debit'),
  ('6065', 'Manufacturing Overhead — Security', 'expense', 'cogs', 'debit'),
  ('6066', 'Manufacturing Overhead — Cleaning', 'expense', 'cogs', 'debit'),
  ('6067', 'Manufacturing Overhead — Factory Depreciation', 'expense', 'cogs', 'debit'),
  ('6068', 'Manufacturing Overhead — Factory Maintenance', 'expense', 'cogs', 'debit'),
  ('6069', 'Manufacturing Overhead — Factory Management Salaries', 'expense', 'cogs', 'debit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.mapping_key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES
  ('6061', 'moh_indirect_labour'), ('6062', 'moh_factory_rent'), ('6063', 'moh_utilities'),
  ('6064', 'moh_insurance'), ('6065', 'moh_security'), ('6066', 'moh_cleaning'),
  ('6067', 'moh_factory_depreciation'), ('6068', 'moh_factory_maintenance'), ('6069', 'moh_factory_management_salaries')
) AS m(code, mapping_key)
  ON coa.account_code = m.code
ON CONFLICT (company_id, mapping_key) DO NOTHING;
