-- ================================================================
-- Bizness-OS: Learning & Development
--
-- Four tables cover all ten requested capabilities — several of them
-- are really the same data viewed differently, not separate systems:
--   - Course Management            -> training_courses
--   - Internal / External Training -> training_courses.delivery_type
--   - Training Calendar            -> training_sessions (scheduled
--                                     instances of a course)
--   - Employee Enrollment          -> training_enrollments
--   - Training Evaluation          -> training_enrollments.evaluation_*
--   - Certification Tracking       -> training_enrollments.certificate_*
--   - Learning History             -> a query over training_enrollments
--                                     for one employee, not a new table
--   - Training Costs               -> training_courses.cost_per_participant
--                                     (budgeted) vs training_sessions.actual_cost
--   - Training Needs Assessment    -> training_needs
--
-- Access: viewing the course catalog and calendar is open to any
-- authenticated user (like the leave-type catalog) — nothing
-- sensitive there. Managing courses/sessions/needs and recording
-- evaluations or certifications requires hr.training.manage. An
-- employee can self-enroll in a scheduled session (same "manage your
-- own" idiom as tasks/calendar/attendance) and can always see their
-- own learning history; hr.training.manage is required to see or
-- manage anyone else's.
-- ================================================================

CREATE TABLE training_courses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                 VARCHAR(200) NOT NULL,
  description           TEXT,
  category              VARCHAR(50),
  delivery_type         VARCHAR(20) NOT NULL DEFAULT 'internal' CHECK (delivery_type IN ('internal', 'external')),
  provider              VARCHAR(150),
  duration_hours        NUMERIC(6,2),
  cost_per_participant  NUMERIC(18,4) NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_training_courses_company ON training_courses(company_id, is_active);

CREATE TABLE training_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  location      VARCHAR(150),
  instructor    VARCHAR(150),
  capacity      INTEGER,
  status        VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  actual_cost   NUMERIC(18,4),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_training_sessions_company_starts ON training_sessions(company_id, starts_at);
CREATE INDEX idx_training_sessions_course ON training_sessions(course_id);

CREATE TABLE training_enrollments (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id              UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status                  VARCHAR(20) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'attended', 'no_show', 'cancelled')),
  completion_status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (completion_status IN ('pending', 'passed', 'failed', 'not_applicable')),
  evaluation_score        NUMERIC(5,2),
  evaluation_notes        TEXT,
  certificate_issued      BOOLEAN NOT NULL DEFAULT FALSE,
  certificate_expiry_date DATE,
  enrolled_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(session_id, employee_id)
);

CREATE INDEX idx_training_enrollments_employee ON training_enrollments(company_id, employee_id);
CREATE INDEX idx_training_enrollments_session ON training_enrollments(session_id);
CREATE INDEX idx_training_enrollments_cert_expiry ON training_enrollments(company_id, certificate_expiry_date) WHERE certificate_issued = TRUE;

CREATE TABLE training_needs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id           UUID REFERENCES employees(id) ON DELETE CASCADE,
  department            VARCHAR(150),
  skill_gap             TEXT NOT NULL,
  recommended_course_id UUID REFERENCES training_courses(id) ON DELETE SET NULL,
  priority              VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status                VARCHAR(20) NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'planned', 'addressed')),
  notes                 TEXT,
  identified_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (employee_id IS NOT NULL OR department IS NOT NULL)
);

CREATE INDEX idx_training_needs_company ON training_needs(company_id, status);

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_training', 'hr.training.manage', 'Manage courses, sessions, needs assessments, evaluations, and certifications')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'hr.training.manage'
ON CONFLICT DO NOTHING;
