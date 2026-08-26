-- ============================================================
-- Bizness-OS: Module 06 — Procurement & Purchasing
-- (Includes a minimal Supplier entity — full Supplier Management module
--  comes later, but Procurement can't function without one to buy from.)
-- ============================================================

-- ---------- Minimal Supplier (subset of future Module 04) ----------

CREATE TABLE suppliers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_code     VARCHAR(50) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255),
  phone             VARCHAR(50),
  address           TEXT,
  city              VARCHAR(100),
  region            VARCHAR(100),
  tin               VARCHAR(50),
  credit_limit      NUMERIC(18,4) DEFAULT 0,
  payment_terms_days INT DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, supplier_code)
);

-- ---------- Purchase Requisitions ----------

CREATE TABLE purchase_requisitions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  requisition_no    VARCHAR(50) NOT NULL,
  status            VARCHAR(20) DEFAULT 'submitted', -- draft, submitted, approved, rejected, converted
  notes             TEXT,
  requested_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, requisition_no)
);

CREATE TABLE purchase_requisition_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id    UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          NUMERIC(18,4) NOT NULL,
  notes             TEXT
);

-- ---------- Request for Quotation (RFQ) ----------

CREATE TABLE rfqs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requisition_id    UUID REFERENCES purchase_requisitions(id),
  rfq_no            VARCHAR(50) NOT NULL,
  status            VARCHAR(20) DEFAULT 'draft', -- draft, sent, closed
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, rfq_no)
);

CREATE TABLE rfq_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id            UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          NUMERIC(18,4) NOT NULL
);

CREATE TABLE rfq_suppliers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id            UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  status            VARCHAR(20) DEFAULT 'invited', -- invited, responded, declined
  UNIQUE(rfq_id, supplier_id)
);

-- ---------- Supplier Quotations (responses to an RFQ) ----------

CREATE TABLE supplier_quotations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rfq_id            UUID NOT NULL REFERENCES rfqs(id),
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  quotation_no      VARCHAR(50) NOT NULL,
  quotation_date    DATE DEFAULT CURRENT_DATE,
  status            VARCHAR(20) DEFAULT 'received', -- received, selected, rejected
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, quotation_no)
);

CREATE TABLE supplier_quotation_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_quotation_id UUID NOT NULL REFERENCES supplier_quotations(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          NUMERIC(18,4) NOT NULL,
  unit_price        NUMERIC(18,4) NOT NULL,
  lead_time_days    INT DEFAULT 0
);

-- ---------- Purchase Orders ----------

CREATE TABLE purchase_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  requisition_id    UUID REFERENCES purchase_requisitions(id),
  supplier_quotation_id UUID REFERENCES supplier_quotations(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  order_no          VARCHAR(50) NOT NULL,
  order_date        DATE DEFAULT CURRENT_DATE,
  expected_date     DATE,
  status            VARCHAR(30) DEFAULT 'pending', -- pending, confirmed, partially_received, received, invoiced, cancelled
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

CREATE TABLE purchase_order_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  description       TEXT,
  quantity          NUMERIC(18,4) NOT NULL,
  received_quantity NUMERIC(18,4) DEFAULT 0,
  invoiced_quantity NUMERIC(18,4) DEFAULT 0,
  unit_price        NUMERIC(18,4) NOT NULL,
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  tax_percent       NUMERIC(5,2) DEFAULT 0,
  line_total        NUMERIC(18,4) NOT NULL
);

-- ---------- Goods Received Notes (receipt triggers stock-in) ----------

CREATE TABLE goods_received_notes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  grn_no            VARCHAR(50) NOT NULL,
  received_date     DATE DEFAULT CURRENT_DATE,
  status            VARCHAR(20) DEFAULT 'completed', -- completed, cancelled
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, grn_no)
);

CREATE TABLE grn_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grn_id            UUID NOT NULL REFERENCES goods_received_notes(id) ON DELETE CASCADE,
  purchase_order_line_id UUID REFERENCES purchase_order_lines(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          NUMERIC(18,4) NOT NULL,
  unit_cost         NUMERIC(18,4) NOT NULL,
  batch_id          UUID REFERENCES stock_batches(id)
);

-- ---------- Purchase Invoices ----------

CREATE TABLE purchase_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  invoice_no        VARCHAR(50) NOT NULL,          -- our internal reference number
  supplier_invoice_no VARCHAR(100),                 -- the supplier's own invoice/reference number
  invoice_date      DATE DEFAULT CURRENT_DATE,
  due_date          DATE,
  status            VARCHAR(20) DEFAULT 'issued', -- draft, issued, partially_paid, paid, void
  subtotal          NUMERIC(18,4) DEFAULT 0,
  discount_amount   NUMERIC(18,4) DEFAULT 0,
  tax_amount        NUMERIC(18,4) DEFAULT 0,
  total_amount      NUMERIC(18,4) DEFAULT 0,
  amount_paid       NUMERIC(18,4) DEFAULT 0,
  amount_credited   NUMERIC(18,4) DEFAULT 0,   -- reduced by applied debit notes
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, invoice_no)
);

