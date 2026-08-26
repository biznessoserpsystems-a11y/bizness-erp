-- ============================================================
-- Bizness-OS: School Management — Phase 4 (Fees Management)
--
-- Deliberately built with its own dedicated GL accounts and its own
-- posting path — the same design choice Rental Services made (a new
-- Rental Income account, not routed through generic Sales invoices) —
-- rather than reusing the Sales & Distribution customer/invoice
-- pipeline the way Service Business's invoicing was. Reasoning: Sales
-- invoices are billed to a `customers` row, but a school bills a
-- specific enrolled STUDENT against a recurring termly fee structure —
-- a genuinely different shape (per-student, per-term, built from
-- reusable fee categories) that would be forced awkwardly into the
-- generic customer/product invoice model. New Fees Receivable (asset)
-- and Tuition Fee Income (revenue) accounts keep this presentation
-- distinct from ordinary trade receivables, the same reasoning that
-- gave Rental Services its own Rental Income account.
--
--   - fee_categories: reusable components (Tuition, Feeding, Transport,
--     PTA Dues, etc.) — not tied to any one class or term, since the
--     same category is used across many fee structures.
--   - fee_structures: what a class owes for a given term/year, built
--     from one or more categories each with their own amount.
--   - student_fee_invoices: the actual bill issued to one student,
--     generated from a structure — the invoice's own line items are
--     copied from the structure at generation time rather than
--     referencing it live, so a later change to the structure's
--     amounts never silently alters an invoice already issued.
--   - student_fee_payments: real payment history against an invoice,
--     supporting partial payments — a school invoice is very often
--     paid in installments across a term, not in one lump sum.
-- ============================================================

CREATE TABLE fee_categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,     -- e.g. "Tuition", "Feeding", "Transport", "PTA Dues"
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fee_categories_company ON fee_categories(company_id);

CREATE TABLE fee_structures (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,   -- e.g. "Grade 5 — Term 1 Fees"
  class_id          UUID REFERENCES classes(id) ON DELETE SET NULL,
  term              VARCHAR(30) NOT NULL,
  academic_year     VARCHAR(20) NOT NULL,
  due_date          DATE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fee_structures_company ON fee_structures(company_id);

CREATE TABLE fee_structure_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fee_structure_id    UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  fee_category_id     UUID NOT NULL REFERENCES fee_categories(id),
  amount              NUMERIC(18,4) NOT NULL CHECK (amount >= 0)
);

CREATE INDEX idx_fee_structure_items_structure ON fee_structure_items(fee_structure_id);

CREATE TABLE student_fee_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_no        VARCHAR(30) NOT NULL,
  student_id        UUID NOT NULL REFERENCES students(id),
  fee_structure_id  UUID REFERENCES fee_structures(id) ON DELETE SET NULL,
  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  total_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount_paid       NUMERIC(18,4) NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'cancelled')),
  journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, invoice_no)
);

CREATE INDEX idx_student_fee_invoices_company ON student_fee_invoices(company_id);
CREATE INDEX idx_student_fee_invoices_student ON student_fee_invoices(student_id);
CREATE INDEX idx_student_fee_invoices_status ON student_fee_invoices(company_id, status);

CREATE TABLE student_fee_invoice_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id        UUID NOT NULL REFERENCES student_fee_invoices(id) ON DELETE CASCADE,
  fee_category_id   UUID NOT NULL REFERENCES fee_categories(id),
  description       VARCHAR(200),
  amount            NUMERIC(18,4) NOT NULL CHECK (amount >= 0)
);

CREATE INDEX idx_student_fee_invoice_items_invoice ON student_fee_invoice_items(invoice_id);

CREATE TABLE student_fee_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES student_fee_invoices(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  payment_method  VARCHAR(30) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money', 'cheque', 'card')),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  reference_no    VARCHAR(100),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  recorded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_student_fee_payments_invoice ON student_fee_payments(invoice_id);

-- ---------- New GL accounts ----------

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, t.code, t.name, t.type, t.subtype, t.balance, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('1230', 'Fees Receivable', 'asset', 'current_asset', 'debit'),
  ('4210', 'Tuition Fee Income', 'revenue', 'operating_revenue', 'credit')
) AS t(code, name, type, subtype, balance)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = t.code);

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, m.mapping_key, coa.id
FROM chart_of_accounts coa
JOIN (VALUES ('1230', 'fees_receivable'), ('4210', 'tuition_fee_income')) AS m(code, mapping_key)
  ON coa.account_code = m.code
ON CONFLICT (company_id, mapping_key) DO NOTHING;

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
