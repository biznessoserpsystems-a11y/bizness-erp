-- ============================================================
-- Bizness-OS: HR Report — termination reason
--
-- employee_history already tracks a 'terminated' change_type, but with no
-- structured reason — just a free-text `note`. The HR Report template's
-- Employee Turnover section wants termination reasons for a Resignation /
-- Retirement / Termination / End of Contract breakdown, so this adds a real
-- structured field for it rather than trying to parse free text.
-- Nullable and only meaningful when change_type = 'terminated' — existing
-- rows simply have no reason recorded yet, which the report treats as
-- "Unspecified" rather than guessing.
-- ============================================================

ALTER TABLE employee_history ADD COLUMN termination_reason VARCHAR(20)
  CHECK (termination_reason IN ('resignation', 'retirement', 'involuntary_termination', 'end_of_contract'));
