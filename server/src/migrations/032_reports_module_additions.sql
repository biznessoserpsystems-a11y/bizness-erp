-- ============================================================
-- Bizness-OS: Reports module additions — Tax Reports, HR Report,
-- Departmental Reports, Management Account Report
--
-- HR Report and Departmental Reports reuse the existing hr.reports.view
-- permission (headcount, payroll cost trend, training costs, attendance
-- were all already gated by it — see hrReportController.js, which even
-- notes "Backs both the Departmental Reports and HR Reports pages" in its
-- own comment). Tax Reports and Management Account Report are new
-- surfaces over accounting data, so they get their own permissions rather
-- than overloading accounting.ledger.view for something narrower.
-- ============================================================

INSERT INTO permissions (module, action, code, description) VALUES
  ('accounting', 'view_tax_reports', 'accounting.tax_reports.view', 'View VAT and PAYE tax reports'),
  ('accounting', 'view_management_reports', 'accounting.management_reports.view', 'View the consolidated Management Account Report')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code IN ('accounting.tax_reports.view', 'accounting.management_reports.view')
ON CONFLICT DO NOTHING;
