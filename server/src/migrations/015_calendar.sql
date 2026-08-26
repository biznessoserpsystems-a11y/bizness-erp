-- ================================================================
-- Bizness-OS: Module 15 (Phase 2) — Calendar Events
--
-- Same permission philosophy as tasks (Phase 1, migration 014):
-- creating and managing your OWN events needs no permission at all.
-- calendar.manage_all is only required to add attendees other than
-- yourself, or to see/edit events you didn't create and aren't an
-- attendee of. Enforced in the controller, not a router-level gate —
-- see docs/tasks-calendar-feature-spec.md.
--
-- calendar_event_attendees is a plain many-to-many: the creator is
-- always added as an attendee automatically (in the controller), so
-- "my events" is just "events where I'm an attendee row" — no need
-- for a separate created_by check on the read path.
-- ================================================================

CREATE TABLE calendar_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title             VARCHAR(200) NOT NULL,
  description       TEXT,
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ,
  all_day           BOOLEAN NOT NULL DEFAULT FALSE,
  related_type      VARCHAR(30) CHECK (related_type IN ('customer', 'supplier', 'invoice', 'lead')),
  related_id        UUID,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_events_company_starts ON calendar_events(company_id, starts_at);

CREATE TABLE calendar_event_attendees (
  event_id          UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

INSERT INTO permissions (module, action, code, description) VALUES
  ('calendar', 'manage_all', 'calendar.manage_all', 'Add other attendees to events and view or edit events you are not an attendee of')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'calendar'
ON CONFLICT DO NOTHING;
