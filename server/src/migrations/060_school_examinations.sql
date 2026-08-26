-- ============================================================
-- Bizness-OS: School Management — Phase 3 (Examinations & Assessment)
--
--   - subjects: what's taught, independent of any one class, since the
--     same subject (e.g. Mathematics) is examined across many classes.
--   - grading_scale: a per-company configurable scale (min/max
--     percentage -> grade label -> remark), the same "don't hardcode
--     what a company should be able to configure" discipline already
--     used for SSNIT rates and PAYE bands — a school's own grading
--     boundaries are exactly this kind of thing.
--   - exams: a named exam for a class, in a term/academic year, with its
--     own real status rather than being implied by whether results exist
--     yet.
--   - exam_subjects: which subjects are examined in a given exam, each
--     with its own max score — not every exam necessarily covers every
--     subject at the same max score.
--   - exam_results: one row per student per subject per exam. The grade
--     is computed at read time from the grading scale rather than
--     stored, so a later change to the grading scale doesn't leave old
--     results silently showing a grade that no longer matches the
--     scale that's actually configured.
--   - skill_assessments: the Reading/Writing/Fluency rubric-based
--     tracking called out in the spec — deliberately separate from
--     numeric exam marks, since these are typically qualitative ratings
--     (emerging/developing/proficient/advanced) rather than a score out
--     of a maximum, most common for early-grade literacy assessment.
-- ============================================================

CREATE TABLE subjects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  code          VARCHAR(30),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subjects_company ON subjects(company_id);

CREATE TABLE grading_scale (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  grade_label   VARCHAR(10) NOT NULL,       -- e.g. "A1", "B2", "A", "B"
  min_percent   NUMERIC(5,2) NOT NULL,
  max_percent   NUMERIC(5,2) NOT NULL,
  remark        VARCHAR(100),               -- e.g. "Excellent", "Good", "Needs Improvement"
  CHECK (min_percent <= max_percent)
);

CREATE INDEX idx_grading_scale_company ON grading_scale(company_id);

-- A sensible default scale seeded per existing company (WAEC-style),
-- editable afterwards the same way every other seeded default in this
-- system is — a starting point, not a permanent hardcoded rule.
INSERT INTO grading_scale (company_id, grade_label, min_percent, max_percent, remark)
SELECT c.id, g.label, g.min, g.max, g.remark
FROM companies c
CROSS JOIN (VALUES
  ('A1', 80, 100, 'Excellent'),
  ('B2', 70, 79.99, 'Very Good'),
  ('B3', 65, 69.99, 'Good'),
  ('C4', 60, 64.99, 'Credit'),
  ('C5', 55, 59.99, 'Credit'),
  ('C6', 50, 54.99, 'Credit'),
  ('D7', 45, 49.99, 'Pass'),
  ('E8', 40, 44.99, 'Pass'),
  ('F9', 0, 39.99, 'Fail')
) AS g(label, min, max, remark);

CREATE TABLE exams (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,     -- e.g. "Mid-Term Exam"
  term              VARCHAR(30) NOT NULL,      -- e.g. "Term 1"
  academic_year     VARCHAR(20) NOT NULL,
  class_id          UUID REFERENCES classes(id) ON DELETE SET NULL,
  exam_date         DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'in_progress', 'completed')),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exams_company ON exams(company_id);
CREATE INDEX idx_exams_class ON exams(class_id);

CREATE TABLE exam_subjects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id       UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id),
  max_score     NUMERIC(8,2) NOT NULL DEFAULT 100,
  UNIQUE(exam_id, subject_id)
);

CREATE INDEX idx_exam_subjects_exam ON exam_subjects(exam_id);

CREATE TABLE exam_results (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  exam_id       UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id),
  score         NUMERIC(8,2) NOT NULL CHECK (score >= 0),
  remarks       TEXT,
  recorded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, student_id, subject_id)
);

CREATE INDEX idx_exam_results_exam ON exam_results(exam_id);
CREATE INDEX idx_exam_results_student ON exam_results(student_id);

CREATE TABLE skill_assessments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term            VARCHAR(30) NOT NULL,
  academic_year   VARCHAR(20) NOT NULL,
  skill_type      VARCHAR(30) NOT NULL CHECK (skill_type IN ('reading', 'writing', 'fluency', 'numeracy', 'other')),
  rating          VARCHAR(20) NOT NULL CHECK (rating IN ('emerging', 'developing', 'proficient', 'advanced')),
  notes           TEXT,
  assessed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, term, academic_year, skill_type)
);

CREATE INDEX idx_skill_assessments_student ON skill_assessments(student_id);

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
