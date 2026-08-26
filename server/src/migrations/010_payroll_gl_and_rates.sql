-- ============================================================
-- Bizness-OS: Payroll GL posting + configurable statutory rates
--
-- Two gaps this closes in Module 12 (HR & Payroll):
--   1. SSNIT rates and PAYE bands were hardcoded constants in the
--      controller. They now live in config tables per company, so
--      rates can be updated from the UI when GRA revises them.
--   2. Processing a payroll run did not touch the general ledger,
--      so statutory liabilities never reached the balance sheet.
--      Runs now post a balanced journal entry.
--
-- Also adds the employer's SSNIT share (13%), which was previously
-- not modelled at all — it is an employer cost, so it becomes an
-- expense plus a liability rather than an employee deduction.
-- ============================================================

-- ---------- Configurable statutory rates ----------

CREATE TABLE IF NOT EXISTS payroll_settings (
  company_id              UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  ssnit_employee_rate     NUMERIC(6,3) NOT NULL DEFAULT 5.5,   -- % of basic, withheld from employee
  ssnit_employer_rate     NUMERIC(6,3) NOT NULL DEFAULT 13.0,  -- % of basic, employer cost
  ssnit_insurable_ceiling NUMERIC(18,4),                       -- annual cap; NULL = uncapped
  allowances_taxable      BOOLEAN NOT NULL DEFAULT TRUE,       -- are allowances part of chargeable income?
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Progressive monthly PAYE bands, applied to chargeable income.
-- upper_bound NULL marks the open-ended top band.
CREATE TABLE IF NOT EXISTS paye_tax_bands (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  band_order    INT NOT NULL,
  lower_bound   NUMERIC(18,4) NOT NULL,
  upper_bound   NUMERIC(18,4),
  rate          NUMERIC(6,4) NOT NULL,   -- 0.175 = 17.5%
  UNIQUE(company_id, band_order)
);

CREATE INDEX IF NOT EXISTS idx_paye_bands_company ON paye_tax_bands(company_id);

-- ---------- Carry employer SSNIT + link runs to the ledger ----------

ALTER TABLE payslips     ADD COLUMN IF NOT EXISTS ssnit_employer NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_ssnit_employee NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_ssnit_employer NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_paye NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS payment_journal_entry_id UUID REFERENCES journal_entries(id);

-- ---------- Seed settings for existing companies ----------

INSERT INTO payroll_settings (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

-- Seed the current GRA-style monthly bands for any company without bands yet.
INSERT INTO paye_tax_bands (company_id, band_order, lower_bound, upper_bound, rate)
SELECT c.id, b.band_order, b.lower_bound, b.upper_bound, b.rate
FROM companies c
CROSS JOIN (VALUES
  (1, 0::numeric,      490::numeric,   0::numeric),
  (2, 490::numeric,    600::numeric,   0.05::numeric),
  (3, 600::numeric,    730::numeric,   0.10::numeric),
  (4, 730::numeric,    3730::numeric,  0.175::numeric),
  (5, 3730::numeric,   19730::numeric, 0.25::numeric),
  (6, 19730::numeric,  49730::numeric, 0.30::numeric),
  (7, 49730::numeric,  NULL::numeric,  0.35::numeric)
) AS b(band_order, lower_bound, upper_bound, rate)
WHERE NOT EXISTS (SELECT 1 FROM paye_tax_bands x WHERE x.company_id = c.id);

-- ---------- Payroll GL accounts ----------
-- Only for companies that already have a chart of accounts.

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, v.code, v.name, v.acct_type, v.subtype, v.nb, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('2310', 'PAYE Payable',                'liability', 'current_liability', 'credit'),
  ('2320', 'SSNIT Payable',               'liability', 'current_liability', 'credit'),
  ('2330', 'Net Salaries Payable',        'liability', 'current_liability', 'credit'),
  ('2340', 'Staff Deductions Payable',    'liability', 'current_liability', 'credit'),
  ('6015', 'SSNIT Employer Contribution', 'expense',   'operating_expense', 'debit')
) AS v(code, name, acct_type, subtype, nb)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = v.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES
  ('6010', 'salaries_expense'),
  ('6015', 'ssnit_employer_expense'),
  ('2310', 'paye_payable'),
  ('2320', 'ssnit_payable'),
  ('2330', 'salaries_payable'),
  ('2340', 'staff_deductions_payable')
) AS m(code, key) ON m.code = coa.account_code
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- ---------- Permission for editing statutory rates ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_settings', 'hr.settings.manage', 'Edit SSNIT rates and PAYE tax bands')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'hr.settings.manage'
ON CONFLICT DO NOTHING;
