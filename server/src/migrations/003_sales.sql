-- ============================================================
-- Bizness-OS: Module 07 — Sales & Distribution
-- (Includes a minimal Customer entity — full CRM module comes later,
--  but Sales can't function without a customer record to sell to.)
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_vat_rate NUMERIC(5,2) DEFAULT 15.00;

-- ---------- Minimal Customer (subset of future Module 03 CRM) ----------

CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_code     VARCHAR(50) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255),
  phone             VARCHAR(50),
  address           TEXT,
  city              VARCHAR(100),
  region            VARCHAR(100),
  tin               VARCHAR(50),
  credit_limit      NUMERIC(18,4) DEFAULT 0,      -- 0 = no credit extended, cash only
  payment_terms_days INT DEFAULT 0,                -- 0 = due on receipt
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, customer_code)
);

-- ---------- Quotations ----------

CREATE TABLE quotations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  quotation_no      VARCHAR(50) NOT NULL,
  quotation_date    DATE DEFAULT CURRENT_DATE,
  valid_until       DATE,
  status            VARCHAR(20) DEFAULT 'draft', -- draft, sent, accepted, rejected, expired, converted
  subtotal          NUMERIC(18,4) DEFAULT 0,
  discount_amount   NUMERIC(18,4) DEFAULT 0,
  tax_amount        NUMERIC(18,4) DEFAULT 0,
  total_amount      NUMERIC(18,4) DEFAULT 0,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, quotation_no)
);

CREATE TABLE quotation_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id      UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  description       TEXT,
  quantity          NUMERIC(18,4) NOT NULL,
  unit_price        NUMERIC(18,4) NOT NULL,
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  tax_percent       NUMERIC(5,2) DEFAULT 0,
  line_total        NUMERIC(18,4) NOT NULL
);

-- ---------- Sales Orders ----------

CREATE TABLE sales_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  quotation_id      UUID REFERENCES quotations(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  order_no          VARCHAR(50) NOT NULL,
  order_date        DATE DEFAULT CURRENT_DATE,
  status            VARCHAR(30) DEFAULT 'pending', -- pending, confirmed, partially_delivered, delivered, invoiced, cancelled
  subtotal          NUMERIC(18,4) DEFAULT 0,
  discount_amount   NUMERIC(18,4) DEFAULT 0,
  tax_amount        NUMERIC(18,4) DEFAULT 0,
  total_amount      NUMERIC(18,4) DEFAULT 0,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, order_no)
);

CREATE TABLE sales_order_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sales_order_id    UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  description       TEXT,
  quantity          NUMERIC(18,4) NOT NULL,
  delivered_quantity NUMERIC(18,4) DEFAULT 0,
  invoiced_quantity NUMERIC(18,4) DEFAULT 0,
  unit_price        NUMERIC(18,4) NOT NULL,
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  tax_percent       NUMERIC(5,2) DEFAULT 0,
  line_total        NUMERIC(18,4) NOT NULL
);

-- ---------- Delivery Notes (dispatch triggers stock-out) ----------

CREATE TABLE delivery_notes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  sales_order_id    UUID REFERENCES sales_orders(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  delivery_no       VARCHAR(50) NOT NULL,
  delivery_date     DATE DEFAULT CURRENT_DATE,
  status            VARCHAR(20) DEFAULT 'dispatched', -- dispatched, delivered, cancelled
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, delivery_no)
);

CREATE TABLE delivery_note_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_note_id  UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  sales_order_line_id UUID REFERENCES sales_order_lines(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          NUMERIC(18,4) NOT NULL,
  batch_id          UUID REFERENCES stock_batches(id)
);

-- ---------- Sales Invoices ----------

CREATE TABLE sales_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  sales_order_id    UUID REFERENCES sales_orders(id),
  invoice_no        VARCHAR(50) NOT NULL,
  invoice_date      DATE DEFAULT CURRENT_DATE,
  due_date          DATE,
  status            VARCHAR(20) DEFAULT 'issued', -- draft, issued, partially_paid, paid, overdue, void
  subtotal          NUMERIC(18,4) DEFAULT 0,
  discount_amount   NUMERIC(18,4) DEFAULT 0,
  tax_amount        NUMERIC(18,4) DEFAULT 0,
  total_amount      NUMERIC(18,4) DEFAULT 0,
  amount_paid       NUMERIC(18,4) DEFAULT 0,
  amount_credited   NUMERIC(18,4) DEFAULT 0,   -- reduced by applied credit notes
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, invoice_no)
);

