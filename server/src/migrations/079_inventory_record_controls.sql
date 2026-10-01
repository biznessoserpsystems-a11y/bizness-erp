-- Company-level switches for editing and deleting Inventory master records
-- (products, brands, product categories, warehouses). Editing is on by
-- default (matches how it already behaved); deleting is off by default.
ALTER TABLE inventory_settings
  ADD COLUMN IF NOT EXISTS allow_record_edit   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_record_delete BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO permissions (module, action, code, description) VALUES
  ('inventory', 'delete_records', 'inventory.records.delete', 'Delete products, brands, product categories and warehouses that have never been used')
ON CONFLICT DO NOTHING;

-- Roles that can already manage Inventory Settings get the delete permission.
-- Any other role is granted it manually under Access Control.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
FROM role_permissions rp
JOIN permissions s ON s.id = rp.permission_id AND s.code = 'inventory.settings.manage'
CROSS JOIN permissions p
WHERE p.code = 'inventory.records.delete'
ON CONFLICT DO NOTHING;
