-- ================================================================
-- Bizness-OS: Module 16 — Attachments
--
-- One generic, polymorphic attachments table (related_type/related_id,
-- same idiom as crm_activities and the tasks/calendar_events related_*
-- columns) rather than a separate attachments table per module. Files
-- are stored on local disk under server/uploads/ (see attachmentController
-- and .gitignore) — that directory is NOT version controlled and is
-- NOT the actual production storage decision if this app ever needs to
-- scale across multiple app servers; swapping the storage backend
-- (e.g. to S3-compatible object storage) only touches
-- attachmentController's save/read/delete functions, not this schema.
--
-- Access control is NOT a blanket permission on this table. Each
-- related_type maps to the same permission (or ownership rule) that
-- already governs that entity elsewhere in the app — see
-- attachmentController.js's RELATED_TYPE_RULES. This migration only
-- adds the storage table; no new permission rows are needed.
-- ================================================================

CREATE TABLE attachments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  related_type      VARCHAR(30) NOT NULL CHECK (related_type IN (
                      'task', 'calendar_event', 'invoice', 'purchase_order', 'customer', 'supplier'
                    )),
  related_id        UUID NOT NULL,
  file_name         VARCHAR(255) NOT NULL,
  storage_key       VARCHAR(255) NOT NULL UNIQUE,
  mime_type         VARCHAR(100),
  size_bytes        INTEGER,
  uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_related ON attachments(company_id, related_type, related_id);
