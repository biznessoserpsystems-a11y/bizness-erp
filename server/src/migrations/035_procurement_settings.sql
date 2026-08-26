-- ============================================================
-- Bizness-OS: Procurement Settings (Module 08 — Procurement & Purchasing)
--
-- Company-wide configuration for the Procurement module, following the
-- same pattern as HR & Payroll's "Statutory Settings" — one editable row
-- per company rather than hardcoded values, under Procurement & Purchasing
-- → Settings.
--
--   - default_payment_terms_days / default_vat_rate / default_currency:
--     used to pre-fill new suppliers and purchase orders when the caller
--     doesn't specify one, so every document doesn't need it re-entered.
--   - requisition_auto_approve_limit: requisitions carry no per-line price
--     today, so this is compared against an *estimated* value computed
--     from each product's current weighted-average/last cost — a
--     requisition at or under the limit skips manual approval (when no
--     multi-step Approval Workflow is configured for
--     'purchase_requisition'); 0 means always require approval.
--   - po_auto_approve_limit: compared against a purchase order's real
--     total_amount. A PO over the limit is flagged (`needsReview` in the
--     API response) and its approvers are notified, the same way an
--     over-the-limit requisition would be; 0 means always flag.
--   - rfq_min_quotes: minimum number of supplier quotations that must be
--     on file for an RFQ before one can be awarded via
--     `PATCH /supplier-quotations/:id/select`; 0 disables the check.
-- ============================================================

CREATE TABLE procurement_settings (
  company_id                      UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  default_payment_terms_days     INT NOT NULL DEFAULT 30,
  default_vat_rate               NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  default_currency               VARCHAR(3) NOT NULL DEFAULT 'GHS',
  requisition_auto_approve_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
  po_auto_approve_limit          NUMERIC(18,2) NOT NULL DEFAULT 0,
  rfq_min_quotes                 INT NOT NULL DEFAULT 0,
  updated_at                     TIMESTAMPTZ DEFAULT NOW(),
  created_at                     TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a default-valued row for every existing company so the settings
-- page has something real to show immediately, without waiting on the
-- lazy get-or-create the API also does for companies created afterwards.
INSERT INTO procurement_settings (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO permissions (module, action, code, description) VALUES
  ('procurement', 'manage_settings', 'procurement.settings.manage', 'View and edit Procurement & Purchasing settings')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code = 'procurement.settings.manage'
ON CONFLICT DO NOTHING;
