-- Company-level switches for editing and deleting Procurement records
-- (requisitions, RFQs, purchase orders, goods received notes, purchase
-- invoices, supplier payments). Editing is on by default; deleting is off
-- by default because it reverses stock and ledger entries.
ALTER TABLE procurement_settings
  ADD COLUMN IF NOT EXISTS allow_record_edit   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_record_delete BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO permissions (module, action, code, description) VALUES
  ('procurement', 'edit_records', 'procurement.records.edit', 'Edit procurement records (requisitions, RFQs, purchase orders, goods received, purchase invoices, supplier payments)'),
  ('procurement', 'delete_records', 'procurement.records.delete', 'Delete procurement records and reverse their stock and ledger effects')
ON CONFLICT DO NOTHING;

-- Roles that can already manage Procurement Settings get both permissions.
-- Any other role is granted them manually under Access Control.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
FROM role_permissions rp
JOIN permissions s ON s.id = rp.permission_id AND s.code = 'procurement.settings.manage'
CROSS JOIN permissions p
WHERE p.code IN ('procurement.records.edit', 'procurement.records.delete')
ON CONFLICT DO NOTHING;
