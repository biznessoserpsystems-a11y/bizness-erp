-- ============================================================
-- Bizness-OS: Recurring Invoices (extends Module 07 Sales & Distribution)
-- A template holds the customer, line items, and a schedule; a background
-- check (see recurringInvoiceService.js) generates a real sales_invoice
-- through the exact same code path as a manual invoice (same GL posting,
-- currency handling, credit-limit check) whenever next_run_date is due.
-- ============================================================

CREATE TABLE recurring_invoice_templates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  template_name     VARCHAR(150) NOT NULL,
  frequency         VARCHAR(20) NOT NULL DEFAULT 'monthly', -- weekly, monthly, quarterly, annually
  start_date        DATE NOT NULL,
  next_run_date     DATE NOT NULL,
  end_date          DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'active', -- active, paused, ended
  currency          VARCHAR(3),   -- NULL = resolve customer/company default at generation time, like a manual invoice
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'annually')),
  CHECK (status IN ('active', 'paused', 'ended'))
);

CREATE TABLE recurring_invoice_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id       UUID NOT NULL REFERENCES recurring_invoice_templates(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  description       TEXT,
  quantity          NUMERIC(18,4) NOT NULL,
  unit_price        NUMERIC(18,4) NOT NULL,
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  tax_percent       NUMERIC(5,2) DEFAULT 0
);

-- Trace which invoices were auto-generated from which template, and let the
-- generator find "was this cycle already invoiced?" without guessing off dates.
ALTER TABLE sales_invoices ADD COLUMN recurring_template_id UUID REFERENCES recurring_invoice_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_recurring_templates_company ON recurring_invoice_templates(company_id);
CREATE INDEX idx_recurring_templates_due ON recurring_invoice_templates(next_run_date) WHERE status = 'active';
CREATE INDEX idx_recurring_lines_template ON recurring_invoice_lines(template_id);

-- ---------- Seed: permission for Module 07 ----------
INSERT INTO permissions (module, action, code, description) VALUES
  ('sales', 'manage_recurring_invoices', 'sales.recurring_invoices.manage', 'Create/manage recurring invoice templates')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'sales.recurring_invoices.manage'
ON CONFLICT DO NOTHING;
