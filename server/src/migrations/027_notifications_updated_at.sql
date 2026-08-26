-- notificationService.js has always written `updated_at = NOW()` when creating
-- or resolving notifications (both in the ON CONFLICT upsert and in resolveStale),
-- but the notifications table itself never got the column — so every notification
-- scan has been silently failing since the initial commit. Adding it here rather
-- than stripping the writes, since the intent (track last-touched time) is real
-- and used nowhere else, so no other query needs to change.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
