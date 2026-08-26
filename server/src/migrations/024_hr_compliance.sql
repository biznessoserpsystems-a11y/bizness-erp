-- ================================================================
-- Bizness-OS: HR Compliance
--
-- compliance_documents: statutory/regulatory documents (work permits,
-- professional licenses, SSNIT registration, background checks,
-- business licenses). employee_id is nullable — some compliance
-- documents are company-wide (e.g. a business operating license),
-- not tied to a person. expiry status (expiring soon / expired) is
-- deliberately NOT a stored column — it's computed at query time
-- against CURRENT_DATE so it's never stale. The stored `status`
-- column instead tracks a manual workflow state (active vs
-- pending_renewal vs revoked), which is a human decision, not a date
-- calculation. Actual document scans attach through the existing
-- generic attachments module (added 'compliance_document' below).
--
-- company_policies / policy_acknowledgments: the handbook/code-of-
-- conduct acknowledgment trail. Acknowledging a policy needs no
-- permission (same "manage your own" idiom as everywhere else in
-- this module) — you can only acknowledge for yourself.
--
-- compliance_incidents: grievances, disciplinary actions, safety
-- incidents, harassment complaints. Unlike compliance documents and
-- policy acknowledgments, this is NOT open self-service — even
-- viewing requires hr.compliance.manage OR being the employee the
-- incident is about (transparency for the person it concerns), never
-- open browsing of other people's records. Creating, investigating,
-- and resolving incidents always requires hr.compliance.manage.
-- ================================================================

CREATE TABLE compliance_documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id       UUID REFERENCES employees(id) ON DELETE CASCADE,
  document_type     VARCHAR(50) NOT NULL CHECK (document_type IN (
                      'work_permit', 'professional_license', 'ssnit_certificate',
                      'background_check', 'drug_test', 'business_license', 'other'
                    )),
  document_name     VARCHAR(200) NOT NULL,
  issuing_authority VARCHAR(150),
  issue_date        DATE,
  expiry_date       DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_renewal', 'revoked')),
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_documents_company ON compliance_documents(company_id, employee_id);
CREATE INDEX idx_compliance_documents_expiry ON compliance_documents(company_id, expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE company_policies (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                    VARCHAR(200) NOT NULL,
  description             TEXT,
  version                 VARCHAR(20) NOT NULL DEFAULT '1.0',
  effective_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  requires_acknowledgment BOOLEAN NOT NULL DEFAULT TRUE,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_policies_company ON company_policies(company_id, is_active);

CREATE TABLE policy_acknowledgments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id       UUID NOT NULL REFERENCES company_policies(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(policy_id, employee_id)
);

CREATE INDEX idx_policy_acknowledgments_employee ON policy_acknowledgments(company_id, employee_id);

CREATE TABLE compliance_incidents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id       UUID REFERENCES employees(id) ON DELETE CASCADE,
  incident_type     VARCHAR(30) NOT NULL CHECK (incident_type IN (
                      'grievance', 'disciplinary', 'safety_incident', 'harassment_complaint', 'other'
                    )),
  severity          VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  description       TEXT NOT NULL,
  incident_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  reported_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  resolution_notes  TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_incidents_employee ON compliance_incidents(company_id, employee_id);
CREATE INDEX idx_compliance_incidents_status ON compliance_incidents(company_id, status);

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_compliance', 'hr.compliance.manage', 'Manage compliance documents, company policies, and incidents/grievances for anyone')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'hr.compliance.manage'
ON CONFLICT DO NOTHING;

-- Let compliance documents hold attachments (the actual permit/license scan).
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_related_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_related_type_check
  CHECK (related_type IN (
    'task', 'calendar_event', 'invoice', 'purchase_order', 'customer', 'supplier',
    'employee', 'candidate', 'compliance_document'
  ));
