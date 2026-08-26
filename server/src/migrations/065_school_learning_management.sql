-- ============================================================
-- Bizness-OS: School Management — Phase 8 (Learning Management)
--
-- The final phase of the School Management spec — assignments and
-- study materials, both tied to a class and subject.
--
--   - study_materials: resources shared with a class for a subject —
--     a link/reference rather than a file upload pipeline of its own,
--     reusing the existing generic attachments system if a school wants
--     to attach an actual file to a material in a future iteration.
--   - assignments: given to a class for a subject, with a due date and
--     a max score — mirrors the same due-date/max-score shape Exams
--     already established, since grading an assignment is conceptually
--     the same problem as grading an exam subject.
--   - assignment_submissions: one row per student per assignment — a
--     real UNIQUE(assignment_id, student_id) constraint means
--     resubmitting corrects the existing submission via upsert rather
--     than creating a duplicate, the same discipline already used for
--     attendance and skill assessments. Whether a submission is late is
--     computed by comparing its submitted_at to the assignment's
--     due_date at read time, not stored, so it can never go stale.
-- ============================================================

CREATE TABLE study_materials (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  class_id      UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id    UUID REFERENCES subjects(id),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  resource_url  VARCHAR(500),
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_study_materials_company ON study_materials(company_id);
CREATE INDEX idx_study_materials_class ON study_materials(class_id);

CREATE TABLE assignments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  due_date      DATE NOT NULL,
  max_score     NUMERIC(8,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assignments_company ON assignments(company_id);
CREATE INDEX idx_assignments_class ON assignments(class_id);

CREATE TABLE assignment_submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content         TEXT,
  score           NUMERIC(8,2),
  feedback        TEXT,
  graded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  graded_at       TIMESTAMPTZ,
  UNIQUE(assignment_id, student_id)
);

CREATE INDEX idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX idx_assignment_submissions_student ON assignment_submissions(student_id);

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
