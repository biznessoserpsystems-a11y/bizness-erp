-- ================================================================
-- Bizness-OS: Module 15 (Phase 1) — Tasks
--
-- A generic, standalone to-do list: not tied to any other module, so a
-- task can exist on its own or optionally reference an existing record
-- (customer, supplier, invoice, lead) the same way crm_activities does
-- with related_type/related_id.
--
-- Permission model: creating and managing your OWN tasks needs no
-- permission at all (mirrors how leave requests work — everyone can
-- request their own leave). tasks.manage_all is only required to assign
-- a task to someone else, or to see/edit tasks you didn't create and
-- aren't assigned to. This is enforced in the controller, not via a
-- router-level requirePermission() gate, since "manage your own" must
-- stay open to every authenticated user.
--
-- See docs/tasks-calendar-feature-spec.md for the full feature scope,
-- including the deferred calendar_events table (Phase 2).
-- ================================================================

CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title             VARCHAR(200) NOT NULL,
  notes             TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'done', 'cancelled')),
  priority          VARCHAR(10) NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low', 'normal', 'high')),
  due_date          DATE,
  assigned_to       UUID REFERENCES users(id) ON DELETE SET NULL,
  related_type      VARCHAR(30) CHECK (related_type IN ('customer', 'supplier', 'invoice', 'lead')),
  related_id        UUID,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_company_assignee ON tasks(company_id, assigned_to, status);
CREATE INDEX idx_tasks_company_due_date ON tasks(company_id, due_date) WHERE status = 'open';

INSERT INTO permissions (module, action, code, description) VALUES
  ('tasks', 'manage_all', 'tasks.manage_all', 'Assign tasks to anyone and view or edit tasks you did not create or are not assigned to')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'tasks'
ON CONFLICT DO NOTHING;
