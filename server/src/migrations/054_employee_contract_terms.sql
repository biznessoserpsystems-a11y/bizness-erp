-- ============================================================
-- Bizness-OS: Employee Contract Terms
--
-- Full-time employees keep using the existing, unchanged company-wide
-- payroll_settings/paye_tax_bands flow (standard SSNIT + PAYE, see
-- 053's predecessor work) — nothing about that path changes here.
--
-- Part Time, Contract, Trainee, and Internship employees are different:
-- how they're actually compensated and taxed varies genuinely case by
-- case, so rather than guess at a single company-wide rule, each such
-- employee gets a Contract Term record defining, individually:
--   - Salary (the amount this specific contract pays — not necessarily
--     the same figure as employees.basic_salary, since a contract's pay
--     is a term of that contract, not a general employee attribute)
--   - Which of Ghana's three pension tiers apply, and at what rate
--   - Whether PAYE applies
--   - Whether Withholding Tax applies instead (the standard treatment
--     for a genuine independent contractor/consultant relationship,
--     since there's no employer-employee relationship for SSNIT to
--     attach to), and at what rate
--
-- Ghana's real 3-tier structure for context (National Pensions Act 2008,
-- Act 766), reflected in the default rates below:
--   Tier 1 (13.5% combined: employee 5.5% + employer 8%) — mandatory,
--     paid to SSNIT itself, a defined-benefit scheme.
--   Tier 2 (5%, employer-paid) — mandatory, paid to a licensed private
--     trustee, NOT SSNIT — a defined-contribution occupational scheme.
--   Tier 3 — entirely voluntary, no fixed rate; a company/employee opts
--     into whatever additional provident-fund contribution they choose.
-- The existing payroll_settings.ssnit_employee_rate/ssnit_employer_rate
-- (5.5%/13%) already models Tier 1 + Tier 2 combined as one number for
-- the standard full-time flow — this table is deliberately more granular
-- since contract terms need to turn Tier 2 off independently of Tier 1
-- (e.g. many short contract/part-time arrangements are Tier-1-only).
--
-- Only one contract term is active per employee at a time — creating a
-- new one deactivates whichever was active before, so payroll always
-- has an unambiguous single source of truth for "how is this person
-- taxed right now" rather than resolving conflicting active rows.
-- ============================================================

CREATE TABLE employee_contract_terms (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  salary                NUMERIC(18,4) NOT NULL,

  ssnit_tier1_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  tier1_employee_rate   NUMERIC(6,3) NOT NULL DEFAULT 5.5,
  tier1_employer_rate   NUMERIC(6,3) NOT NULL DEFAULT 8.0,

  ssnit_tier2_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  tier2_employer_rate   NUMERIC(6,3) NOT NULL DEFAULT 5.0,

  ssnit_tier3_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  tier3_employee_rate   NUMERIC(6,3) NOT NULL DEFAULT 0,
  tier3_employer_rate   NUMERIC(6,3) NOT NULL DEFAULT 0,

  paye_enabled          BOOLEAN NOT NULL DEFAULT FALSE,

  withholding_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  withholding_rate      NUMERIC(6,3) NOT NULL DEFAULT 15.0,

  effective_from        DATE NOT NULL,
  effective_to          DATE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT contract_terms_not_both_paye_and_withholding
    CHECK (NOT (paye_enabled AND withholding_enabled))
  -- A single engagement is either an employment relationship (PAYE) or a
  -- contractor/consultancy relationship (withholding tax) — never both at
  -- once for the same contract term.
);

CREATE INDEX idx_contract_terms_employee ON employee_contract_terms(employee_id);
CREATE INDEX idx_contract_terms_active ON employee_contract_terms(employee_id, is_active) WHERE is_active = TRUE;

-- ---------- Payslip columns for the components a standard full-time payslip never needed ----------

ALTER TABLE payslips ADD COLUMN contract_term_id UUID REFERENCES employee_contract_terms(id) ON DELETE SET NULL;
ALTER TABLE payslips ADD COLUMN tier2_employer NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN tier3_employee NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN tier3_employer NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN withholding_tax NUMERIC(18,4) NOT NULL DEFAULT 0;
-- ssnit_employee/ssnit_employer already exist and are reused directly for
-- Tier 1 — Tier 1 IS what SSNIT itself collects, so no new columns needed
-- there. income_tax already exists and is reused directly for PAYE.

ALTER TABLE payroll_runs ADD COLUMN total_tier2 NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN total_tier3_employee NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN total_tier3_employer NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN total_withholding NUMERIC(18,4) NOT NULL DEFAULT 0;

-- ---------- New GL accounts (Tier 1 reuses the existing SSNIT Payable account) ----------

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('2370', 'Tier 2 Pension Payable', 'liability', 'current_liability', 'credit'),
  ('2380', 'Tier 3 Provident Fund Payable', 'liability', 'current_liability', 'credit'),
  ('2390', 'Withholding Tax Payable', 'liability', 'current_liability', 'credit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.mapping_key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES ('2370', 'tier2_pension_payable'), ('2380', 'tier3_provident_fund_payable'), ('2390', 'withholding_tax_payable')) AS m(code, mapping_key)
  ON coa.account_code = m.code
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- ---------- Permissions ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_contract_terms', 'hr.contract_terms.manage', 'Define contract terms (salary, SSNIT tiers, PAYE, withholding tax) for non-full-time employees')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'hr.contract_terms.manage'
ON CONFLICT DO NOTHING;
