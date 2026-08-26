-- ============================================================
-- Bizness-OS: Module-scoped budget management (Procurement & Sales)
--
-- Rather than build a second, parallel budget system for these two
-- modules, they get scoped read/write access to the exact same budgets/
-- budget_lines tables Accounting & Finance already uses — Procurement can
-- see and edit Cost of Sales lines, Sales can see and edit Revenue lines,
-- nothing else. Since it's literally the same rows, not a duplicate
-- calculation, these module budgets can never fail to reconcile with the
-- company-wide budget under Accounting & Finance — there's only one number
-- for any given account/period, however many pages let you look at it.
--
-- New permissions only — no new tables needed.
-- ============================================================

INSERT INTO permissions (module, action, code, description) VALUES
  ('procurement', 'manage_budget', 'procurement.budget.manage', 'View and edit the Cost of Sales lines of the company budget'),
  ('sales', 'manage_budget', 'sales.budget.manage', 'View and edit the Revenue lines of the company budget')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code IN ('procurement.budget.manage', 'sales.budget.manage')
ON CONFLICT DO NOTHING;
