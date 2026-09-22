-- Adds edit/delete permissions for Petty Cash. Not auto-assigned to any
-- role — admins grant these manually per role under Access Control.
INSERT INTO permissions (module, action, code, description) VALUES
  ('accounting', 'edit_petty_cash', 'accounting.petty_cash.edit', 'Edit petty cash accounts, vouchers, and receipts'),
  ('accounting', 'delete_petty_cash', 'accounting.petty_cash.delete', 'Delete petty cash accounts, vouchers, and receipts')
ON CONFLICT DO NOTHING;
