-- ============================================================
-- Bizness-OS: Manufacturing Account statement — Carriage Inward & Direct Expenses
--
-- The classic Manufacturing Account format (WAEC/Ghana syllabus style)
-- needs two cost lines this system had no account for at all:
--   - Carriage Inward: freight/transport cost to bring raw materials INTO
--     the factory — a real cost-of-purchase component under IAS 2.10
--     ("costs of purchase" includes transport and handling costs directly
--     attributable to the acquisition), distinct from "Carriage Outward"
--     (a selling/distribution expense, out of scope here).
--   - Direct Expenses: costs directly attributable to a specific
--     production run beyond materials and labour (royalties per unit,
--     hire of a specific machine for a job, a specific patent fee) — a
--     standard Prime Cost component in this costing format that isn't
--     the same thing as general factory overhead (which is shared across
--     all production, not traceable to one job).
-- Both are ordinary expense accounts a company posts real transactions to
-- via the existing Expenses quick-entry (they're account_subtype='cogs',
-- so they show up in that page's COGS group automatically) — the
-- Manufacturing Account statement then reads their balance for the period.
-- ============================================================

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('6072', 'Carriage Inward', 'expense', 'cogs', 'debit'),
  ('6073', 'Direct Expenses (Production)', 'expense', 'cogs', 'debit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.mapping_key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES ('6072', 'carriage_inward'), ('6073', 'direct_expenses_production')) AS m(code, mapping_key)
  ON coa.account_code = m.code
ON CONFLICT (company_id, mapping_key) DO NOTHING;
