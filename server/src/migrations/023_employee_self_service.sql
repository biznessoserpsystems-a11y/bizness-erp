-- ================================================================
-- Bizness-OS: Employee Self Service
--
-- Most of ESS is not new data — it's self-scoped access to data that
-- already exists: payslips, attendance (already self-scoped since HR
-- Phase 1), and performance reviews (already self-scoped). This
-- migration adds the two genuinely new capabilities (timesheets,
-- loans) and the plumbing for the rest.
--
-- IMPORTANT FIX: leave requests were previously createable/listable
-- only with hr.leave.manage — there was no actual self-service path
-- for "Apply for Leave" despite that being the obvious expectation.
-- No schema change needed for that (essController.js changes the
-- access logic), but documenting it here since it's the reason this
-- migration exists at all alongside the two new tables.
--
-- timesheets: one row per employee per period (kept simple — a total
-- hours + notes per period, not a day-by-day/task-by-task grid,
-- which would be a much bigger timesheet-and-billing system).
-- employee_loans: a request/approval/repayment-balance record. Actual
-- payroll deduction automation (auto-subtracting monthly_deduction
-- from a payslip) is NOT wired into payrollService in this pass —
-- balance_remaining is tracked but reduced manually via the loan's
-- own endpoint, not automatically during payroll processing. Flagging
-- this explicitly so it isn't assumed to be automatic.
-- ================================================================

CREATE TABLE timesheets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  total_hours     NUMERIC(6,2) NOT NULL,
  notes           TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at    TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, period_start)
);

CREATE INDEX idx_timesheets_employee ON timesheets(company_id, employee_id, period_start DESC);
CREATE INDEX idx_timesheets_status ON timesheets(company_id, status);

CREATE TABLE employee_loans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount            NUMERIC(18,4) NOT NULL,
  reason            TEXT,
  requested_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'repaying', 'completed')),
  monthly_deduction NUMERIC(18,4),
  balance_remaining NUMERIC(18,4),
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employee_loans_employee ON employee_loans(company_id, employee_id);
CREATE INDEX idx_employee_loans_status ON employee_loans(company_id, status);

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_timesheets', 'hr.timesheets.manage', 'Approve or reject timesheets for any employee'),
  ('hr', 'manage_loans', 'hr.loans.manage', 'Approve, reject, and manage repayment of employee loans for anyone')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code IN ('hr.timesheets.manage', 'hr.loans.manage')
ON CONFLICT DO NOTHING;
