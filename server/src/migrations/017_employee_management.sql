-- ================================================================
-- Bizness-OS: Employee Management enhancement
--
-- Adds the personal/emergency-contact detail fields a full HRIS
-- employee record needs, plus employee_history: an append-only
-- timeline of material changes to an employee's record (job title,
-- department, salary, manager, status). Rows are written by
-- hrPayrollController whenever updateEmployee/terminateEmployee
-- detects a change to a tracked field — this table is a log, not
-- something users write to directly.
-- ================================================================

ALTER TABLE employees
  ADD COLUMN date_of_birth DATE,
  ADD COLUMN gender VARCHAR(20),
  ADD COLUMN marital_status VARCHAR(20),
  ADD COLUMN national_id VARCHAR(50),
  ADD COLUMN address TEXT,
  ADD COLUMN emergency_contact_name VARCHAR(150),
  ADD COLUMN emergency_contact_phone VARCHAR(50),
  ADD COLUMN emergency_contact_relationship VARCHAR(50);

CREATE TABLE employee_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  change_type     VARCHAR(30) NOT NULL CHECK (change_type IN (
                    'hired', 'job_title_change', 'department_change',
                    'salary_change', 'manager_change', 'status_change', 'terminated'
                  )),
  field_name      VARCHAR(50),
  old_value       TEXT,
  new_value       TEXT,
  note            TEXT,
  effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  changed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employee_history_employee ON employee_history(company_id, employee_id, effective_date DESC);

-- Let employees hold attachments (contracts, ID scans, certificates)
-- through the same generic attachments module used elsewhere.
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_related_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_related_type_check
  CHECK (related_type IN ('task', 'calendar_event', 'invoice', 'purchase_order', 'customer', 'supplier', 'employee'));
