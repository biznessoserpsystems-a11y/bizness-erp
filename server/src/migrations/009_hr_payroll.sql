-- ============================================================
-- Bizness-OS: HR & Payroll (first slice)
-- ============================================================
-- Fills out the "Coming soon" Payroll & HR placeholder. Employees are a new
-- top-level record (distinct from `users` — not every employee needs system
-- login access, and not every user is on payroll). Leave requests reference
-- employees, and payroll runs are processed month-by-month, generating one
-- payslip per active employee with SSNIT and PAYE deductions computed
-- automatically (see hrPayrollController.processPayrollRun).

CREATE TABLE employees (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL, -- optional link if the employee also has system login
  employee_no         VARCHAR(50) NOT NULL,
  first_name          VARCHAR(150) NOT NULL,
  last_name           VARCHAR(150) NOT NULL,
  email               VARCHAR(255),
  phone               VARCHAR(50),
  job_title           VARCHAR(150),
  department          VARCHAR(150),
  employment_type     VARCHAR(20) NOT NULL DEFAULT 'full_time', -- full_time, part_time, contract
  employment_status   VARCHAR(20) NOT NULL DEFAULT 'active',    -- active, on_leave, terminated
  manager_id          UUID REFERENCES employees(id) ON DELETE SET NULL,
  hire_date           DATE NOT NULL,
  termination_date    DATE,
  basic_salary        NUMERIC(18,4) NOT NULL DEFAULT 0,
  allowances          NUMERIC(18,4) NOT NULL DEFAULT 0,         -- housing/transport/other, summed
  bank_name           VARCHAR(150),
  bank_account_number VARCHAR(50),
  ssnit_number        VARCHAR(50),
  tin_number          VARCHAR(50),
  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, employee_no)
);

CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_employees_status ON employees(company_id, employment_status);
CREATE INDEX idx_employees_manager ON employees(manager_id);

CREATE TABLE leave_types (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,        -- Annual, Sick, Maternity, Paternity, Unpaid...
  days_per_year  INTEGER NOT NULL DEFAULT 0,
  is_paid        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE leave_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id  UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  days           INTEGER NOT NULL,
  reason         TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, cancelled
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_company ON leave_requests(company_id);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(company_id, status);

-- One payroll run per company per month; generates a payslip per active employee.
CREATE TABLE payroll_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_month      INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year       INTEGER NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, processed, paid
  total_gross       NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_deductions  NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_net         NUMERIC(18,4) NOT NULL DEFAULT 0,
  processed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at      TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, period_month, period_year)
);

CREATE TABLE payslips (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_run_id   UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  basic_salary     NUMERIC(18,4) NOT NULL DEFAULT 0,
  allowances       NUMERIC(18,4) NOT NULL DEFAULT 0,
  gross_pay        NUMERIC(18,4) NOT NULL DEFAULT 0,
  ssnit_employee   NUMERIC(18,4) NOT NULL DEFAULT 0,  -- employee's 5.5% tier 1 contribution
  income_tax       NUMERIC(18,4) NOT NULL DEFAULT 0,  -- PAYE, computed on chargeable income (gross - SSNIT)
  other_deductions NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(18,4) NOT NULL DEFAULT 0,
  net_pay          NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX idx_payslips_run ON payslips(payroll_run_id);
CREATE INDEX idx_payslips_employee ON payslips(employee_id);

-- ---------- Seed: default leave types (harmless if a company already made its own) ----------
-- Left to app-level seeding per company rather than a blanket insert here, since
-- leave_types is scoped by company_id and this migration has no company context.

-- ---------- Seed: permissions ----------
INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'manage_employees', 'hr.employees.manage', 'Create, edit, and terminate employee records'),
  ('hr', 'manage_leave', 'hr.leave.manage', 'Submit and manage leave requests'),
  ('hr', 'approve_leave', 'hr.leave.approve', 'Approve or reject leave requests'),
  ('hr', 'manage_payroll', 'hr.payroll.manage', 'Run payroll and generate payslips'),
  ('hr', 'view_payroll', 'hr.payroll.view', 'View payroll runs and payslips')
ON CONFLICT DO NOTHING;

-- Retrofit: grant to every existing Super Admin role (same pattern as prior migrations).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.is_system_role = TRUE
  AND p.code IN ('hr.employees.manage', 'hr.leave.manage', 'hr.leave.approve', 'hr.payroll.manage', 'hr.payroll.view')
ON CONFLICT DO NOTHING;
