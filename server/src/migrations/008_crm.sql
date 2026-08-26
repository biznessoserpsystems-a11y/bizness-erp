-- ============================================================
-- Bizness-OS: CRM (first slice)
-- ============================================================
-- Fills out the "Coming soon" CRM placeholder with the pieces the existing
-- Sales module doesn't cover: a pre-customer lead pipeline, named contact
-- people (customers/leads today only have one generic email/phone), and a
-- shared activity/communication log with follow-up due dates.
--
-- A won lead converts into a real `customers` row via the app (see
-- leadController.convertToCustomer) — this migration only adds the schema.

CREATE TABLE leads (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_no             VARCHAR(50) NOT NULL,
  name                VARCHAR(255) NOT NULL,          -- contact person or deal name
  company_name        VARCHAR(255),
  email               VARCHAR(255),
  phone               VARCHAR(50),
  source              VARCHAR(100),                   -- referral, walk-in, website, cold call, etc.
  stage               VARCHAR(30) NOT NULL DEFAULT 'new', -- new, contacted, qualified, proposal, won, lost
  estimated_value     NUMERIC(18,4) DEFAULT 0,
  expected_close_date DATE,
  owner_id            UUID REFERENCES users(id) ON DELETE SET NULL, -- assigned sales rep
  notes               TEXT,
  converted_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, lead_no)
);

CREATE INDEX idx_leads_company ON leads(company_id);
CREATE INDEX idx_leads_stage ON leads(company_id, stage);

-- A contact belongs to a customer or a lead (or in principle both, e.g. once
-- a lead converts the same person becomes the customer's contact too).
CREATE TABLE contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
  first_name    VARCHAR(150) NOT NULL,
  last_name     VARCHAR(150),
  title         VARCHAR(150),                        -- job title / role
  email         VARCHAR(255),
  phone         VARCHAR(50),
  is_primary    BOOLEAN DEFAULT FALSE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT contacts_belong_to_something CHECK (customer_id IS NOT NULL OR lead_id IS NOT NULL)
);

CREATE INDEX idx_contacts_customer ON contacts(customer_id);
CREATE INDEX idx_contacts_lead ON contacts(lead_id);

-- Shared communication/activity log across customers and leads: calls,
-- emails, meetings, notes, and tasks (a task is just an activity with a
-- due_date that isn't done yet — is_done drives follow-up reminders).
CREATE TABLE crm_activities (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  related_type  VARCHAR(20) NOT NULL,                 -- customer, lead
  related_id    UUID NOT NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'note',  -- call, email, meeting, note, task
  subject       VARCHAR(255) NOT NULL,
  notes         TEXT,
  due_date      DATE,
  is_done       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crm_activities_related ON crm_activities(related_type, related_id);
CREATE INDEX idx_crm_activities_company ON crm_activities(company_id);
CREATE INDEX idx_crm_activities_followups ON crm_activities(company_id, due_date) WHERE is_done = FALSE AND due_date IS NOT NULL;

-- ---------- Seed: permissions ----------
INSERT INTO permissions (module, action, code, description) VALUES
  ('crm', 'manage_leads', 'crm.leads.manage', 'Create, edit, and convert leads'),
  ('crm', 'manage_contacts', 'crm.contacts.manage', 'Manage contact people for customers and leads'),
  ('crm', 'manage_activities', 'crm.activities.manage', 'Log calls, emails, meetings, notes, and follow-up tasks')
ON CONFLICT DO NOTHING;

-- Retrofit: grant to every existing Super Admin role (same pattern as prior migrations).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.is_system_role = TRUE
  AND p.code IN ('crm.leads.manage', 'crm.contacts.manage', 'crm.activities.manage')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Extend the notifications table for the background scanner.
-- ============================================================
-- The notificationService background scanner (added alongside CRM) writes
-- company-scoped "alert" rows that are deduplicated by dedupe_key and
-- auto-resolved when the underlying issue clears. These columns are optional
-- on the existing user-scoped notification rows, so nothing breaks.

ALTER TABLE notifications
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS severity      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS message       TEXT,
  ADD COLUMN IF NOT EXISTS related_entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS related_entity_id   UUID,
  ADD COLUMN IF NOT EXISTS dedupe_key    TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications(company_id, dedupe_key) WHERE resolved_at IS NULL;
