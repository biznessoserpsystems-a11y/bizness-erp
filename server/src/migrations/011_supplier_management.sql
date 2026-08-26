-- ================================================================
-- Supplier Management module: groups, contacts, communication log,
-- and credit-limit enforcement (the buy-side mirror of the customer
-- credit limit that already exists on Sales).
-- ================================================================

-- ---------- Supplier Groups ----------
-- A simple segmentation layer (e.g. "Local FMCG", "Imports", "Raw Materials")
-- used for reporting/filtering, same idea as customer groups on the CRM side.

CREATE TABLE supplier_groups (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE INDEX idx_supplier_groups_company ON supplier_groups(company_id);

-- ---------- Suppliers: credit limit + group ----------

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(18,4) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_group_id UUID REFERENCES supplier_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_suppliers_group ON suppliers(supplier_group_id);

-- ---------- Supplier Contacts ----------
-- A supplier can have several people (sales rep, accounts, logistics...).
-- The single email/phone on the supplier row itself remains the "main line".

CREATE TABLE supplier_contacts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  job_title         VARCHAR(150),
  email             VARCHAR(255),
  phone             VARCHAR(50),
  is_primary        BOOLEAN DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_contacts_supplier ON supplier_contacts(supplier_id);

-- ---------- Supplier Communication Log ----------
-- Freeform history of calls/emails/meetings/site visits, so the relationship
-- doesn't live only in someone's inbox.

CREATE TABLE supplier_communications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  contact_id        UUID REFERENCES supplier_contacts(id) ON DELETE SET NULL,
  channel           VARCHAR(20) NOT NULL DEFAULT 'note', -- call, email, meeting, site_visit, note
  subject           VARCHAR(255) NOT NULL,
  notes             TEXT,
  contact_date      DATE DEFAULT CURRENT_DATE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_communications_supplier ON supplier_communications(supplier_id, contact_date DESC);

-- No new permission codes: contacts, communications, groups and the credit
-- limit field are all managed under the existing 'procurement.suppliers.manage'
-- permission, since they're all facets of the same supplier record.
