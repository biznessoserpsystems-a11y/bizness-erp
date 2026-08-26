-- ============================================================
-- Bizness-OS: Management Account Report — Executive Summary commentary
--
-- The original template this report was built against has a written
-- "Management Commentary" section under the Executive Summary (Revenue
-- Performance / Cost Management / Profitability Analysis prompts). This adds
-- a real, persisted, editable text field for that narrative — not a
-- client-side textarea that vanishes on reload — keyed by the exact
-- reporting period, since a real business writes different commentary for
-- each period rather than one commentary that silently applies to every
-- date range someone happens to select.
-- ============================================================

CREATE TABLE management_report_commentary (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_date     DATE NOT NULL,
  to_date       DATE NOT NULL,
  commentary    TEXT NOT NULL DEFAULT '',
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, from_date, to_date)
);
