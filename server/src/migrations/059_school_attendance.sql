-- ============================================================
-- Bizness-OS: School Management — Phase 2 (Student Attendance)
--
-- Distinct from staff attendance (the existing HR & Payroll module's
-- shift/clock-in tracking) — this is per-student, per-class attendance,
-- the realistic teacher workflow being "mark the whole class present,
-- then flag the exceptions" rather than entering every student one at
-- a time regardless of outcome.
--
--   - student_attendance: one row per student per day. The unique
--     constraint on (student_id, attendance_date) means marking a
--     student twice for the same day always corrects the existing
--     record rather than creating a duplicate — the same "one
--     authoritative row per period" discipline used elsewhere in this
--     system (e.g. one active contract term per employee).
-- ============================================================

CREATE TABLE student_attendance (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id          UUID REFERENCES classes(id) ON DELETE SET NULL,
  attendance_date   DATE NOT NULL,
  status            VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  remarks           TEXT,
  recorded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, attendance_date)
);

CREATE INDEX idx_student_attendance_company ON student_attendance(company_id);
CREATE INDEX idx_student_attendance_student ON student_attendance(student_id, attendance_date);
CREATE INDEX idx_student_attendance_class_date ON student_attendance(class_id, attendance_date);

-- Reuses the existing school.view / school.manage permissions (058) —
-- same module, no new permission needed.
