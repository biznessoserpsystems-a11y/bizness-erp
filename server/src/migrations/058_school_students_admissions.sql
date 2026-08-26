-- ============================================================
-- Bizness-OS: School Management — Phase 1 (Student Management & Admissions)
--
-- The School Management spec (16 sub-modules) genuinely overlaps with a
-- lot of what already exists in Bizness-OS, so this is deliberately
-- scoped to what's actually new:
--   - Staff Management is the existing HR & Payroll module — a school's
--     teachers and support staff are just employees, tracked exactly the
--     same way any other company's staff already are.
--   - Accounting & Finance (GL, Petty Cash, Trial Balance, Financial
--     Statements including Cash Flow) already exists in full.
--   - Inventory Management (school assets, stationery) is the existing
--     Inventory & Warehouse module.
--   - Communication (SMS, email, announcements) is the existing
--     Communications module.
-- What's genuinely missing, and what this migration builds the
-- foundation for, is everything rooted in "a student enrolled in a
-- class" — this phase covers Classes, Guardians, Students, and
-- Admissions; Attendance, Examinations/Assessment, Fees, Timetable,
-- Library, Transport, and LMS follow in later phases, each hanging off
-- the student/class records established here.
--
--   - classes: a grade/section for a given academic year, with its own
--     class teacher and capacity.
--   - guardians: parents/guardians, kept separate from students since
--     one guardian is very often linked to more than one student
--     (siblings) and one student can have more than one guardian.
--   - students: the core enrollment record — status distinguishes an
--     applicant who hasn't been admitted yet from an actually enrolled
--     student, rather than deleting/recreating records across that
--     transition.
--   - student_guardians: the many-to-many link, with a primary-contact
--     flag since a school needs to know who to call first.
--   - admissions_applications: the pre-enrollment pipeline — a real
--     workflow (submitted → under review → approved/rejected →
--     enrolled) rather than students being created directly, and a
--     trace to the student record once one is actually created from it.
-- ============================================================

CREATE TABLE classes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,          -- e.g. "Grade 5A"
  grade_level       VARCHAR(50) NOT NULL,           -- e.g. "Grade 5", "JHS 2"
  academic_year     VARCHAR(20) NOT NULL,           -- e.g. "2026/2027"
  class_teacher_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  capacity          INTEGER,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_classes_company ON classes(company_id);

CREATE TABLE guardians (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  relationship  VARCHAR(30),                       -- father, mother, guardian, other
  phone         VARCHAR(30),
  email         VARCHAR(150),
  address       TEXT,
  occupation    VARCHAR(150),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guardians_company ON guardians(company_id);

CREATE TABLE students (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  student_no        VARCHAR(30) NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  date_of_birth     DATE,
  gender            VARCHAR(10),
  class_id          UUID REFERENCES classes(id) ON DELETE SET NULL,
  admission_date    DATE,
  status            VARCHAR(20) NOT NULL DEFAULT 'enrolled' CHECK (status IN (
                      'applicant', 'enrolled', 'withdrawn', 'graduated'
                    )),
  blood_group       VARCHAR(10),
  medical_notes     TEXT,
  address           TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, student_no)
);

CREATE INDEX idx_students_company ON students(company_id);
CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_status ON students(company_id, status);

CREATE TABLE student_guardians (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id           UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  is_primary_contact    BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(student_id, guardian_id)
);

CREATE INDEX idx_student_guardians_student ON student_guardians(student_id);
CREATE INDEX idx_student_guardians_guardian ON student_guardians(guardian_id);

CREATE TABLE admissions_applications (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  application_no        VARCHAR(30) NOT NULL,
  applicant_first_name  VARCHAR(100) NOT NULL,
  applicant_last_name   VARCHAR(100) NOT NULL,
  date_of_birth         DATE,
  desired_class_id      UUID REFERENCES classes(id) ON DELETE SET NULL,
  guardian_name         VARCHAR(200),
  guardian_phone        VARCHAR(30),
  guardian_email        VARCHAR(150),
  application_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status                VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN (
                          'submitted', 'under_review', 'documents_pending', 'approved', 'rejected', 'enrolled'
                        )),
  documents_submitted   TEXT,
  notes                 TEXT,
  reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  student_id            UUID REFERENCES students(id) ON DELETE SET NULL,  -- set once actually enrolled
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, application_no)
);

CREATE INDEX idx_admissions_company ON admissions_applications(company_id);
CREATE INDEX idx_admissions_status ON admissions_applications(company_id, status);

-- ---------- Permissions ----------

INSERT INTO permissions (module, action, code, description) VALUES
  ('school', 'view', 'school.view', 'View School Management — students, classes, guardians, and admissions'),
  ('school', 'manage', 'school.manage', 'Manage students, classes, guardians, and process admissions applications')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system_role = TRUE AND p.code IN ('school.view', 'school.manage')
ON CONFLICT DO NOTHING;
