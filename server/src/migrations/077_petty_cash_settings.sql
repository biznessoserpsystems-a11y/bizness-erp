-- Company-level switches for Petty Cash editing and deleting. Editing is on
-- by default (matches how the edit endpoints already behaved); deleting is
-- off by default since it reverses ledger entries and removes records.
CREATE TABLE IF NOT EXISTS petty_cash_settings (
  company_id   UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  allow_edit   BOOLEAN NOT NULL DEFAULT TRUE,
  allow_delete BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO permissions (module, action, code, description) VALUES
  ('accounting', 'petty_cash_settings', 'accounting.petty_cash.settings', 'Turn Petty Cash editing and deleting on or off')
ON CONFLICT DO NOTHING;

-- System roles get the settings, edit and delete permissions; custom roles
-- are still granted them manually under Access Control.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE
  AND p.code IN ('accounting.petty_cash.settings', 'accounting.petty_cash.edit', 'accounting.petty_cash.delete')
ON CONFLICT DO NOTHING;
