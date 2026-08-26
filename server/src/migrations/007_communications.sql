-- ---------- Communication Centre ----------
-- Three parts: (1) notifications — a per-user feed for discrete events (approval requests/
-- decisions, announcements); (2) announcements — company-wide posts, fanned out to every
-- active user's notification feed; (3) communication_logs — a call/email/meeting/note
-- history attached to a customer or supplier record.
--
-- "Overdue invoices" and "low stock" are deliberately NOT persisted here — they're ongoing
-- facts, not one-time events, so they're computed live (see notificationController's
-- /notifications/alerts, which reuses the same low-stock query as inventoryReportController).
-- Persisting them would mean building dedup/expiry logic for something a live query already
-- answers correctly at any moment.

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              VARCHAR(50) NOT NULL, -- approval_requested, approval_decided, announcement
  title             VARCHAR(255) NOT NULL,
  body              TEXT,
  link              VARCHAR(255),         -- frontend route to the related record
  reference_type    VARCHAR(50),
  reference_id      UUID,
  is_read           BOOLEAN DEFAULT FALSE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_recipient ON notifications(company_id, user_id, is_read, created_at DESC);

CREATE TABLE announcements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  body              TEXT NOT NULL,
  posted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_announcements_company ON announcements(company_id, created_at DESC);

CREATE TABLE communication_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  related_type      VARCHAR(20) NOT NULL CHECK (related_type IN ('customer', 'supplier')),
  related_id        UUID NOT NULL, -- customers.id or suppliers.id, depending on related_type
  channel           VARCHAR(20) NOT NULL DEFAULT 'call', -- call, email, meeting, note, sms, visit
  direction         VARCHAR(10) DEFAULT 'outbound', -- inbound, outbound
  subject           VARCHAR(255),
  notes             TEXT NOT NULL,
  contact_name      VARCHAR(255), -- who on their side, if relevant
  occurred_at       TIMESTAMPTZ DEFAULT NOW(),
  follow_up_date    DATE,
  logged_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comm_logs_related ON communication_logs(company_id, related_type, related_id, occurred_at DESC);

-- ---------- Seed: permissions for the Communication Centre ----------
-- Viewing/reading your own notification feed needs no permission (like the dashboard).
-- Posting a company-wide announcement does. Logging a customer/supplier communication
-- reuses the permission that already gates managing that customer/supplier record
-- (sales.customers.manage / procurement.suppliers.manage) rather than a new one.
INSERT INTO permissions (module, action, code, description) VALUES
  ('communications', 'manage_announcements', 'communications.announcements.manage', 'Post company-wide announcements')
ON CONFLICT DO NOTHING;

-- Grant to every existing Super Admin role automatically, same as every prior module's rollout.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.module = 'communications'
ON CONFLICT DO NOTHING;
