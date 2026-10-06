-- Permission for the "Reset Ledger Balances" tool (Settings). Resetting posts one adjusting journal
-- entry that sets the chosen accounts to zero; it never deletes anything, and it can be reversed
-- from the journal like any other entry. Roles that can already manage backups (the most
-- administrative permission) get it; any other role is granted it manually under Access Control.
INSERT INTO permissions (module, action, code, description) VALUES
  ('accounting', 'reset_ledger', 'accounting.ledger.reset', 'Reset chosen ledger accounts to zero with one adjusting journal entry')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
FROM role_permissions rp
JOIN permissions s ON s.id = rp.permission_id AND s.code = 'system.backup.manage'
CROSS JOIN permissions p
WHERE p.code = 'accounting.ledger.reset'
ON CONFLICT DO NOTHING;
