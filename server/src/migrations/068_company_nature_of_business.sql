-- ============================================================
-- Bizness-OS: Add "Nature of Business" to companies
--
-- A free-text description of what the company actually does (e.g.
-- "Retail trading — building materials", "School", "Restaurant and
-- catering"). Captured once at account creation, since a new company
-- almost always knows this on day one, and editable afterward from the
-- Company Profile like every other company-identity field.
-- ============================================================

ALTER TABLE companies ADD COLUMN nature_of_business VARCHAR(255);
