-- ============================================================
-- Bizness-OS: Compliance Register (Executive Dashboard)
--
-- The Executive Dashboard spec calls for ten compliance items. Four of
-- them are real GL balances this system already tracks — SSNIT Payable
-- and PAYE Payable (gl_account_mappings, seeded by 010_payroll_gl_and_rates.sql)
-- and Input/Output VAT (already computed by tax-reports/vat-summary) — the
-- dashboard reads those live, nothing new to store.
--
-- The other six have no data source anywhere in this system: Withholding
-- Tax, VAT Withholding, Tax Clearance Certificate (collected/receivable),
-- EPA permit, and Business Operating Permit are all externally-issued
-- certificates/registrations with a status and an expiry date, not a
-- number the GL can compute. compliance_items is a genuine, editable
-- tracker for these — not a mock display — seeded with one row per type
-- for every existing company so the dashboard has something real to show
-- immediately, defaulting to 'unknown' status until someone records the
-- actual state.
-- ============================================================

CREATE TABLE compliance_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_type         VARCHAR(40) NOT NULL,   -- see CHECK below
  label             VARCHAR(150) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'unknown', -- unknown, valid, expiring_soon, expired, not_applicable
  reference_no      VARCHAR(100),
  expiry_date       DATE,
  notes             TEXT,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, item_type),
  CONSTRAINT compliance_items_type_check CHECK (item_type IN (
    'wht', 'vat_wht', 'tcc_collected', 'tcc_receivable', 'epa', 'business_operating_permit'
  )),
  CONSTRAINT compliance_items_status_check CHECK (status IN (
    'unknown', 'valid', 'expiring_soon', 'expired', 'not_applicable'
  ))
);

CREATE INDEX idx_compliance_items_company ON compliance_items(company_id);

INSERT INTO compliance_items (company_id, item_type, label)
SELECT c.id, t.item_type, t.label
FROM companies c
CROSS JOIN (VALUES
  ('wht', 'Withholding Tax (WHT)'),
  ('vat_wht', 'VAT Withholding'),
  ('tcc_collected', 'Tax Clearance Certificate — Collected'),
  ('tcc_receivable', 'Tax Clearance Certificate — Receivable'),
  ('epa', 'EPA Permit'),
  ('business_operating_permit', 'Business Operating Permit')
) AS t(item_type, label)
ON CONFLICT (company_id, item_type) DO NOTHING;

INSERT INTO permissions (module, action, code, description) VALUES
  ('system', 'manage_compliance', 'system.compliance.manage', 'View and update the statutory compliance register (WHT, TCC, EPA, business permits)')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'system.compliance.manage'
ON CONFLICT DO NOTHING;
