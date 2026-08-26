-- ============================================================
-- Bizness-OS: School Management — Phase 5 (Timetable Management)
--
--   - periods: a company-configurable list of time slots (e.g. "Period
--     1", 8:00-8:45) — schools genuinely differ in period length and
--     count, so this isn't hardcoded.
--   - timetable_entries: which subject and teacher covers a given
--     class's period on a given day, for a term/academic year.
--
-- Two real double-booking guards, not just one:
--   1. UNIQUE(class_id, day_of_week, period_id, term, academic_year) —
--      a class can't have two different subjects in the same slot.
--   2. An application-level check (in the controller, since it spans
--      classes rather than being expressible as a single-table
--      constraint) that the same teacher isn't already assigned to a
--      different class at that exact day/period/term/year — a teacher
--      can't physically be in two classrooms at once.
-- ============================================================

CREATE TABLE periods (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(50) NOT NULL,       -- e.g. "Period 1"
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (start_time < end_time)
);

CREATE INDEX idx_periods_company ON periods(company_id);

CREATE TABLE timetable_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week       VARCHAR(10) NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  period_id         UUID NOT NULL REFERENCES periods(id),
  subject_id        UUID NOT NULL REFERENCES subjects(id),
  teacher_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  term              VARCHAR(30) NOT NULL,
  academic_year     VARCHAR(20) NOT NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, day_of_week, period_id, term, academic_year)
);

CREATE INDEX idx_timetable_company ON timetable_entries(company_id);
CREATE INDEX idx_timetable_class ON timetable_entries(class_id, term, academic_year);
CREATE INDEX idx_timetable_teacher ON timetable_entries(teacher_id, day_of_week, period_id, term, academic_year);

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
