-- IP allowlisting is opt-in, off by default, per company. A company
-- with the feature disabled (the default) is completely unaffected —
-- login works exactly as it always has. Only once a company explicitly
-- enables this and has at least one saved rule does login start
-- checking the requesting IP against it.
ALTER TABLE companies ADD COLUMN ip_restriction_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- A single IP (e.g. "203.0.113.5") is normalized to a /32 (or /128 for
-- IPv6) CIDR at save time by the application layer, so every stored
-- rule here is always a real CIDR range — the matching logic never
-- needs a separate "is this a bare IP or a range" branch.
CREATE TABLE ip_allowlist_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cidr        VARCHAR(43) NOT NULL,
  description VARCHAR(255),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ip_allowlist_company ON ip_allowlist_rules(company_id);

-- ---------- Permissions ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('system', 'manage_access_control', 'system.access_control.manage', 'View and revoke active sessions, manage IP login restrictions')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'system.access_control.manage'
ON CONFLICT DO NOTHING;