CREATE TABLE purchase_invoice_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  purchase_order_line_id UUID REFERENCES purchase_order_lines(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  description       TEXT,
  quantity          NUMERIC(18,4) NOT NULL,
  unit_price        NUMERIC(18,4) NOT NULL,
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  tax_percent       NUMERIC(5,2) DEFAULT 0,
  line_total        NUMERIC(18,4) NOT NULL
);

-- ---------- Supplier Payments ----------

CREATE TABLE supplier_payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  payment_no        VARCHAR(50) NOT NULL,
  payment_date      DATE DEFAULT CURRENT_DATE,
  amount            NUMERIC(18,4) NOT NULL,
  unallocated_amount NUMERIC(18,4) NOT NULL,
  payment_method    VARCHAR(30) NOT NULL, -- cash, bank_transfer, mobile_money, cheque, card
  reference         VARCHAR(150),
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, payment_no)
);

CREATE TABLE supplier_payment_allocations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id        UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id),
  amount_allocated  NUMERIC(18,4) NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Purchase Returns & Debit Notes ----------

CREATE TABLE purchase_returns (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  purchase_invoice_id UUID REFERENCES purchase_invoices(id),
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

CREATE TABLE purchase_return_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          NUMERIC(18,4) NOT NULL,
  unit_price        NUMERIC(18,4) NOT NULL,
  tax_percent       NUMERIC(5,2) DEFAULT 0,
  line_total        NUMERIC(18,4) NOT NULL
);

CREATE TABLE debit_notes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  purchase_return_id UUID REFERENCES purchase_returns(id),
  purchase_invoice_id UUID REFERENCES purchase_invoices(id),
  debit_note_no     VARCHAR(50) NOT NULL,
  debit_note_date   DATE DEFAULT CURRENT_DATE,
  amount            NUMERIC(18,4) NOT NULL,
  unapplied_amount  NUMERIC(18,4) NOT NULL,
  status            VARCHAR(20) DEFAULT 'open', -- open, applied
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, debit_note_no)
);

-- ---------- Procurement Contracts (simple register, not deeply integrated yet) ----------

CREATE TABLE procurement_contracts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  contract_no       VARCHAR(50) NOT NULL,
  title             VARCHAR(255) NOT NULL,
  start_date        DATE,
  end_date          DATE,
  contract_value    NUMERIC(18,4),
  status            VARCHAR(20) DEFAULT 'active', -- active, expired, terminated
  terms             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, contract_no)
);

-- ---------- Indexes ----------
CREATE INDEX idx_suppliers_company ON suppliers(company_id);
CREATE INDEX idx_requisitions_company ON purchase_requisitions(company_id);
CREATE INDEX idx_rfqs_company ON rfqs(company_id);
CREATE INDEX idx_supplier_quotations_rfq ON supplier_quotations(rfq_id);
CREATE INDEX idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_grn_company ON goods_received_notes(company_id);
CREATE INDEX idx_purchase_invoices_company ON purchase_invoices(company_id);
CREATE INDEX idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX idx_purchase_invoices_status ON purchase_invoices(status);
CREATE INDEX idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX idx_purchase_returns_company ON purchase_returns(company_id);
CREATE INDEX idx_debit_notes_supplier ON debit_notes(supplier_id);
CREATE INDEX idx_procurement_contracts_supplier ON procurement_contracts(supplier_id);

-- ---------- Seed: additional permissions for Module 06 ----------
INSERT INTO permissions (module, action, code, description) VALUES
  ('procurement', 'manage_suppliers', 'procurement.suppliers.manage', 'Create/edit supplier records'),
  ('procurement', 'manage_requisitions', 'procurement.requisitions.manage', 'Create/approve purchase requisitions'),
  ('procurement', 'manage_rfq', 'procurement.rfq.manage', 'Create RFQs and record supplier quotations'),
  ('procurement', 'manage_orders', 'procurement.orders.manage', 'Create/edit/confirm purchase orders'),
  ('procurement', 'manage_receiving', 'procurement.receiving.manage', 'Record goods received notes (increases stock)'),
  ('procurement', 'manage_invoices', 'procurement.invoices.manage', 'Record supplier invoices'),
  ('procurement', 'manage_payments', 'procurement.payments.manage', 'Record supplier payments and allocations'),
  ('procurement', 'manage_returns', 'procurement.returns.manage', 'Process purchase returns and debit notes'),
  ('procurement', 'manage_contracts', 'procurement.contracts.manage', 'Manage procurement contracts'),
  ('procurement', 'view_reports', 'procurement.reports.view', 'View procurement reports and payables aging')
ON CONFLICT DO NOTHING;

-- Grant all new procurement permissions to every existing Super Admin role automatically.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'procurement'
ON CONFLICT DO NOTHING;

-- ---------- Input VAT account + mapping (for purchase-invoice AP auto-posting) ----------
-- Only for companies that already have a chart of accounts (i.e. the accounting module
-- has been set up). New companies get this via seedDefaultChartOfAccounts at registration.
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
SELECT c.id, '1300', 'Input VAT Recoverable', 'asset', 'current_asset', 'debit', TRUE
FROM companies c
WHERE EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.account_code = '1300')
ON CONFLICT DO NOTHING;

INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
SELECT coa.company_id, 'vat_input', coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '1300'
ON CONFLICT (company_id, mapping_key) DO NOTHING;
