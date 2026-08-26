-- ============================================================
-- Bizness-OS: School Management — Phase 9 (Academic Calendar & Promotion)
--
--   - academic_terms: a real calendar — each term (Term 1/2/3) within an
--     academic year gets its own start and end date, with a
--     sequence_order so the system can tell which term is genuinely the
--     LAST one of the year (the one that triggers promotion) without
--     guessing from the term's name, which schools don't always name
--     the same way.
--   - classes.next_class_id: which class students in THIS class move
--     into at promotion — configured per class rather than inferred
--     from grade_level text, since grade levels are free text and
--     schools' actual promotion paths don't always match a simple
--     "next number" (a Grade 6 might split into two Grade 7 streams,
--     or several feeder classes might combine into one).
--   - promotion_batches / promotion_candidates: the actual workflow.
--     When Term 3 (or whichever term is last) ends, the system
--     generates a batch of promotion CANDIDATES — one per enrolled
--     student in every class that has a next_class_id configured — but
--     nothing is applied yet. A teacher reviews each candidate
--     (approve/reject, with the target class itself still editable at
--     review time) before "Apply" actually moves any student's
--     class_id. This is the literal shape of "automatic... except by
--     teacher's approval": generation is automatic, the actual class
--     change is gated behind a real approval step.
-- ============================================================

CREATE TABLE academic_terms (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  academic_year     VARCHAR(20) NOT NULL,
  term_name         VARCHAR(30) NOT NULL,      -- e.g. "Term 1"
  sequence_order    INTEGER NOT NULL,          -- 1, 2, 3... — which term is genuinely last
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, academic_year, term_name),
  CHECK (start_date < end_date)
);

CREATE INDEX idx_academic_terms_company ON academic_terms(company_id, academic_year);

ALTER TABLE classes ADD COLUMN next_class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

CREATE TABLE promotion_batches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  academic_year     VARCHAR(20) NOT NULL,
  term_id           UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'completed')),
  generated_by      UUID REFERENCES users(id) ON DELETE SET NULL,  -- null if the scheduler generated it, not a person
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, academic_year)
);

CREATE INDEX idx_promotion_batches_company ON promotion_batches(company_id);

CREATE TABLE promotion_candidates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promotion_batch_id    UUID NOT NULL REFERENCES promotion_batches(id) ON DELETE CASCADE,
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_class_id         UUID REFERENCES classes(id) ON DELETE SET NULL,
  to_class_id           UUID REFERENCES classes(id) ON DELETE SET NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  applied               BOOLEAN NOT NULL DEFAULT FALSE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(promotion_batch_id, student_id)
);

CREATE INDEX idx_promotion_candidates_batch ON promotion_candidates(promotion_batch_id);
CREATE INDEX idx_promotion_candidates_status ON promotion_candidates(promotion_batch_id, status);

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
