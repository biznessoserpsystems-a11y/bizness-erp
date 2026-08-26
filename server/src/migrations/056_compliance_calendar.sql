-- ============================================================
-- Bizness-OS: Compliance Calendar
--
-- 037_compliance_register.sql already tracks point-in-time STATUS for a
-- fixed set of items (WHT, TCC, EPA, Business Operating Permit — is this
-- currently valid, expiring soon, or expired?). This is a genuinely
-- different, complementary concept: a recurring CALENDAR of statutory
-- filing deadlines — when is the next SSNIT filing due, when does the
-- Business Operating Permit need renewing, when is Property Rate due —
-- with a real filing history, not just a current status.
--
--   - compliance_calendar_items: the recurring schedule itself (category,
--     frequency, and the actual next_due_date this drives the calendar
--     view from). Broader category list than 037's fixed set, since a
--     calendar deadline is a different thing than "is this currently
--     valid" — Tax Filings, Labour Law Act, EPA, FDA, Business Operating
--     Permit, Property Rate, Business Registrations, and SSNIT Filings,
--     per the actual request this was built for, plus a general
--     catch-all for anything else a company needs to schedule.
--   - compliance_calendar_filings: the actual filing history for a given
--     item — was this period's filing actually done, when, under what
--     reference number. Marking one filed is what advances the parent
--     item's next_due_date to the following occurrence, the same
--     schedule-advancing idiom recurringInvoiceService.js and
--     payrollAutoRunService.js already established for their own
--     recurring schedules.
--
-- "Overdue" isn't a stored status that could go stale — it's always
-- computed live by comparing next_due_date to today, so it's never wrong
-- because a background job didn't run.
-- ============================================================

CREATE TABLE compliance_calendar_items (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category                VARCHAR(30) NOT NULL CHECK (category IN (
                            'tax_filing', 'labour_law', 'epa', 'fda', 'business_operating_permit',
                            'property_rate', 'business_registration', 'ssnit_filing', 'other'
                          )),
  title                   VARCHAR(200) NOT NULL,
  description             TEXT,
  frequency               VARCHAR(20) NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'annually', 'one_time')),
  due_day                 INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 28),  -- capped at 28 so it always falls in every month, including February
  due_month               INTEGER CHECK (due_month BETWEEN 1 AND 12),        -- only meaningful for annually/one_time
  next_due_date           DATE NOT NULL,
  responsible_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_calendar_items_company ON compliance_calendar_items(company_id);
CREATE INDEX idx_compliance_calendar_items_due ON compliance_calendar_items(company_id, next_due_date);

CREATE TABLE compliance_calendar_filings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_item_id  UUID NOT NULL REFERENCES compliance_calendar_items(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_label      VARCHAR(50) NOT NULL,   -- e.g. "July 2026", "Q3 2026", "FY2026"
  due_date          DATE NOT NULL,
  filed_date        DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'overdue')),
  reference_no      VARCHAR(100),
  notes             TEXT,
  filed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_calendar_filings_item ON compliance_calendar_filings(calendar_item_id);
CREATE INDEX idx_compliance_calendar_filings_company ON compliance_calendar_filings(company_id);

-- Reuses the existing system.compliance.manage permission (037) rather
-- than adding a new one — same statutory/regulatory compliance domain,
-- and it already covers view + manage in one grant.
