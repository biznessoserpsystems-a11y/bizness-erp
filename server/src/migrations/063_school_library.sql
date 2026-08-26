-- ============================================================
-- Bizness-OS: School Management — Phase 6 (Library Management)
--
--   - library_settings: a per-company configurable loan period and
--     overdue fine rate — the same "don't hardcode what a company
--     should be able to configure" discipline already used for the
--     grading scale, SSNIT rates, and PAYE bands.
--   - library_books: the catalog, tracking total vs currently available
--     copies — a book with multiple physical copies is one catalog row,
--     not one row per copy, since individual copies aren't usually
--     tracked with serial-level distinction in a school library.
--   - library_loans: one row per issue/return cycle. available_copies
--     on the book is decremented on issue and incremented on return (or
--     left alone if the copy is marked lost, since a lost copy
--     genuinely isn't available to loan out again) — kept in sync by
--     the application logic in the same transaction as the loan record
--     itself, rather than computed separately and risking drift.
--
-- Deliberately does not post to the general ledger — unlike Fees
-- Management, overdue fines here are tracked as a real record but not
-- treated as billable revenue requiring GL entries, matching how
-- Attendance and Examinations also stay outside the ledger. A school
-- that wants to actually invoice fines could route them through the
-- existing Fees Management pipeline as a fee category in a future
-- iteration.
-- ============================================================

CREATE TABLE library_settings (
  company_id        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  loan_period_days  INTEGER NOT NULL DEFAULT 14 CHECK (loan_period_days > 0),
  fine_per_day      NUMERIC(10,2) NOT NULL DEFAULT 0
);

INSERT INTO library_settings (company_id) SELECT id FROM companies;

CREATE TABLE library_books (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title             VARCHAR(250) NOT NULL,
  author            VARCHAR(200),
  isbn              VARCHAR(30),
  category          VARCHAR(100),
  total_copies      INTEGER NOT NULL DEFAULT 1 CHECK (total_copies > 0),
  available_copies  INTEGER NOT NULL DEFAULT 1 CHECK (available_copies >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CHECK (available_copies <= total_copies)
);

CREATE INDEX idx_library_books_company ON library_books(company_id);

CREATE TABLE library_loans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  book_id       UUID NOT NULL REFERENCES library_books(id),
  student_id    UUID NOT NULL REFERENCES students(id),
  issue_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date      DATE NOT NULL,
  return_date   DATE,
  status        VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'lost')),
  fine_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  fine_paid     BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  issued_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_library_loans_company ON library_loans(company_id);
CREATE INDEX idx_library_loans_book ON library_loans(book_id);
CREATE INDEX idx_library_loans_student ON library_loans(student_id);
CREATE INDEX idx_library_loans_status ON library_loans(company_id, status);

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
