-- ============================================================
-- Bizness-OS: Business Continuity Monitoring
--
-- Four linked pieces, the standard structure of a real business
-- continuity programme:
--   1. Risk Register — what could disrupt the business, how likely and
--      how severe, and what's being done about it.
--   2. Business Impact Analysis — which functions are actually critical
--      to keep running, how long they can tolerate being down (RTO) and
--      how much data loss they can tolerate (RPO), and what they depend on.
--   3. Continuity Plans — the documented response for a given scenario,
--      optionally tied to a specific risk, with a real testing cadence
--      rather than a plan written once and never revisited.
--   4. Incident Log — what actually happened, distinct from HR's
--      disciplinary/incident tracking (that's about people; this is
--      about business disruptions — a power outage, a key system down,
--      a critical supplier failing to deliver).
--
-- Deliberately integrates with, rather than duplicates, two things this
-- system already tracks: the existing backup_logs table (036) already
-- has real backup/restore history — a genuine continuity signal (when
-- was the last successful backup?) — and compliance_items (037) already
-- tracks statutory/regulatory status, itself a continuity risk category.
-- The BCM workspace surfaces both directly rather than re-recording them.
-- ============================================================

CREATE TABLE bcm_risks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category          VARCHAR(30) NOT NULL CHECK (category IN (
                      'operational', 'financial', 'technology', 'supply_chain',
                      'regulatory', 'human_resources', 'natural_disaster', 'reputational', 'other'
                    )),
  title             VARCHAR(200) NOT NULL,
  description       TEXT,
  likelihood        INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),   -- 1 = rare, 5 = almost certain
  impact            INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),      -- 1 = negligible, 5 = severe
  risk_score        INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED,
  status            VARCHAR(20) NOT NULL DEFAULT 'identified' CHECK (status IN (
                      'identified', 'monitoring', 'mitigating', 'resolved', 'accepted'
                    )),
  owner_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  mitigation_plan   TEXT,
  review_date       DATE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bcm_risks_company ON bcm_risks(company_id);
CREATE INDEX idx_bcm_risks_score ON bcm_risks(company_id, risk_score DESC);

CREATE TABLE bcm_critical_functions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  function_name       VARCHAR(200) NOT NULL,
  department          VARCHAR(150),
  rto_hours           NUMERIC(8,2) NOT NULL,   -- Recovery Time Objective: max tolerable downtime
  rpo_hours           NUMERIC(8,2) NOT NULL,   -- Recovery Point Objective: max tolerable data loss window
  impact_if_disrupted TEXT,
  key_dependencies    TEXT,                     -- staff, systems, suppliers this function relies on
  backup_plan         TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bcm_critical_functions_company ON bcm_critical_functions(company_id);

CREATE TABLE bcm_continuity_plans (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  risk_id             UUID REFERENCES bcm_risks(id) ON DELETE SET NULL,   -- optional: a plan can address a specific risk
  plan_name           VARCHAR(200) NOT NULL,
  scenario            TEXT NOT NULL,            -- what triggers this plan
  action_steps        TEXT NOT NULL,
  responsible_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'needs_review')),
  last_tested_date    DATE,
  next_test_due       DATE,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bcm_plans_company ON bcm_continuity_plans(company_id);
CREATE INDEX idx_bcm_plans_risk ON bcm_continuity_plans(risk_id);

CREATE TABLE bcm_incidents (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  risk_id             UUID REFERENCES bcm_risks(id) ON DELETE SET NULL,   -- optional: link to a known risk that materialised
  incident_date       DATE NOT NULL,
  category            VARCHAR(30) NOT NULL CHECK (category IN (
                        'operational', 'financial', 'technology', 'supply_chain',
                        'regulatory', 'human_resources', 'natural_disaster', 'reputational', 'other'
                      )),
  title               VARCHAR(200) NOT NULL,
  description          TEXT,
  severity             VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  impact_duration_hours NUMERIC(8,2),
  response_taken       TEXT,
  is_resolved          BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_date        DATE,
  lessons_learned      TEXT,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bcm_incidents_company ON bcm_incidents(company_id);
CREATE INDEX idx_bcm_incidents_date ON bcm_incidents(company_id, incident_date DESC);

-- ---------- Permissions ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('bcm', 'view', 'bcm.view', 'View Business Continuity Monitoring — risks, BIA, plans, and incidents'),
  ('bcm', 'manage', 'bcm.manage', 'Manage the Risk Register, Business Impact Analysis, Continuity Plans, and Incident Log')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code IN ('bcm.view', 'bcm.manage')
ON CONFLICT DO NOTHING;
