-- ============================================================
-- Bizness-OS: Service Business Module
--
-- Everything built so far assumes a physical-goods-shaped business
-- (trading, manufacturing, rental — all rooted in "something moves
-- through a warehouse"). Pure service businesses (consulting, repairs,
-- cleaning, IT support, professional services) don't have that shape —
-- what they sell is time and expertise, tracked against a job rather
-- than a stock movement.
--
-- Deliberately integrates with, rather than duplicates, the existing
-- Sales invoicing pipeline: each Service Catalog entry is backed by a
-- real products row (a new 'service' product_type), and "Generate
-- Invoice" on a completed job calls the exact same generateInvoice(...)
-- core function invoiceController.js already shares between the manual
-- "create invoice" endpoint and the recurring-invoice generator — so a
-- service invoice posts the identical Dr AR / Cr Revenue / Cr VAT
-- Payable entry, through code already proven this session, rather than
-- a parallel GL posting path that could drift out of sync. A service
-- product never touches stock: the only place stock gets deducted is
-- deliveryController.js's delivery flow, which service jobs never go
-- through — invoices are created directly, the same "no delivery"
-- path used for service-type manual invoices today.
--
--   - service_catalog: what's offered (name, category, pricing basis,
--     standard rate), each backed by its own products row so it can be
--     invoiced through the existing pipeline without new GL code.
--   - service_jobs: the actual engagement for a customer — status,
--     assigned employee, billing type (time & materials vs fixed
--     price), and a trace back to the invoice once billed.
--   - service_job_time_entries: billable/non-billable hours logged
--     against a job.
--   - service_job_expenses: billable/non-billable costs incurred on a
--     job (materials, mileage, subcontractor fees, etc.).
-- ============================================================

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('trading', 'raw_material', 'finished_good', 'service'));

CREATE TABLE service_catalog (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),   -- the service_type product this invoices through
  name              VARCHAR(200) NOT NULL,
  category          VARCHAR(100),
  description       TEXT,
  pricing_type      VARCHAR(20) NOT NULL DEFAULT 'hourly' CHECK (pricing_type IN ('hourly', 'fixed', 'per_unit')),
  standard_rate     NUMERIC(18,4) NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_catalog_company ON service_catalog(company_id);

CREATE TABLE service_jobs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_no                VARCHAR(30) NOT NULL,
  customer_id           UUID NOT NULL REFERENCES customers(id),
  service_catalog_id    UUID REFERENCES service_catalog(id) ON DELETE SET NULL,
  title                 VARCHAR(200) NOT NULL,
  description           TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
                          'draft', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled'
                        )),
  assigned_employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  scheduled_date        DATE,
  completion_date       DATE,
  billing_type          VARCHAR(20) NOT NULL DEFAULT 'time_and_materials' CHECK (billing_type IN ('time_and_materials', 'fixed_price')),
  fixed_price           NUMERIC(18,4),
  sales_invoice_id      UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, job_no)
);

CREATE INDEX idx_service_jobs_company ON service_jobs(company_id);
CREATE INDEX idx_service_jobs_customer ON service_jobs(customer_id);
CREATE INDEX idx_service_jobs_status ON service_jobs(company_id, status);

CREATE TABLE service_job_time_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   UUID REFERENCES employees(id) ON DELETE SET NULL,
  entry_date    DATE NOT NULL,
  hours         NUMERIC(8,2) NOT NULL CHECK (hours > 0),
  hourly_rate   NUMERIC(18,4) NOT NULL DEFAULT 0,
  billable      BOOLEAN NOT NULL DEFAULT TRUE,
  description   TEXT,
  invoiced      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_time_entries_job ON service_job_time_entries(job_id);

CREATE TABLE service_job_expenses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_date  DATE NOT NULL,
  description   VARCHAR(200) NOT NULL,
  amount        NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  billable      BOOLEAN NOT NULL DEFAULT TRUE,
  invoiced      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_expenses_job ON service_job_expenses(job_id);

-- ---------- Permissions ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('services', 'view', 'services.view', 'View the Service Business module — catalog, jobs, time entries, and expenses'),
  ('services', 'manage', 'services.manage', 'Manage the Service Catalog, Service Jobs, time entries, expenses, and generate invoices')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code IN ('services.view', 'services.manage')
ON CONFLICT DO NOTHING;
