-- ================================================================
-- Bizness-OS: Asset Assignment (close-out)
--
-- asset_assignments already existed (added during Onboarding, for
-- equipment allocation to a new hire). This closes it out as its own
-- proper module rather than an onboarding side-effect:
--   - expected_return_date lets an assignment be flagged overdue
--     (computed at query time, same idiom as compliance document
--     expiry — never a stored, staleable status)
--   - company-wide listing/history/reporting lives in assetController
--     (the natural home, since these all key off fixed_assets), while
--     the existing employee-scoped create/return endpoints stay in
--     hrPayrollController where they already are — no need to move
--     working code to "clean up" a file boundary
--   - a transfer action (return + reassign in one step) for the
--     common case of equipment moving directly from one employee to
--     another
-- ================================================================

ALTER TABLE asset_assignments ADD COLUMN expected_return_date DATE;

CREATE INDEX idx_asset_assignments_open ON asset_assignments(asset_id) WHERE returned_date IS NULL;
