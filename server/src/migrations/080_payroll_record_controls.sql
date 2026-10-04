-- Company-level switches for editing and deleting Payroll runs (the monthly
-- wages and salary runs and their payslips). Editing is on by default;
-- deleting is off by default because it reverses ledger entries and removes
-- payslips that employees and statutory reports rely on.
ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS allow_record_edit   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_record_delete BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO permissions (module, action, code, description) VALUES
  ('hr', 'edit_payroll_records', 'hr.payroll.edit', 'Edit payroll runs (period and payment option) before they are paid'),
  ('hr', 'delete_payroll_records', 'hr.payroll.delete', 'Delete payroll runs and reverse their payslips and ledger entries')
ON CONFLICT DO NOTHING;

-- Roles that can already manage HR Settings get both permissions.
-- Any other role is granted them manually under Access Control.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
FROM role_permissions rp
JOIN permissions s ON s.id = rp.permission_id AND s.code = 'hr.settings.manage'
CROSS JOIN permissions p
WHERE p.code IN ('hr.payroll.edit', 'hr.payroll.delete')
ON CONFLICT DO NOTHING;
