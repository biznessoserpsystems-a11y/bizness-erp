-- ============================================================
-- Bizness-OS: Business Intelligence — Ad-Hoc Report Builder
--
-- Only the SAVED report definitions live in a real table — the actual
-- report data is never stored, only computed live from a whitelisted
-- query builder each time a report runs. `definition` holds the report
-- shape a person built (data source, dimensions, metrics, filters) as
-- JSON, re-validated against the same whitelist every single time it's
-- re-run, not trusted as already-safe just because it was saved before.
-- ============================================================

CREATE TABLE bi_saved_reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  definition    JSONB NOT NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bi_saved_reports_company ON bi_saved_reports(company_id);

-- No new permission needed — gated behind requiring at least one
-- existing *.reports.view permission at the route level, not a new
-- permission of its own, since a BI report is only ever built from data
-- the person could already see through some existing report anyway.
