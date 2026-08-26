-- ================================================================
-- Bizness-OS: Onboarding
--
-- onboarding_steps: exactly one row per (employee, step) pair, auto-
-- seeded when an employee is created (both the direct createEmployee
-- path and the recruitment hire-conversion path) with the 7 steps
-- requested: orientation, department_assignment, supervisor_assignment,
-- equipment_allocation, account_creation, training_schedule,
-- probation_review. Kept as its own small table rather than folded
-- into the generic tasks module — these are a fixed, known checklist
-- per hire (not an open-ended to-do list), and a dedicated per-step
-- status makes "X of 7 complete" trivial to query.
--
-- Probation is tracked directly on the employee record (it's a single
-- current state, not a checklist item with sub-history) — changes are
-- logged through the existing employee_history timeline the same way
-- job title/department/salary changes are.
--
-- asset_assignments: links an existing fixed_asset to an employee
-- (equipment allocation). Gated to assets.register.manage, the same
-- permission that already governs the asset register itself — this
-- table is also the natural foundation for a fuller "Asset Assignment"
-- module later, not a throwaway onboarding-only artifact.
-- ================================================================

ALTER TABLE employees
  ADD COLUMN probation_end_date DATE,
  ADD COLUMN probation_status VARCHAR(20) NOT NULL DEFAULT 'not_applicable'
    CHECK (probation_status IN ('on_probation', 'confirmed', 'extended', 'not_applicable'));

CREATE TABLE onboarding_steps (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  step_key      VARCHAR(30) NOT NULL CHECK (step_key IN (
                  'orientation', 'department_assignment', 'supervisor_assignment',
                  'equipment_allocation', 'account_creation', 'training_schedule', 'probation_review'
                )),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  due_date      DATE,
  completed_at  TIMESTAMPTZ,
  notes         TEXT,
  assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, step_key)
);

CREATE INDEX idx_onboarding_steps_employee ON onboarding_steps(company_id, employee_id);

CREATE TABLE asset_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id        UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assigned_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  returned_date   DATE,
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_assignments_employee ON asset_assignments(company_id, employee_id);
CREATE INDEX idx_asset_assignments_asset ON asset_assignments(asset_id);

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_onboarding', 'hr.onboarding.manage', 'Manage onboarding checklists for any employee')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'hr.onboarding.manage'
ON CONFLICT DO NOTHING;

-- Extend employee_history and task related_type to reflect probation
-- changes and let onboarding-adjacent tasks reference an employee.
ALTER TABLE employee_history DROP CONSTRAINT IF EXISTS employee_history_change_type_check;
ALTER TABLE employee_history ADD CONSTRAINT employee_history_change_type_check
  CHECK (change_type IN (
    'hired', 'job_title_change', 'department_change', 'salary_change',
    'manager_change', 'status_change', 'terminated', 'shift_change', 'probation_change'
  ));
