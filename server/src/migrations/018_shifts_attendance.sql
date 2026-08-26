-- ================================================================
-- Bizness-OS: HR Phase 1 — Shifts & Attendance
--
-- Time & Shift Management: named shift patterns (start/end time,
-- grace period for lateness) that an employee is currently assigned
-- to. Kept as a single `shift_id` pointer on employees rather than a
-- historized assignment table for now — simplest thing that lets
-- attendance actually determine "late" against a real schedule.
-- Shift-change history can be added later the same way employee_history
-- covers other fields, if it turns out to matter.
--
-- Attendance Management: one row per employee per work day. Self
-- clock-in/out (in the controller) only works for employees who also
-- have a linked system login (employees.user_id) — that's the natural
-- boundary of "self-service" until the full ESS phase exists. Anyone
-- with hr.attendance.manage can record or correct attendance for
-- employees who don't have logins, or fix mistakes.
-- ================================================================

CREATE TABLE shifts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, name)
);

ALTER TABLE employees ADD COLUMN shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;

CREATE TABLE attendance_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date     DATE NOT NULL,
  clock_in      TIMESTAMPTZ,
  clock_out     TIMESTAMPTZ,
  status        VARCHAR(20) NOT NULL DEFAULT 'present'
                  CHECK (status IN ('present', 'absent', 'late', 'half_day', 'on_leave', 'holiday')),
  notes         TEXT,
  recorded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, work_date)
);

CREATE INDEX idx_attendance_company_date ON attendance_records(company_id, work_date);
CREATE INDEX idx_attendance_employee ON attendance_records(employee_id, work_date DESC);

ALTER TABLE employee_history DROP CONSTRAINT IF EXISTS employee_history_change_type_check;
ALTER TABLE employee_history ADD CONSTRAINT employee_history_change_type_check
  CHECK (change_type IN (
    'hired', 'job_title_change', 'department_change', 'salary_change',
    'manager_change', 'status_change', 'terminated', 'shift_change'
  ));

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_shifts', 'hr.shifts.manage', 'Create shifts and assign employees to them'),
  ('hr', 'manage_attendance', 'hr.attendance.manage', 'Record and edit attendance on behalf of any employee'),
  ('hr', 'view_reports', 'hr.reports.view', 'View HR reports and analytics')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'hr' AND p.action IN ('manage_shifts', 'manage_attendance', 'view_reports')
ON CONFLICT DO NOTHING;
