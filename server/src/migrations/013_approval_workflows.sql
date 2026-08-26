-- ================================================================
-- Bizness-OS: Module 14 — Approval Workflows
--
-- A generic, configurable multi-step approval engine that other modules
-- can opt into, rather than each module hand-rolling its own approval
-- logic. Mirrors the "optional and safe" pattern used for GL auto-posting
-- (Sales/Procurement/Payroll): if a company hasn't configured a workflow
-- for a given entity type, that module's existing single-step approval
-- (e.g. purchase_requisitions.status) keeps working exactly as before.
--
-- Design:
--   - One `workflow_definitions` row per (company, entity_type) — editing
--     in place (add/remove/reorder steps, or flip `is_active`) rather than
--     versioning historical definitions.
--   - Each step names an existing *permission code* as its approver gate
--     (reusing the permission catalog, same idiom as
--     notificationService.notifyUsersWithPermission), plus an optional
--     `min_amount` so a step only applies once the instance amount
--     crosses a threshold (e.g. a second sign-off only above GHS 5,000).
--   - `workflow_instances` tracks one in-flight (or decided) approval per
--     source record; `workflow_instance_actions` is the immutable
--     approve/reject history, mirroring the stock_movements /
--     asset depreciation-run ledger pattern elsewhere in this codebase.
-- ================================================================

CREATE TABLE workflow_definitions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type               VARCHAR(50) NOT NULL CHECK (entity_type IN (
                              'purchase_requisition', 'purchase_order', 'purchase_invoice',
                              'sales_order', 'journal_entry', 'leave_request', 'expense_claim'
                            )),
  name                      VARCHAR(150) NOT NULL,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, entity_type)
);

CREATE TABLE workflow_steps (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_definition_id    UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  step_number               INT NOT NULL,
  name                      VARCHAR(150) NOT NULL,
  approver_permission_code  VARCHAR(150) NOT NULL REFERENCES permissions(code),
  min_amount                NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE (workflow_definition_id, step_number)
);

CREATE TABLE workflow_instances (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_definition_id    UUID NOT NULL REFERENCES workflow_definitions(id),
  entity_type               VARCHAR(50) NOT NULL,
  entity_id                 UUID NOT NULL,
  amount                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                    VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  current_step_number       INT NOT NULL,
  submitted_by              UUID REFERENCES users(id),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Only one *pending* instance may exist per source record at a time; once
-- decided, the row stays as history and a resubmission creates a new one.
CREATE UNIQUE INDEX idx_workflow_instances_one_pending_per_entity
  ON workflow_instances (entity_type, entity_id)
  WHERE status = 'pending';

CREATE INDEX idx_workflow_instances_company_status ON workflow_instances (company_id, status);
CREATE INDEX idx_workflow_steps_definition ON workflow_steps (workflow_definition_id);

CREATE TABLE workflow_instance_actions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_instance_id      UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_number               INT NOT NULL,
  user_id                   UUID REFERENCES users(id),
  action                    VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected')),
  comment                   TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Permissions ----------
-- Note: acting on a given step is gated by *that step's own*
-- approver_permission_code (whatever permission the definition names),
-- not a new generic "approve" permission — same reuse pattern the
-- Communication Centre uses for its communication-log permission.

INSERT INTO permissions (module, action, code, description) VALUES
  ('workflows', 'manage_definitions', 'workflows.definitions.manage', 'Create and edit approval workflow definitions'),
  ('workflows', 'view_all', 'workflows.view_all', 'View every approval workflow instance company-wide, not just steps awaiting your own action')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'workflows'
ON CONFLICT DO NOTHING;
