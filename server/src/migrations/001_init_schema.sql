-- ============================================================
-- Bizness-OS: Core schema (Module 01 Auth & Security, Module 15 System Admin)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- 15. System Administration ----------

CREATE TABLE companies (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL,
  legal_name        VARCHAR(255),
  tin               VARCHAR(50),          -- Ghana Revenue Authority Tax ID
  registration_no   VARCHAR(100),
  address           TEXT,
  city              VARCHAR(100),
  region            VARCHAR(100),         -- Ghana region
  country           VARCHAR(100) DEFAULT 'Ghana',
  phone             VARCHAR(50),
  email             VARCHAR(255),
  logo_url          TEXT,
  base_currency     VARCHAR(10) DEFAULT 'GHS',
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  code              VARCHAR(50),
  address           TEXT,
  city              VARCHAR(100),
  region            VARCHAR(100),
  phone             VARCHAR(50),
  is_head_office    BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE TABLE currencies (
  code              VARCHAR(10) PRIMARY KEY,   -- e.g. GHS, USD, EUR
  name              VARCHAR(100) NOT NULL,
  symbol            VARCHAR(10),
  is_active         BOOLEAN DEFAULT TRUE
);

CREATE TABLE exchange_rates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_currency     VARCHAR(10) NOT NULL REFERENCES currencies(code),
  to_currency       VARCHAR(10) NOT NULL REFERENCES currencies(code),
  rate              NUMERIC(18,6) NOT NULL,
  effective_date    DATE NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE financial_years (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,        -- e.g. "FY2026"
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  status            VARCHAR(20) DEFAULT 'open',   -- open, closed, locked
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fiscal_periods (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  financial_year_id UUID NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
  name              VARCHAR(50) NOT NULL,         -- e.g. "January 2026"
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  status            VARCHAR(20) DEFAULT 'open',   -- open, closed, locked
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE system_preferences (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key               VARCHAR(100) NOT NULL,
  value             TEXT,
  UNIQUE(company_id, key)
);

-- ---------- 01. Authentication & Security ----------

CREATE TABLE roles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  description       TEXT,
  is_system_role    BOOLEAN DEFAULT FALSE,  -- e.g. "Super Admin" cannot be deleted
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE permissions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module            VARCHAR(100) NOT NULL,   -- e.g. "inventory", "payroll"
  action            VARCHAR(100) NOT NULL,   -- e.g. "create", "read", "update", "delete", "approve"
  code              VARCHAR(150) NOT NULL UNIQUE, -- e.g. "inventory.stock_in.create"
  description       TEXT
);

CREATE TABLE role_permissions (
  role_id           UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id     UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,
  phone             VARCHAR(50),
  password_hash     VARCHAR(255) NOT NULL,
  is_active         BOOLEAN DEFAULT TRUE,
  is_email_verified BOOLEAN DEFAULT FALSE,
  mfa_enabled       BOOLEAN DEFAULT FALSE,
  mfa_secret        VARCHAR(255),
  last_login_at     TIMESTAMPTZ,
  failed_login_attempts INT DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_roles (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id           UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES branches(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE password_reset_tokens (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash        VARCHAR(255) NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  ip_address        VARCHAR(64),
  user_agent        TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  action            VARCHAR(100) NOT NULL,    -- e.g. "CREATE", "UPDATE", "DELETE", "LOGIN"
  entity_type       VARCHAR(100),             -- e.g. "user", "role", "company"
  entity_id         UUID,
  old_values        JSONB,
  new_values        JSONB,
  ip_address        VARCHAR(64),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE activity_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  activity          VARCHAR(255) NOT NULL,    -- human readable e.g. "Viewed Sales Dashboard"
  metadata          JSONB,
  ip_address        VARCHAR(64),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Indexes ----------
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_branches_company ON branches(company_id);
CREATE INDEX idx_roles_company ON roles(company_id);
CREATE INDEX idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_activity_logs_company ON activity_logs(company_id);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);

-- ---------- Seed: default currencies ----------
INSERT INTO currencies (code, name, symbol) VALUES
  ('GHS', 'Ghanaian Cedi', 'GH₵'),
  ('USD', 'US Dollar', '$'),
  ('EUR', 'Euro', '€'),
  ('GBP', 'British Pound', '£')
ON CONFLICT DO NOTHING;

-- ---------- Seed: base permission catalog ----------
INSERT INTO permissions (module, action, code, description) VALUES
  ('system', 'manage_users', 'system.users.manage', 'Create, edit, deactivate users'),
  ('system', 'manage_roles', 'system.roles.manage', 'Create, edit roles and assign permissions'),
  ('system', 'manage_company', 'system.company.manage', 'Edit company profile and branches'),
  ('system', 'view_audit_logs', 'system.audit.view', 'View audit trail and activity logs'),
  ('system', 'manage_financial_periods', 'system.financial_periods.manage', 'Manage financial years and fiscal periods'),
  ('dashboard', 'view_executive', 'dashboard.executive.view', 'View executive KPI dashboard')
ON CONFLICT DO NOTHING;
