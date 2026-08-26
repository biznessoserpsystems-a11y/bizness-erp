-- ============================================================
-- Bizness-OS: Automatic Payroll Run
--
-- Today, running payroll is entirely manual every month: someone has to
-- remember to open HR & Payroll, create a run for the new period, and
-- process it. This adds a real background scheduler — the same pattern
-- recurringInvoiceService.js already established for recurring invoices —
-- that automatically creates and processes a payroll run covering every
-- active employee, on a configurable day of the month, without anyone
-- needing to click anything.
--
-- Deliberately conservative about the last, money-moving step: auto_mark_
-- paid defaults to FALSE. Creating and processing a run only generates
-- payslips and posts the payroll accrual (Dr Salaries Expense etc. / Cr
-- Net Salaries Payable) — it doesn't move any cash. Actually marking a run
-- paid credits a real cash or bank account, so that stays a deliberate,
-- reviewed human action unless a company explicitly opts into full
-- automation by turning this flag on too.
--
-- run_day is capped at 28 (CHECK constraint) rather than allowing 29-31,
-- so "run on the 30th" can't silently never fire in February.
-- ============================================================

CREATE TABLE payroll_auto_run_settings (
  company_id              UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
  run_day                  INTEGER NOT NULL DEFAULT 25 CHECK (run_day BETWEEN 1 AND 28),
  payment_method           VARCHAR(30) NOT NULL DEFAULT 'bank_transfer'
                           CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money', 'cheque', 'card')),
  bank_account_id          UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  auto_mark_paid           BOOLEAN NOT NULL DEFAULT FALSE,
  next_run_date            DATE,
  last_run_payroll_run_id  UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  last_run_at              TIMESTAMPTZ,
  created_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a disabled-by-default row for every existing company, matching the
-- exact idiom every other Settings migration (Procurement, Manufacturing,
-- Inventory) already uses, so the settings page has something real to show
-- immediately.
INSERT INTO payroll_auto_run_settings (company_id, next_run_date)
SELECT id, DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '24 days' FROM companies
ON CONFLICT (company_id) DO NOTHING;