CREATE TABLE sales_invoice_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sales_invoice_id  UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  sales_order_line_id UUID REFERENCES sales_order_lines(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  description       TEXT,
  quantity          NUMERIC(18,4) NOT NULL,
  unit_price        NUMERIC(18,4) NOT NULL,
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  tax_percent       NUMERIC(5,2) DEFAULT 0,
  line_total        NUMERIC(18,4) NOT NULL
);

-- ---------- Customer Payments / Receipts ----------

CREATE TABLE customer_payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  payment_no        VARCHAR(50) NOT NULL,
  payment_date      DATE DEFAULT CURRENT_DATE,
  amount            NUMERIC(18,4) NOT NULL,
  unallocated_amount NUMERIC(18,4) NOT NULL,   -- portion not yet applied to an invoice
  payment_method    VARCHAR(30) NOT NULL,       -- cash, bank_transfer, mobile_money, cheque, card
  reference         VARCHAR(150),
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, payment_no)
);

CREATE TABLE payment_allocations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id        UUID NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
  sales_invoice_id  UUID NOT NULL REFERENCES sales_invoices(id),
  amount_allocated  NUMERIC(18,4) NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Sales Returns & Credit Notes ----------

CREATE TABLE sales_returns (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  sales_invoice_id  UUID REFERENCES sales_invoices(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  return_no         VARCHAR(50) NOT NULL,
  return_date       DATE DEFAULT CURRENT_DATE,
  status            VARCHAR(20) DEFAULT 'completed', -- completed, cancelled
  reason            TEXT,
  subtotal          NUMERIC(18,4) DEFAULT 0,
  tax_amount        NUMERIC(18,4) DEFAULT 0,
  total_amount      NUMERIC(18,4) DEFAULT 0,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, return_no)
);

CREATE TABLE sales_return_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sales_return_id   UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          NUMERIC(18,4) NOT NULL,
  unit_price        NUMERIC(18,4) NOT NULL,
  tax_percent       NUMERIC(5,2) DEFAULT 0,
  line_total        NUMERIC(18,4) NOT NULL
);

CREATE TABLE credit_notes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  sales_return_id   UUID REFERENCES sales_returns(id),
  sales_invoice_id  UUID REFERENCES sales_invoices(id),
  credit_note_no    VARCHAR(50) NOT NULL,
  credit_note_date  DATE DEFAULT CURRENT_DATE,
  amount            NUMERIC(18,4) NOT NULL,
  unapplied_amount  NUMERIC(18,4) NOT NULL,
  status            VARCHAR(20) DEFAULT 'open', -- open, applied
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, credit_note_no)
);

-- ---------- Indexes ----------
CREATE INDEX idx_customers_company ON customers(company_id);
CREATE INDEX idx_quotations_company ON quotations(company_id);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_sales_orders_company ON sales_orders(company_id);
CREATE INDEX idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX idx_sales_invoices_company ON sales_invoices(company_id);
CREATE INDEX idx_sales_invoices_customer ON sales_invoices(customer_id);
CREATE INDEX idx_sales_invoices_status ON sales_invoices(status);
CREATE INDEX idx_delivery_notes_company ON delivery_notes(company_id);
CREATE INDEX idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX idx_sales_returns_company ON sales_returns(company_id);
CREATE INDEX idx_credit_notes_customer ON credit_notes(customer_id);

-- ---------- Seed: additional permissions for Module 07 ----------
INSERT INTO permissions (module, action, code, description) VALUES
  ('sales', 'manage_customers', 'sales.customers.manage', 'Create/edit customer records'),
  ('sales', 'manage_quotations', 'sales.quotations.manage', 'Create/edit/send quotations'),
  ('sales', 'manage_orders', 'sales.orders.manage', 'Create/edit/confirm sales orders'),
  ('sales', 'manage_deliveries', 'sales.deliveries.manage', 'Dispatch delivery notes (reduces stock)'),
  ('sales', 'manage_invoices', 'sales.invoices.manage', 'Create/issue sales invoices'),
  ('sales', 'manage_payments', 'sales.payments.manage', 'Record customer payments and allocations'),
  ('sales', 'manage_returns', 'sales.returns.manage', 'Process sales returns and credit notes'),
  ('sales', 'view_reports', 'sales.reports.view', 'View sales reports and receivables aging')
ON CONFLICT DO NOTHING;

-- Grant all new sales permissions to every existing Super Admin role automatically.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'sales'
ON CONFLICT DO NOTHING;
