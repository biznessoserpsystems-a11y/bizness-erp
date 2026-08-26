-- ============================================================
-- Bizness-OS: Backup & Restore (Settings module)
--
-- This is a real pg_dump/psql-backed feature, not a placeholder — the
-- controller shells out to the actual PostgreSQL client tools already
-- required to run this app (the same pg_dump/psql the person running this
-- server already has, since `npm run migrate` depends on the same
-- DATABASE_URL). backup_logs is purely an audit trail of who ran a backup
-- or restore and whether it succeeded — it holds no actual backup data
-- itself (backups are downloaded as a file, never stored server-side).
-- ============================================================

CREATE TABLE backup_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action            VARCHAR(20) NOT NULL,   -- 'backup' | 'restore'
  status            VARCHAR(20) NOT NULL,   -- 'success' | 'failed'
  file_size_bytes   BIGINT,
  error_message     TEXT,
  performed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backup_logs_created_at ON backup_logs(created_at DESC);

-- Deliberately not company-scoped: a backup/restore in this architecture
-- always covers the whole database (every company in it), the same way
-- `npm run migrate` does — there is no such thing as "restore just my
-- company's data" without risking foreign-key breakage against every
-- other company sharing the same tables.
INSERT INTO permissions (module, action, code, description) VALUES
  ('system', 'manage_backup', 'system.backup.manage', 'Download database backups and restore from a backup file — full data replacement, restrict carefully')
ON CONFLICT DO NOTHING;

-- Deliberately NOT auto-granted to every existing system role the way
-- other new permissions in this codebase have been — restore is a
-- destructive, whole-database operation and a company should opt in
-- explicitly (via Roles & Permissions) rather than have it silently
-- appear for every Super Admin the moment this migration runs.
