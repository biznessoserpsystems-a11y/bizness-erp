-- ================================================================
-- Bizness-OS: Recruitment & Hiring
--
-- job_postings: openings a company is hiring for.
-- candidates: applicants, optionally tied to a posting, moving through
--   a fixed pipeline (applied -> screening -> interview -> offer ->
--   hired/rejected).
-- candidate_interviews: interview rounds per candidate — kept as its
--   own lightweight table rather than folded into calendar_events,
--   since interviews need outcome/rating fields a generic calendar
--   event doesn't have. Scheduling the actual meeting on the shared
--   Calendar is a natural follow-up integration, not done here.
--
-- Hiring a candidate (POST /candidates/:id/hire) creates a real
-- employee row via the same insert path as createEmployee and links
-- back via candidates.converted_employee_id — the candidate record
-- stays as a permanent hiring-history artifact rather than being
-- deleted.
--
-- Access: everything here is gated to hr.recruitment.manage,
-- including reads — candidate PII (contact info, resumes, interview
-- feedback) is sensitive, so unlike employees' historically-open
-- read access, this module is gated from the start.
-- ================================================================

CREATE TABLE job_postings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                 VARCHAR(200) NOT NULL,
  department            VARCHAR(150),
  description           TEXT,
  employment_type       VARCHAR(20) NOT NULL DEFAULT 'full_time',
  positions_available   INTEGER NOT NULL DEFAULT 1,
  status                VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'on_hold', 'closed')),
  target_hire_date      DATE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_postings_company ON job_postings(company_id, status);

CREATE TABLE candidates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_posting_id        UUID REFERENCES job_postings(id) ON DELETE SET NULL,
  first_name            VARCHAR(150) NOT NULL,
  last_name             VARCHAR(150) NOT NULL,
  email                 VARCHAR(255),
  phone                 VARCHAR(50),
  source                VARCHAR(30) DEFAULT 'other' CHECK (source IN ('referral', 'job_board', 'direct', 'agency', 'other')),
  stage                 VARCHAR(20) NOT NULL DEFAULT 'applied'
                          CHECK (stage IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  expected_salary       NUMERIC(18,4),
  rejected_reason       TEXT,
  notes                 TEXT,
  applied_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  converted_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidates_company_stage ON candidates(company_id, stage);
CREATE INDEX idx_candidates_job_posting ON candidates(job_posting_id);

CREATE TABLE candidate_interviews (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_id      UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  round_name        VARCHAR(100) NOT NULL,
  scheduled_at      TIMESTAMPTZ,
  interviewer_notes TEXT,
  outcome           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'pass', 'fail')),
  rating            INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidate_interviews_candidate ON candidate_interviews(candidate_id, scheduled_at);

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_recruitment', 'hr.recruitment.manage', 'Manage job postings, candidates, interviews, and hiring')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'hr.recruitment.manage'
ON CONFLICT DO NOTHING;

-- Let candidates hold attachments (resumes/CVs, cover letters).
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_related_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_related_type_check
  CHECK (related_type IN (
    'task', 'calendar_event', 'invoice', 'purchase_order', 'customer', 'supplier', 'employee', 'candidate'
  ));
