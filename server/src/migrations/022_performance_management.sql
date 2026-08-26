-- ================================================================
-- Bizness-OS: Performance Management
--
-- Four tables cover all nine requested capabilities:
--   - KPI Definition            -> kpis
--   - Goal Setting              -> performance_goals (optionally tied
--                                  to a KPI)
--   - Performance Reviews       -> performance_review_cycles (the
--                                  period) + performance_reviews (the
--                                  actual per-employee record)
--   - Appraisals                -> a performance_reviews row
--   - Supervisor Evaluations    -> performance_reviews.review_type = 'supervisor'
--   - Peer Reviews              -> performance_reviews.review_type = 'peer'
--   - Self Assessments          -> performance_reviews.review_type = 'self'
--   - Promotion Recommendations -> fields on the supervisor review
--   - Performance Reports       -> a query/aggregation over the above,
--                                  not a new table
--
-- One table, three review_type values, rather than three separate
-- tables — a supervisor evaluation, a self-assessment, and a peer
-- review all capture the same shape of data (rating, strengths,
-- areas for improvement, comments), just from a different reviewer
-- relative to the same employee and cycle.
--
-- Access model (enforced in the controller, not here):
--   - KPI catalog and review cycles are viewable by anyone (like the
--     training course catalog) — nothing sensitive in the definitions
--     themselves.
--   - Goals: an employee can update their own progress (actual_value/
--     status); full create/edit requires being that employee's
--     manager (employees.manager_id) or hr.performance.manage.
--   - Self-assessments: any linked employee, about themselves, no
--     permission needed.
--   - Supervisor evaluations: the employee's manager, or
--     hr.performance.manage.
--   - Peer reviews: any linked employee, about a colleague (open —
--     peer review programs aren't usually restricted to a reporting
--     line).
--   - Viewing reviews ABOUT an employee: that employee, their
--     manager, the review's author, or hr.performance.manage.
-- ================================================================

CREATE TABLE kpis (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  department      VARCHAR(150),
  unit            VARCHAR(30),
  target_direction VARCHAR(20) NOT NULL DEFAULT 'higher_is_better' CHECK (target_direction IN ('higher_is_better', 'lower_is_better')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kpis_company ON kpis(company_id, is_active);

CREATE TABLE performance_goals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kpi_id          UUID REFERENCES kpis(id) ON DELETE SET NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  target_value    NUMERIC(18,4),
  actual_value    NUMERIC(18,4),
  weight_pct      NUMERIC(5,2),
  start_date      DATE,
  due_date        DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'missed')),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_performance_goals_employee ON performance_goals(company_id, employee_id);

CREATE TABLE performance_review_cycles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  cycle_type    VARCHAR(20) NOT NULL DEFAULT 'annual' CHECK (cycle_type IN ('annual', 'semi_annual', 'quarterly', 'probation', 'ad_hoc')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_performance_cycles_company ON performance_review_cycles(company_id, status);

CREATE TABLE performance_reviews (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cycle_id              UUID NOT NULL REFERENCES performance_review_cycles(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id           UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  review_type           VARCHAR(20) NOT NULL CHECK (review_type IN ('supervisor', 'self', 'peer')),
  overall_rating        NUMERIC(3,1) CHECK (overall_rating BETWEEN 1 AND 5),
  strengths             TEXT,
  areas_for_improvement TEXT,
  comments              TEXT,
  promotion_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  promotion_notes       TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'acknowledged')),
  submitted_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cycle_id, employee_id, reviewer_id, review_type)
);

CREATE INDEX idx_performance_reviews_employee ON performance_reviews(company_id, employee_id, cycle_id);
CREATE INDEX idx_performance_reviews_reviewer ON performance_reviews(reviewer_id);

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_performance', 'hr.performance.manage', 'Manage KPIs, review cycles, goals, and reviews for any employee')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'hr.performance.manage'
ON CONFLICT DO NOTHING;
