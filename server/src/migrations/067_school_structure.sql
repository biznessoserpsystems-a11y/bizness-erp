-- ============================================================
-- Bizness-OS: School Management — Phase 10 (School Structure)
--
-- classes.grade_level has been free text since Phase 1 ("Grade 5",
-- "JHS 2" — whatever a school typed in) — fine for display, but no
-- actual structure a school could ever compare or order against. This
-- phase adds the real hierarchy underneath it, without breaking
-- anything already relying on the free-text field:
--
--   - school_departments: the major organizational divisions (e.g.
--     "Primary", "Junior High", "Senior High"), each with its own head.
--   - grade_levels: a real, ORDERED ladder of levels (Creche through
--     SHS 3, or whatever a school actually uses), each belonging to a
--     department, with a school-wide sequence_order — the structured
--     version of what classes.grade_level has only ever approximated as
--     text. classes.grade_level_id is added as a new, optional link
--     alongside the existing free-text column, not a replacement — a
--     school can adopt the structured ladder without anything that
--     already depends on the text column breaking.
--   - houses: for schools running a house/prefect system (common in
--     Ghanaian and British-style schools) — a real, assignable group a
--     student can belong to, not just a static list nobody uses.
--     students.house_id is similarly additive.
-- ============================================================

CREATE TABLE school_departments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,       -- e.g. "Primary", "Junior High School"
  description       TEXT,
  head_employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  sequence_order    INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_school_departments_company ON school_departments(company_id);

CREATE TABLE grade_levels (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES school_departments(id) ON DELETE SET NULL,
  name              VARCHAR(100) NOT NULL,       -- e.g. "Primary 4", "JHS 2"
  sequence_order    INTEGER NOT NULL,            -- school-wide order — Creche=1 ... SHS 3=last
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, sequence_order)
);

CREATE INDEX idx_grade_levels_company ON grade_levels(company_id);
CREATE INDEX idx_grade_levels_department ON grade_levels(department_id);

CREATE TABLE houses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL,   -- e.g. "Red House"
  color                 VARCHAR(20),              -- a hex code, for display
  house_master_id       UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE INDEX idx_houses_company ON houses(company_id);

ALTER TABLE classes ADD COLUMN grade_level_id UUID REFERENCES grade_levels(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN house_id UUID REFERENCES houses(id) ON DELETE SET NULL;

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
