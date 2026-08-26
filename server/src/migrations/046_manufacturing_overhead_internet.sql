-- ============================================================
-- Bizness-OS: Manufacturing Overhead — missing "Internet" category
--
-- 045_manufacturing_overhead_categories.sql built nine of the ten
-- requested overhead categories (Indirect Labour, Factory Rent,
-- Utilities, Insurance, Security, Cleaning, Factory Depreciation,
-- Factory Maintenance, Factory Management Salaries) — "Internet" was
-- missed. This adds the tenth.
-- ============================================================

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('6071', 'Manufacturing Overhead — Internet', 'expense', 'cogs', 'debit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, 'moh_internet', coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '6071'
ON CONFLICT (company_id, mapping_key) DO NOTHING;
