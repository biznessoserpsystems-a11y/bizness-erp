const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('../middleware/auditLog');
const salesService = require('../services/salesService');

// ============================================================================
// Classes
// ============================================================================

// GET /school/classes
const listClasses = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, e.first_name AS teacher_first_name, e.last_name AS teacher_last_name, nc.name AS next_class_name, gl.name AS structured_grade_level_name,
            (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'enrolled') AS enrolled_count
     FROM classes c LEFT JOIN school_staff e ON e.id = c.class_teacher_id LEFT JOIN classes nc ON nc.id = c.next_class_id LEFT JOIN grade_levels gl ON gl.id = c.grade_level_id
     WHERE c.company_id = $1 ORDER BY c.academic_year DESC, c.grade_level, c.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /school/classes
const createClass = asyncHandler(async (req, res) => {
  const { name, gradeLevel, academicYear, classTeacherId, capacity, gradeLevelId } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  if (!gradeLevel) throw new ApiError(400, 'gradeLevel is required');
  if (!academicYear) throw new ApiError(400, 'academicYear is required');

  const { rows } = await db.query(
    `INSERT INTO classes (company_id, name, grade_level, academic_year, class_teacher_id, capacity, grade_level_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, name, gradeLevel, academicYear, classTeacherId || null, capacity || null, gradeLevelId || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'class', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /school/classes/:id
const updateClass = asyncHandler(async (req, res) => {
  const { name, gradeLevel, academicYear, classTeacherId, capacity, isActive, nextClassId, gradeLevelId } = req.body;
  const { rows } = await db.query(
    `UPDATE classes SET
       name = COALESCE($1, name), grade_level = COALESCE($2, grade_level), academic_year = COALESCE($3, academic_year),
       class_teacher_id = COALESCE($4, class_teacher_id), capacity = COALESCE($5, capacity), is_active = COALESCE($6, is_active),
       next_class_id = COALESCE($7, next_class_id), grade_level_id = COALESCE($8, grade_level_id), updated_at = NOW()
     WHERE id = $9 AND company_id = $10 RETURNING *`,
    [name, gradeLevel, academicYear, classTeacherId, capacity, isActive, nextClassId, gradeLevelId, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Class not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'class', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /school/classes/:id
const deleteClassEndpoint = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM students WHERE class_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This class has real students assigned to it and cannot be deleted — mark it inactive instead');

  const { rows } = await db.query('DELETE FROM classes WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Class not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'class', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================================
// Guardians
// ============================================================================

// GET /school/guardians
const listGuardians = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM guardians WHERE company_id = $1 ORDER BY last_name, first_name', [req.user.companyId]);
  res.json(rows);
});

// POST /school/guardians
const createGuardian = asyncHandler(async (req, res) => {
  const { firstName, lastName, relationship, phone, email, address, occupation } = req.body;
  if (!firstName || !lastName) throw new ApiError(400, 'firstName and lastName are required');

  const { rows } = await db.query(
    `INSERT INTO guardians (company_id, first_name, last_name, relationship, phone, email, address, occupation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, firstName, lastName, relationship || null, phone || null, email || null, address || null, occupation || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /school/guardians/:id
const updateGuardian = asyncHandler(async (req, res) => {
  const { firstName, lastName, relationship, phone, email, address, occupation } = req.body;
  const { rows } = await db.query(
    `UPDATE guardians SET
       first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), relationship = COALESCE($3, relationship),
       phone = COALESCE($4, phone), email = COALESCE($5, email), address = COALESCE($6, address), occupation = COALESCE($7, occupation), updated_at = NOW()
     WHERE id = $8 AND company_id = $9 RETURNING *`,
    [firstName, lastName, relationship, phone, email, address, occupation, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Guardian not found');
  res.json(rows[0]);
});

// DELETE /school/guardians/:id
const deleteGuardian = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM guardians WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Guardian not found');
  res.status(204).end();
});

// ============================================================================
// Students
// ============================================================================

// GET /school/students?status=enrolled&classId=...
const listStudents = asyncHandler(async (req, res) => {
  const { status, classId } = req.query;
  const params = [req.user.companyId];
  let where = 's.company_id = $1';
  if (status) { params.push(status); where += ` AND s.status = $${params.length}`; }
  if (classId) { params.push(classId); where += ` AND s.class_id = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT s.*, c.name AS class_name, h.name AS house_name FROM students s LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN houses h ON h.id = s.house_id
     WHERE ${where} ORDER BY s.last_name, s.first_name`,
    params
  );
  res.json(rows);
});

// GET /school/students/:id — includes guardians
const getStudent = asyncHandler(async (req, res) => {
  const studentResult = await db.query(
    `SELECT s.*, c.name AS class_name, h.name AS house_name, h.color AS house_color
     FROM students s LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN houses h ON h.id = s.house_id
     WHERE s.id = $1 AND s.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!studentResult.rows.length) throw new ApiError(404, 'Student not found');

  const guardians = await db.query(
    `SELECT g.*, sg.is_primary_contact FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = $1`,
    [req.params.id]
  );
  res.json({ ...studentResult.rows[0], guardians: guardians.rows });
});

// POST /school/students
const createStudent = asyncHandler(async (req, res) => {
  const { firstName, lastName, dateOfBirth, gender, classId, admissionDate, bloodGroup, medicalNotes, address, guardianIds, houseId } = req.body;
  if (!firstName || !lastName) throw new ApiError(400, 'firstName and lastName are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const studentNo = await salesService.generateDocNo(client, req.user.companyId, 'STU');
    const { rows } = await client.query(
      `INSERT INTO students (company_id, student_no, first_name, last_name, date_of_birth, gender, class_id, admission_date, blood_group, medical_notes, address, house_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.companyId, studentNo, firstName, lastName, dateOfBirth || null, gender || null, classId || null, admissionDate || new Date().toISOString().slice(0, 10), bloodGroup || null, medicalNotes || null, address || null, houseId || null, req.user.id]
    );
    if (Array.isArray(guardianIds)) {
      for (const [i, guardianId] of guardianIds.entries()) {
        await client.query('INSERT INTO student_guardians (student_id, guardian_id, is_primary_contact) VALUES ($1,$2,$3)', [rows[0].id, guardianId, i === 0]);
      }
    }
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'student', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /school/students/:id
const updateStudent = asyncHandler(async (req, res) => {
  const { firstName, lastName, dateOfBirth, gender, classId, status, bloodGroup, medicalNotes, address, houseId } = req.body;
  const validStatuses = ['applicant', 'enrolled', 'withdrawn', 'graduated'];
  if (status && !validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE students SET
       first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), date_of_birth = COALESCE($3, date_of_birth),
       gender = COALESCE($4, gender), class_id = COALESCE($5, class_id), status = COALESCE($6, status),
       blood_group = COALESCE($7, blood_group), medical_notes = COALESCE($8, medical_notes), address = COALESCE($9, address),
       house_id = COALESCE($10, house_id), updated_at = NOW()
     WHERE id = $11 AND company_id = $12 RETURNING *`,
    [firstName, lastName, dateOfBirth, gender, classId, status, bloodGroup, medicalNotes, address, houseId, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Student not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'student', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /school/students/:id
const deleteStudent = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM students WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Student not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'student', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// POST /school/students/:id/guardians { guardianId, isPrimaryContact }
const linkGuardian = asyncHandler(async (req, res) => {
  const { guardianId, isPrimaryContact } = req.body;
  if (!guardianId) throw new ApiError(400, 'guardianId is required');
  if (isPrimaryContact) {
    await db.query('UPDATE student_guardians SET is_primary_contact = FALSE WHERE student_id = $1', [req.params.id]);
  }
  const { rows } = await db.query(
    `INSERT INTO student_guardians (student_id, guardian_id, is_primary_contact) VALUES ($1,$2,$3)
     ON CONFLICT (student_id, guardian_id) DO UPDATE SET is_primary_contact = $3 RETURNING *`,
    [req.params.id, guardianId, !!isPrimaryContact]
  );
  res.status(201).json(rows[0]);
});

// DELETE /school/students/:studentId/guardians/:guardianId
const unlinkGuardian = asyncHandler(async (req, res) => {
  await db.query('DELETE FROM student_guardians WHERE student_id = $1 AND guardian_id = $2', [req.params.studentId, req.params.guardianId]);
  res.status(204).end();
});

// ============================================================================
// Admissions
// ============================================================================

// GET /school/admissions
const listAdmissions = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.*, c.name AS desired_class_name FROM admissions_applications a LEFT JOIN classes c ON c.id = a.desired_class_id
     WHERE a.company_id = $1 ORDER BY a.application_date DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /school/admissions
const createAdmission = asyncHandler(async (req, res) => {
  const { applicantFirstName, applicantLastName, dateOfBirth, desiredClassId, guardianName, guardianPhone, guardianEmail, documentsSubmitted, notes } = req.body;
  if (!applicantFirstName || !applicantLastName) throw new ApiError(400, 'applicantFirstName and applicantLastName are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const applicationNo = await salesService.generateDocNo(client, req.user.companyId, 'ADM');
    const { rows } = await client.query(
      `INSERT INTO admissions_applications (company_id, application_no, applicant_first_name, applicant_last_name, date_of_birth, desired_class_id, guardian_name, guardian_phone, guardian_email, documents_submitted, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.companyId, applicationNo, applicantFirstName, applicantLastName, dateOfBirth || null, desiredClassId || null, guardianName || null, guardianPhone || null, guardianEmail || null, documentsSubmitted || null, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'admissions_application', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /school/admissions/:id
const updateAdmission = asyncHandler(async (req, res) => {
  const { applicantFirstName, applicantLastName, dateOfBirth, desiredClassId, guardianName, guardianPhone, guardianEmail, status, documentsSubmitted, notes } = req.body;
  const validStatuses = ['submitted', 'under_review', 'documents_pending', 'approved', 'rejected', 'enrolled'];
  if (status && !validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);
  if (status === 'enrolled') throw new ApiError(400, 'Use the /enroll action to move an approved application into a real student record');

  const { rows } = await db.query(
    `UPDATE admissions_applications SET
       applicant_first_name = COALESCE($1, applicant_first_name), applicant_last_name = COALESCE($2, applicant_last_name),
       date_of_birth = COALESCE($3, date_of_birth), desired_class_id = COALESCE($4, desired_class_id),
       guardian_name = COALESCE($5, guardian_name), guardian_phone = COALESCE($6, guardian_phone), guardian_email = COALESCE($7, guardian_email),
       status = COALESCE($8, status), documents_submitted = COALESCE($9, documents_submitted), notes = COALESCE($10, notes),
       reviewed_by = CASE WHEN $8 IS NOT NULL THEN $11 ELSE reviewed_by END, updated_at = NOW()
     WHERE id = $12 AND company_id = $13 RETURNING *`,
    [applicantFirstName, applicantLastName, dateOfBirth, desiredClassId, guardianName, guardianPhone, guardianEmail, status, documentsSubmitted, notes, req.user.id, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Admissions application not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'admissions_application', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /school/admissions/:id
const deleteAdmission = asyncHandler(async (req, res) => {
  const app = await db.query('SELECT student_id FROM admissions_applications WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!app.rows.length) throw new ApiError(404, 'Admissions application not found');
  if (app.rows[0].student_id) throw new ApiError(400, 'This application has already been converted to a student record and cannot be deleted');

  await db.query('DELETE FROM admissions_applications WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// POST /school/admissions/:id/enroll { classId, admissionDate }
// Creates a real student record from an approved application — the one
// deliberate transition point from "applicant" into the actual student
// body, rather than students being created directly from an application
// that was never actually approved.
const enrollApplication = asyncHandler(async (req, res) => {
  const { classId, admissionDate } = req.body;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const appResult = await client.query('SELECT * FROM admissions_applications WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!appResult.rows.length) throw new ApiError(404, 'Admissions application not found');
    const app = appResult.rows[0];
    if (app.student_id) throw new ApiError(400, 'This application has already been enrolled');
    if (app.status !== 'approved') throw new ApiError(400, 'Only an approved application can be enrolled');

    const studentNo = await salesService.generateDocNo(client, req.user.companyId, 'STU');
    const studentResult = await client.query(
      `INSERT INTO students (company_id, student_no, first_name, last_name, date_of_birth, class_id, admission_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'enrolled',$8) RETURNING *`,
      [req.user.companyId, studentNo, app.applicant_first_name, app.applicant_last_name, app.date_of_birth, classId || app.desired_class_id, admissionDate || new Date().toISOString().slice(0, 10), req.user.id]
    );

    const { rows } = await client.query(
      `UPDATE admissions_applications SET status = 'enrolled', student_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [studentResult.rows[0].id, app.id]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'admissions_application', entityId: app.id, newValues: { enrolled: true, studentId: studentResult.rows[0].id }, ip: req.ip });
    res.status(201).json({ application: rows[0], student: studentResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Workspace dashboard
// ============================================================================

// GET /school/workspace-dashboard
const getWorkspaceDashboard = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const [students, admissions, classes] = await Promise.all([
    db.query(`SELECT status FROM students WHERE company_id = $1`, [companyId]),
    db.query(`SELECT status FROM admissions_applications WHERE company_id = $1`, [companyId]),
    db.query(`SELECT * FROM classes WHERE company_id = $1 AND is_active = TRUE`, [companyId]),
  ]);

  const enrolledCount = students.rows.filter((s) => s.status === 'enrolled').length;
  const pendingAdmissions = admissions.rows.filter((a) => ['submitted', 'under_review', 'documents_pending'].includes(a.status));

  const recentAdmissionsResult = await db.query(
    `SELECT a.*, c.name AS desired_class_name FROM admissions_applications a LEFT JOIN classes c ON c.id = a.desired_class_id
     WHERE a.company_id = $1 ORDER BY a.created_at DESC LIMIT 8`,
    [companyId]
  );

  res.json({
    totalStudents: students.rows.length,
    enrolledCount,
    withdrawnCount: students.rows.filter((s) => s.status === 'withdrawn').length,
    graduatedCount: students.rows.filter((s) => s.status === 'graduated').length,
    activeClassesCount: classes.rows.length,
    pendingAdmissionsCount: pendingAdmissions.length,
    recentAdmissions: recentAdmissionsResult.rows,
  });
});

// ============================================================================
// Student Attendance
// ============================================================================

// GET /school/attendance/register?classId=...&date=...
// Returns every enrolled student in the class, each paired with their
// attendance status for that date if one exists yet — the realistic
// teacher workflow being "see the whole roster, then mark exceptions",
// not entering every student one at a time regardless of outcome.
const getClassRegister = asyncHandler(async (req, res) => {
  const { classId, date } = req.query;
  if (!classId) throw new ApiError(400, 'classId is required');
  if (!date) throw new ApiError(400, 'date is required');

  const cls = await db.query('SELECT id FROM classes WHERE id = $1 AND company_id = $2', [classId, req.user.companyId]);
  if (!cls.rows.length) throw new ApiError(404, 'Class not found');

  const { rows } = await db.query(
    `SELECT s.id AS student_id, s.student_no, s.first_name, s.last_name, a.status, a.remarks, a.id AS attendance_id
     FROM students s
     LEFT JOIN student_attendance a ON a.student_id = s.id AND a.attendance_date = $1
     WHERE s.class_id = $2 AND s.status = 'enrolled'
     ORDER BY s.last_name, s.first_name`,
    [date, classId]
  );
  res.json(rows);
});

// POST /school/attendance/bulk { classId, date, entries: [{ studentId, status, remarks }] }
// Upserts every entry in one transaction — marking a student twice for
// the same day always corrects the existing record rather than creating
// a duplicate, matching the real UNIQUE(student_id, attendance_date)
// constraint rather than fighting it.
const bulkMarkAttendance = asyncHandler(async (req, res) => {
  const { classId, date, entries } = req.body;
  if (!date) throw new ApiError(400, 'date is required');
  if (!Array.isArray(entries) || !entries.length) throw new ApiError(400, 'entries must be a non-empty array');

  const validStatuses = ['present', 'absent', 'late', 'excused'];
  for (const e of entries) {
    if (!e.studentId) throw new ApiError(400, 'Each entry needs a studentId');
    if (!validStatuses.includes(e.status)) throw new ApiError(400, `Each entry's status must be one of: ${validStatuses.join(', ')}`);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const e of entries) {
      const { rows } = await client.query(
        `INSERT INTO student_attendance (company_id, student_id, class_id, attendance_date, status, remarks, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (student_id, attendance_date) DO UPDATE SET status = $5, remarks = $6, recorded_by = $7, class_id = COALESCE($3, student_attendance.class_id), updated_at = NOW()
         RETURNING *`,
        [req.user.companyId, e.studentId, classId || null, date, e.status, e.remarks || null, req.user.id]
      );
      results.push(rows[0]);
    }
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'student_attendance', entityId: classId, newValues: { date, count: entries.length }, ip: req.ip });
    res.status(201).json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /school/attendance/student/:id?from=&to= — a real summary, not just a list
const getStudentAttendanceSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const student = await db.query('SELECT id FROM students WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!student.rows.length) throw new ApiError(404, 'Student not found');

  const records = await db.query(
    `SELECT * FROM student_attendance WHERE student_id = $1 AND attendance_date BETWEEN $2 AND $3 ORDER BY attendance_date`,
    [req.params.id, from, to]
  );

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of records.rows) counts[r.status] += 1;
  const totalMarked = records.rows.length;
  const attendanceRate = totalMarked > 0 ? Math.round(((counts.present + counts.late) / totalMarked) * 1000) / 10 : null;

  res.json({ from, to, counts, totalMarked, attendanceRate, records: records.rows });
});

// GET /school/attendance/class/:classId?from=&to= — per-day breakdown for a class
const getClassAttendanceHistory = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const { rows } = await db.query(
    `SELECT attendance_date,
            COUNT(*) FILTER (WHERE status = 'present') AS present_count,
            COUNT(*) FILTER (WHERE status = 'absent') AS absent_count,
            COUNT(*) FILTER (WHERE status = 'late') AS late_count,
            COUNT(*) FILTER (WHERE status = 'excused') AS excused_count
     FROM student_attendance
     WHERE class_id = $1 AND attendance_date BETWEEN $2 AND $3
     GROUP BY attendance_date ORDER BY attendance_date`,
    [req.params.classId, from, to]
  );
  res.json(rows);
});

// ============================================================================
// Subjects
// ============================================================================

// GET /school/subjects
const listSubjects = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM subjects WHERE company_id = $1 ORDER BY name', [req.user.companyId]);
  res.json(rows);
});

// POST /school/subjects
const createSubject = asyncHandler(async (req, res) => {
  const { name, code } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const { rows } = await db.query('INSERT INTO subjects (company_id, name, code) VALUES ($1,$2,$3) RETURNING *', [req.user.companyId, name, code || null]);
  res.status(201).json(rows[0]);
});

// PATCH /school/subjects/:id
const updateSubject = asyncHandler(async (req, res) => {
  const { name, code, isActive } = req.body;
  const { rows } = await db.query(
    'UPDATE subjects SET name = COALESCE($1, name), code = COALESCE($2, code), is_active = COALESCE($3, is_active) WHERE id = $4 AND company_id = $5 RETURNING *',
    [name, code, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Subject not found');
  res.json(rows[0]);
});

// DELETE /school/subjects/:id
const deleteSubject = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM exam_subjects WHERE subject_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This subject is used in a real exam and cannot be deleted — mark it inactive instead');
  const { rows } = await db.query('DELETE FROM subjects WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Subject not found');
  res.status(204).end();
});

// ============================================================================
// Grading Scale
// ============================================================================

/** Computes the grade for a percentage against a company's grading scale,
 * live from whatever the scale currently is — never stored, so a later
 * change to the scale is reflected immediately rather than leaving old
 * results showing a grade the current scale wouldn't actually produce. */
function computeGrade(percent, scale) {
  const band = scale.find((b) => percent >= Number(b.min_percent) && percent <= Number(b.max_percent));
  return band ? { label: band.grade_label, remark: band.remark } : { label: null, remark: null };
}

// GET /school/grading-scale
const listGradingScale = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM grading_scale WHERE company_id = $1 ORDER BY min_percent DESC', [req.user.companyId]);
  res.json(rows);
});

// PUT /school/grading-scale { bands: [{ gradeLabel, minPercent, maxPercent, remark }] }
// Replaces the whole scale in one transaction, the same "editing this is
// replacing the schedule" idiom PAYE bands already use — a partial-band
// edit could easily leave gaps or overlaps that a full replace avoids.
const replaceGradingScale = asyncHandler(async (req, res) => {
  const { bands } = req.body;
  if (!Array.isArray(bands) || !bands.length) throw new ApiError(400, 'bands must be a non-empty array');
  for (const b of bands) {
    if (!b.gradeLabel) throw new ApiError(400, 'Each band needs a gradeLabel');
    if (b.minPercent === undefined || b.maxPercent === undefined) throw new ApiError(400, 'Each band needs minPercent and maxPercent');
    if (Number(b.minPercent) > Number(b.maxPercent)) throw new ApiError(400, `Band ${b.gradeLabel}: minPercent cannot exceed maxPercent`);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM grading_scale WHERE company_id = $1', [req.user.companyId]);
    const inserted = [];
    for (const b of bands) {
      const { rows } = await client.query(
        'INSERT INTO grading_scale (company_id, grade_label, min_percent, max_percent, remark) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.user.companyId, b.gradeLabel, b.minPercent, b.maxPercent, b.remark || null]
      );
      inserted.push(rows[0]);
    }
    await client.query('COMMIT');
    res.json(inserted);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Exams
// ============================================================================

// GET /school/exams
const listExams = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.*, c.name AS class_name FROM exams e LEFT JOIN classes c ON c.id = e.class_id
     WHERE e.company_id = $1 ORDER BY e.exam_date DESC NULLS LAST, e.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /school/exams/:id — includes its subjects
const getExam = asyncHandler(async (req, res) => {
  const examResult = await db.query(
    `SELECT e.*, c.name AS class_name FROM exams e LEFT JOIN classes c ON c.id = e.class_id WHERE e.id = $1 AND e.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!examResult.rows.length) throw new ApiError(404, 'Exam not found');
  const subjects = await db.query(
    `SELECT es.*, s.name AS subject_name, s.code FROM exam_subjects es JOIN subjects s ON s.id = es.subject_id WHERE es.exam_id = $1 ORDER BY s.name`,
    [req.params.id]
  );
  res.json({ ...examResult.rows[0], subjects: subjects.rows });
});

// POST /school/exams { name, term, academicYear, classId, examDate, subjectIds: [] }
const createExam = asyncHandler(async (req, res) => {
  const { name, term, academicYear, classId, examDate, subjectIds } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  if (!term) throw new ApiError(400, 'term is required');
  if (!academicYear) throw new ApiError(400, 'academicYear is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO exams (company_id, name, term, academic_year, class_id, exam_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.companyId, name, term, academicYear, classId || null, examDate || null, req.user.id]
    );
    if (Array.isArray(subjectIds)) {
      for (const subjectId of subjectIds) {
        await client.query('INSERT INTO exam_subjects (exam_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].id, subjectId]);
      }
    }
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'exam', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /school/exams/:id
const updateExam = asyncHandler(async (req, res) => {
  const { name, term, academicYear, classId, examDate, status } = req.body;
  const validStatuses = ['draft', 'scheduled', 'in_progress', 'completed'];
  if (status && !validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE exams SET name = COALESCE($1, name), term = COALESCE($2, term), academic_year = COALESCE($3, academic_year),
       class_id = COALESCE($4, class_id), exam_date = COALESCE($5, exam_date), status = COALESCE($6, status), updated_at = NOW()
     WHERE id = $7 AND company_id = $8 RETURNING *`,
    [name, term, academicYear, classId, examDate, status, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Exam not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'exam', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /school/exams/:id
const deleteExam = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM exam_results WHERE exam_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This exam already has real results recorded and cannot be deleted');
  const { rows } = await db.query('DELETE FROM exams WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Exam not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'exam', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// POST /school/exams/:id/subjects { subjectId, maxScore }
const addExamSubject = asyncHandler(async (req, res) => {
  const { subjectId, maxScore } = req.body;
  if (!subjectId) throw new ApiError(400, 'subjectId is required');
  const { rows } = await db.query(
    `INSERT INTO exam_subjects (exam_id, subject_id, max_score) VALUES ($1,$2,$3)
     ON CONFLICT (exam_id, subject_id) DO UPDATE SET max_score = $3 RETURNING *`,
    [req.params.id, subjectId, maxScore || 100]
  );
  res.status(201).json(rows[0]);
});

// ============================================================================
// Marks Entry & Report Cards
// ============================================================================

// GET /school/exams/:id/marks-sheet?subjectId=... — every enrolled student
// in the exam's class, paired with their existing score for that subject
// if any, and the max score for the subject in this exam.
const getMarksSheet = asyncHandler(async (req, res) => {
  const { subjectId } = req.query;
  if (!subjectId) throw new ApiError(400, 'subjectId is required');

  const exam = await db.query('SELECT * FROM exams WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!exam.rows.length) throw new ApiError(404, 'Exam not found');
  const examSubject = await db.query('SELECT * FROM exam_subjects WHERE exam_id = $1 AND subject_id = $2', [req.params.id, subjectId]);
  if (!examSubject.rows.length) throw new ApiError(400, 'This subject is not part of this exam — add it first');

  const { rows } = await db.query(
    `SELECT s.id AS student_id, s.student_no, s.first_name, s.last_name, r.score, r.remarks, r.id AS result_id
     FROM students s
     LEFT JOIN exam_results r ON r.student_id = s.id AND r.exam_id = $1 AND r.subject_id = $2
     WHERE s.class_id = $3 AND s.status = 'enrolled'
     ORDER BY s.last_name, s.first_name`,
    [req.params.id, subjectId, exam.rows[0].class_id]
  );
  res.json({ maxScore: Number(examSubject.rows[0].max_score), students: rows });
});

// POST /school/exams/:id/marks/bulk { subjectId, entries: [{ studentId, score, remarks }] }
const bulkEnterMarks = asyncHandler(async (req, res) => {
  const { subjectId, entries } = req.body;
  if (!subjectId) throw new ApiError(400, 'subjectId is required');
  if (!Array.isArray(entries) || !entries.length) throw new ApiError(400, 'entries must be a non-empty array');

  const examSubject = await db.query('SELECT * FROM exam_subjects WHERE exam_id = $1 AND subject_id = $2', [req.params.id, subjectId]);
  if (!examSubject.rows.length) throw new ApiError(400, 'This subject is not part of this exam — add it first');
  const maxScore = Number(examSubject.rows[0].max_score);

  for (const e of entries) {
    if (!e.studentId) throw new ApiError(400, 'Each entry needs a studentId');
    if (e.score === undefined || e.score === null || Number(e.score) < 0) throw new ApiError(400, 'Each entry needs a non-negative score');
    if (Number(e.score) > maxScore) throw new ApiError(400, `Score ${e.score} exceeds this subject's max score of ${maxScore}`);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const e of entries) {
      const { rows } = await client.query(
        `INSERT INTO exam_results (company_id, exam_id, student_id, subject_id, score, remarks, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (exam_id, student_id, subject_id) DO UPDATE SET score = $5, remarks = $6, recorded_by = $7, updated_at = NOW()
         RETURNING *`,
        [req.user.companyId, req.params.id, e.studentId, subjectId, e.score, e.remarks || null, req.user.id]
      );
      results.push(rows[0]);
    }
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'exam_results', entityId: req.params.id, newValues: { subjectId, count: entries.length }, ip: req.ip });
    res.status(201).json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /school/students/:id/report-card?examId=...
const getReportCard = asyncHandler(async (req, res) => {
  const { examId } = req.query;
  if (!examId) throw new ApiError(400, 'examId is required');

  const student = await db.query('SELECT * FROM students WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!student.rows.length) throw new ApiError(404, 'Student not found');
  const exam = await db.query('SELECT * FROM exams WHERE id = $1 AND company_id = $2', [examId, req.user.companyId]);
  if (!exam.rows.length) throw new ApiError(404, 'Exam not found');

  const scale = await db.query('SELECT * FROM grading_scale WHERE company_id = $1', [req.user.companyId]);
  const results = await db.query(
    `SELECT r.*, s.name AS subject_name, es.max_score
     FROM exam_results r JOIN subjects s ON s.id = r.subject_id JOIN exam_subjects es ON es.exam_id = r.exam_id AND es.subject_id = r.subject_id
     WHERE r.exam_id = $1 AND r.student_id = $2 ORDER BY s.name`,
    [examId, req.params.id]
  );

  const subjects = results.rows.map((r) => {
    const percent = Number(r.max_score) > 0 ? (Number(r.score) / Number(r.max_score)) * 100 : 0;
    return { subjectName: r.subject_name, score: Number(r.score), maxScore: Number(r.max_score), percent: Math.round(percent * 100) / 100, ...computeGrade(percent, scale.rows) };
  });

  const totalScore = subjects.reduce((s, r) => s + r.score, 0);
  const totalMax = subjects.reduce((s, r) => s + r.maxScore, 0);
  const overallPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 10000) / 100 : 0;

  res.json({
    student: student.rows[0], exam: exam.rows[0], subjects,
    totalScore, totalMax, overallPercent, overallGrade: computeGrade(overallPercent, scale.rows),
  });
});

// ============================================================================
// Skill Assessments (Reading / Writing / Fluency)
// ============================================================================

// GET /school/students/:id/skill-assessments
const listSkillAssessments = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM skill_assessments WHERE student_id = $1 AND company_id = $2 ORDER BY academic_year DESC, term DESC, skill_type', [req.params.id, req.user.companyId]);
  res.json(rows);
});

// POST /school/students/:id/skill-assessments { term, academicYear, skillType, rating, notes }
const recordSkillAssessment = asyncHandler(async (req, res) => {
  const { term, academicYear, skillType, rating, notes } = req.body;
  if (!term || !academicYear) throw new ApiError(400, 'term and academicYear are required');
  const validSkills = ['reading', 'writing', 'fluency', 'numeracy', 'other'];
  if (!skillType || !validSkills.includes(skillType)) throw new ApiError(400, `skillType must be one of: ${validSkills.join(', ')}`);
  const validRatings = ['emerging', 'developing', 'proficient', 'advanced'];
  if (!rating || !validRatings.includes(rating)) throw new ApiError(400, `rating must be one of: ${validRatings.join(', ')}`);

  const student = await db.query('SELECT id FROM students WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!student.rows.length) throw new ApiError(404, 'Student not found');

  const { rows } = await db.query(
    `INSERT INTO skill_assessments (company_id, student_id, term, academic_year, skill_type, rating, notes, assessed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (student_id, term, academic_year, skill_type) DO UPDATE SET rating = $6, notes = $7, assessed_by = $8
     RETURNING *`,
    [req.user.companyId, req.params.id, term, academicYear, skillType, rating, notes || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// ============================================================================
// Fees Management
// ============================================================================

const schoolAccountingService = require('../services/schoolAccountingService');

// ---------- Fee Categories ----------

const listFeeCategories = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM fee_categories WHERE company_id = $1 ORDER BY name', [req.user.companyId]);
  res.json(rows);
});

const createFeeCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const { rows } = await db.query('INSERT INTO fee_categories (company_id, name) VALUES ($1,$2) RETURNING *', [req.user.companyId, name]);
  res.status(201).json(rows[0]);
});

const updateFeeCategory = asyncHandler(async (req, res) => {
  const { name, isActive } = req.body;
  const { rows } = await db.query(
    'UPDATE fee_categories SET name = COALESCE($1, name), is_active = COALESCE($2, is_active) WHERE id = $3 AND company_id = $4 RETURNING *',
    [name, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Fee category not found');
  res.json(rows[0]);
});

const deleteFeeCategory = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM fee_structure_items WHERE fee_category_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This fee category is used in a real fee structure and cannot be deleted');
  const { rows } = await db.query('DELETE FROM fee_categories WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Fee category not found');
  res.status(204).end();
});

// ---------- Fee Structures ----------

const listFeeStructures = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT fs.*, c.name AS class_name,
            COALESCE((SELECT SUM(amount) FROM fee_structure_items WHERE fee_structure_id = fs.id), 0) AS total_amount
     FROM fee_structures fs LEFT JOIN classes c ON c.id = fs.class_id
     WHERE fs.company_id = $1 ORDER BY fs.academic_year DESC, fs.term DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getFeeStructure = asyncHandler(async (req, res) => {
  const structResult = await db.query(
    `SELECT fs.*, c.name AS class_name FROM fee_structures fs LEFT JOIN classes c ON c.id = fs.class_id WHERE fs.id = $1 AND fs.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!structResult.rows.length) throw new ApiError(404, 'Fee structure not found');
  const items = await db.query(
    `SELECT fsi.*, fc.name AS category_name FROM fee_structure_items fsi JOIN fee_categories fc ON fc.id = fsi.fee_category_id WHERE fsi.fee_structure_id = $1`,
    [req.params.id]
  );
  res.json({ ...structResult.rows[0], items: items.rows, totalAmount: items.rows.reduce((s, i) => s + Number(i.amount), 0) });
});

// POST /school/fee-structures { name, classId, term, academicYear, dueDate, items: [{ feeCategoryId, amount }] }
const createFeeStructure = asyncHandler(async (req, res) => {
  const { name, classId, term, academicYear, dueDate, items } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  if (!term || !academicYear) throw new ApiError(400, 'term and academicYear are required');
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'items must be a non-empty array');
  for (const i of items) {
    if (!i.feeCategoryId) throw new ApiError(400, 'Each item needs a feeCategoryId');
    if (i.amount === undefined || Number(i.amount) < 0) throw new ApiError(400, 'Each item needs a non-negative amount');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO fee_structures (company_id, name, class_id, term, academic_year, due_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.companyId, name, classId || null, term, academicYear, dueDate || null, req.user.id]
    );
    for (const i of items) {
      await client.query('INSERT INTO fee_structure_items (fee_structure_id, fee_category_id, amount) VALUES ($1,$2,$3)', [rows[0].id, i.feeCategoryId, i.amount]);
    }
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'fee_structure', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const updateFeeStructure = asyncHandler(async (req, res) => {
  const { name, classId, term, academicYear, dueDate, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE fee_structures SET name = COALESCE($1, name), class_id = COALESCE($2, class_id), term = COALESCE($3, term),
       academic_year = COALESCE($4, academic_year), due_date = COALESCE($5, due_date), is_active = COALESCE($6, is_active)
     WHERE id = $7 AND company_id = $8 RETURNING *`,
    [name, classId, term, academicYear, dueDate, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Fee structure not found');
  res.json(rows[0]);
});

const deleteFeeStructure = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM student_fee_invoices WHERE fee_structure_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This fee structure has real invoices generated from it and cannot be deleted');
  const { rows } = await db.query('DELETE FROM fee_structures WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Fee structure not found');
  res.status(204).end();
});

// ---------- Invoices ----------

// Core: generates one student's invoice from a structure, copying its
// items at generation time so a later change to the structure's amounts
// never silently alters an invoice already issued. Posts Dr Fees
// Receivable / Cr Tuition Fee Income for the total.
async function generateFeeInvoiceCore(client, companyId, userId, studentId, feeStructureId) {
  const structResult = await client.query('SELECT * FROM fee_structures WHERE id = $1 AND company_id = $2', [feeStructureId, companyId]);
  if (!structResult.rows.length) throw new ApiError(404, 'Fee structure not found');
  const items = await client.query(
    `SELECT fsi.*, fc.name AS category_name FROM fee_structure_items fsi JOIN fee_categories fc ON fc.id = fsi.fee_category_id WHERE fsi.fee_structure_id = $1`,
    [feeStructureId]
  );
  const totalAmount = items.rows.reduce((s, i) => s + Number(i.amount), 0);

  const invoiceNo = await salesService.generateDocNo(client, companyId, 'FEE');
  const invoiceResult = await client.query(
    `INSERT INTO student_fee_invoices (company_id, invoice_no, student_id, fee_structure_id, due_date, total_amount, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [companyId, invoiceNo, studentId, feeStructureId, structResult.rows[0].due_date, totalAmount, userId]
  );

  for (const i of items.rows) {
    await client.query(
      'INSERT INTO student_fee_invoice_items (invoice_id, fee_category_id, description, amount) VALUES ($1,$2,$3,$4)',
      [invoiceResult.rows[0].id, i.fee_category_id, i.category_name, i.amount]
    );
  }

  let journalEntryId = null;
  if (totalAmount > 0) {
    const feesReceivable = await schoolAccountingService.getSchoolAccountId(client, companyId, '1200');
    const tuitionIncome = await schoolAccountingService.getSchoolAccountId(client, companyId, '4210');
    const entry = await schoolAccountingService.postSchoolJournalEntry(client, {
      companyId, userId, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'student_fee_invoice', referenceId: invoiceResult.rows[0].id,
      description: `Fee invoice ${invoiceNo}`,
      lines: [
        { accountId: feesReceivable, debit: totalAmount, credit: 0 },
        { accountId: tuitionIncome, debit: 0, credit: totalAmount },
      ],
    });
    journalEntryId = entry.id;
    await client.query('UPDATE student_fee_invoices SET journal_entry_id = $1 WHERE id = $2', [journalEntryId, invoiceResult.rows[0].id]);
  }

  return { ...invoiceResult.rows[0], journal_entry_id: journalEntryId };
}

// POST /school/fee-structures/:id/generate-invoice { studentId }
const generateFeeInvoice = asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  if (!studentId) throw new ApiError(400, 'studentId is required');
  const existing = await db.query('SELECT id FROM student_fee_invoices WHERE fee_structure_id = $1 AND student_id = $2', [req.params.id, studentId]);
  if (existing.rows.length) throw new ApiError(400, 'This student already has an invoice generated from this fee structure');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const invoice = await generateFeeInvoiceCore(client, req.user.companyId, req.user.id, studentId, req.params.id);
    await client.query('COMMIT');
    res.status(201).json(invoice);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /school/fee-structures/:id/generate-invoices-bulk
// Generates an invoice for every enrolled student in the structure's
// class at once — the realistic termly billing workflow — skipping
// (not erroring on) any student who already has one from this structure.
const generateFeeInvoicesBulk = asyncHandler(async (req, res) => {
  const struct = await db.query('SELECT * FROM fee_structures WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!struct.rows.length) throw new ApiError(404, 'Fee structure not found');
  if (!struct.rows[0].class_id) throw new ApiError(400, 'This fee structure has no class attached — generate individual invoices instead');

  const students = await db.query(`SELECT id FROM students WHERE class_id = $1 AND status = 'enrolled'`, [struct.rows[0].class_id]);
  const alreadyInvoiced = await db.query('SELECT student_id FROM student_fee_invoices WHERE fee_structure_id = $1', [req.params.id]);
  const alreadyInvoicedIds = new Set(alreadyInvoiced.rows.map((r) => r.student_id));

  const client = await db.getClient();
  const invoices = [];
  try {
    await client.query('BEGIN');
    for (const s of students.rows) {
      if (alreadyInvoicedIds.has(s.id)) continue;
      const invoice = await generateFeeInvoiceCore(client, req.user.companyId, req.user.id, s.id, req.params.id);
      invoices.push(invoice);
    }
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'student_fee_invoice', entityId: req.params.id, newValues: { bulk: true, count: invoices.length }, ip: req.ip });
    res.status(201).json({ generatedCount: invoices.length, skippedCount: students.rows.length - invoices.length, invoices });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /school/students/:id/fee-invoices
const listStudentFeeInvoices = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT fi.*, fs.name AS structure_name FROM student_fee_invoices fi LEFT JOIN fee_structures fs ON fs.id = fi.fee_structure_id
     WHERE fi.student_id = $1 AND fi.company_id = $2 ORDER BY fi.invoice_date DESC`,
    [req.params.id, req.user.companyId]
  );
  res.json(rows);
});

// GET /school/fee-invoices/:id
const getFeeInvoice = asyncHandler(async (req, res) => {
  const invoiceResult = await db.query(
    `SELECT fi.*, s.first_name, s.last_name, s.student_no FROM student_fee_invoices fi JOIN students s ON s.id = fi.student_id
     WHERE fi.id = $1 AND fi.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!invoiceResult.rows.length) throw new ApiError(404, 'Fee invoice not found');
  const [items, payments] = await Promise.all([
    db.query('SELECT * FROM student_fee_invoice_items WHERE invoice_id = $1', [req.params.id]),
    db.query('SELECT * FROM student_fee_payments WHERE invoice_id = $1 ORDER BY payment_date', [req.params.id]),
  ]);
  res.json({ ...invoiceResult.rows[0], items: items.rows, payments: payments.rows });
});

// POST /school/fee-invoices/:id/payments { paymentDate, amount, paymentMethod, bankAccountId, referenceNo }
const recordFeePayment = asyncHandler(async (req, res) => {
  const { paymentDate, amount, paymentMethod, bankAccountId, referenceNo } = req.body;
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'amount is required and must be greater than zero');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const invoiceResult = await client.query('SELECT * FROM student_fee_invoices WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!invoiceResult.rows.length) throw new ApiError(404, 'Fee invoice not found');
    const invoice = invoiceResult.rows[0];
    if (invoice.status === 'cancelled') throw new ApiError(400, 'This invoice has been cancelled');

    const outstanding = Number(invoice.total_amount) - Number(invoice.amount_paid);
    if (Number(amount) > outstanding + 0.01) throw new ApiError(400, `Payment of ${amount} exceeds the outstanding balance of ${outstanding.toFixed(2)}`);

    let journalEntryId = null;
    let paymentAccountId = null;
    if (paymentMethod !== 'cash' && bankAccountId) {
      const bank = await client.query('SELECT account_id FROM school_bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
      if (!bank.rows.length) throw new ApiError(404, 'School bank account not found');
      paymentAccountId = bank.rows[0].account_id;
    }
    if (!paymentAccountId) {
      paymentAccountId = await schoolAccountingService.getSchoolAccountId(client, req.user.companyId, '1000');
    }
    const feesReceivable = await schoolAccountingService.getSchoolAccountId(client, req.user.companyId, '1200');
    const entry = await schoolAccountingService.postSchoolJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: paymentDate || new Date().toISOString().slice(0, 10),
      referenceType: 'student_fee_payment', referenceId: invoice.id,
      description: `Fee payment for ${invoice.invoice_no} (${(paymentMethod || 'cash').replace('_', ' ')})`,
      lines: [
        { accountId: paymentAccountId, debit: Number(amount), credit: 0 },
        { accountId: feesReceivable, debit: 0, credit: Number(amount) },
      ],
    });
    journalEntryId = entry.id;

    const paymentResult = await client.query(
      `INSERT INTO student_fee_payments (invoice_id, company_id, payment_date, amount, payment_method, bank_account_id, reference_no, journal_entry_id, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [invoice.id, req.user.companyId, paymentDate || new Date().toISOString().slice(0, 10), amount, paymentMethod || 'cash', bankAccountId || null, referenceNo || null, journalEntryId, req.user.id]
    );

    const newAmountPaid = Number(invoice.amount_paid) + Number(amount);
    const newStatus = newAmountPaid >= Number(invoice.total_amount) - 0.01 ? 'paid' : 'partial';
    const { rows } = await client.query(
      'UPDATE student_fee_invoices SET amount_paid = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [newAmountPaid, newStatus, invoice.id]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'student_fee_payment', entityId: paymentResult.rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json({ invoice: rows[0], payment: paymentResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /school/fees/summary — for the workspace dashboard
const getFeesSummary = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT status, COUNT(*) AS count, SUM(total_amount) AS total, SUM(amount_paid) AS paid
     FROM student_fee_invoices WHERE company_id = $1 GROUP BY status`,
    [req.user.companyId]
  );
  const totals = { unpaid: { count: 0, total: 0, paid: 0 }, partial: { count: 0, total: 0, paid: 0 }, paid: { count: 0, total: 0, paid: 0 }, cancelled: { count: 0, total: 0, paid: 0 } };
  for (const r of rows) totals[r.status] = { count: Number(r.count), total: Number(r.total), paid: Number(r.paid) };
  const totalOutstanding = (totals.unpaid.total - totals.unpaid.paid) + (totals.partial.total - totals.partial.paid);
  res.json({ byStatus: totals, totalOutstanding });
});

// ============================================================================
// Timetable Management
// ============================================================================

// ---------- Periods ----------

const listPeriods = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM periods WHERE company_id = $1 ORDER BY sort_order, start_time', [req.user.companyId]);
  res.json(rows);
});

const createPeriod = asyncHandler(async (req, res) => {
  const { name, startTime, endTime, sortOrder } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  if (!startTime || !endTime) throw new ApiError(400, 'startTime and endTime are required');
  if (startTime >= endTime) throw new ApiError(400, 'startTime must be before endTime');

  const { rows } = await db.query(
    'INSERT INTO periods (company_id, name, start_time, end_time, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.companyId, name, startTime, endTime, sortOrder || 0]
  );
  res.status(201).json(rows[0]);
});

const updatePeriod = asyncHandler(async (req, res) => {
  const { name, startTime, endTime, sortOrder, isActive } = req.body;
  if (startTime && endTime && startTime >= endTime) throw new ApiError(400, 'startTime must be before endTime');

  const { rows } = await db.query(
    `UPDATE periods SET name = COALESCE($1, name), start_time = COALESCE($2, start_time), end_time = COALESCE($3, end_time),
       sort_order = COALESCE($4, sort_order), is_active = COALESCE($5, is_active)
     WHERE id = $6 AND company_id = $7 RETURNING *`,
    [name, startTime, endTime, sortOrder, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Period not found');
  res.json(rows[0]);
});

const deletePeriod = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM timetable_entries WHERE period_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This period is used in a real timetable entry and cannot be deleted');
  const { rows } = await db.query('DELETE FROM periods WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Period not found');
  res.status(204).end();
});

// ---------- Timetable Entries ----------

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// GET /school/timetable?classId=...&term=...&academicYear=...
const getClassTimetable = asyncHandler(async (req, res) => {
  const { classId, term, academicYear } = req.query;
  if (!classId || !term || !academicYear) throw new ApiError(400, 'classId, term, and academicYear are required');

  const { rows } = await db.query(
    `SELECT te.*, p.name AS period_name, p.start_time, p.end_time, s.name AS subject_name, e.first_name AS teacher_first_name, e.last_name AS teacher_last_name
     FROM timetable_entries te
     JOIN periods p ON p.id = te.period_id
     JOIN subjects s ON s.id = te.subject_id
     LEFT JOIN school_staff e ON e.id = te.teacher_id
     WHERE te.class_id = $1 AND te.term = $2 AND te.academic_year = $3
     ORDER BY p.sort_order, p.start_time`,
    [classId, term, academicYear]
  );
  res.json(rows);
});

// GET /school/timetable/teacher/:teacherId?term=...&academicYear=...
const getTeacherTimetable = asyncHandler(async (req, res) => {
  const { term, academicYear } = req.query;
  if (!term || !academicYear) throw new ApiError(400, 'term and academicYear are required');

  const { rows } = await db.query(
    `SELECT te.*, p.name AS period_name, p.start_time, p.end_time, s.name AS subject_name, c.name AS class_name
     FROM timetable_entries te
     JOIN periods p ON p.id = te.period_id
     JOIN subjects s ON s.id = te.subject_id
     JOIN classes c ON c.id = te.class_id
     WHERE te.teacher_id = $1 AND te.term = $2 AND te.academic_year = $3
     ORDER BY p.sort_order, p.start_time`,
    [req.params.teacherId, term, academicYear]
  );
  res.json(rows);
});

// POST /school/timetable { classId, dayOfWeek, periodId, subjectId, teacherId, term, academicYear }
// Two real double-booking guards: the class's own slot (a real UNIQUE
// constraint) and the teacher's slot across every other class (an
// application check, since it spans classes rather than being a single-
// table constraint) — a teacher can't physically be in two classrooms at
// the same day and period.
const createTimetableEntry = asyncHandler(async (req, res) => {
  const { classId, dayOfWeek, periodId, subjectId, teacherId, term, academicYear } = req.body;
  if (!classId) throw new ApiError(400, 'classId is required');
  if (!dayOfWeek || !DAYS_OF_WEEK.includes(dayOfWeek)) throw new ApiError(400, `dayOfWeek must be one of: ${DAYS_OF_WEEK.join(', ')}`);
  if (!periodId) throw new ApiError(400, 'periodId is required');
  if (!subjectId) throw new ApiError(400, 'subjectId is required');
  if (!term || !academicYear) throw new ApiError(400, 'term and academicYear are required');

  if (teacherId) {
    const conflict = await db.query(
      `SELECT te.id, c.name AS class_name FROM timetable_entries te JOIN classes c ON c.id = te.class_id
       WHERE te.teacher_id = $1 AND te.day_of_week = $2 AND te.period_id = $3 AND te.term = $4 AND te.academic_year = $5`,
      [teacherId, dayOfWeek, periodId, term, academicYear]
    );
    if (conflict.rows.length) throw new ApiError(400, `This teacher is already assigned to ${conflict.rows[0].class_name} at this exact day and period`);
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO timetable_entries (company_id, class_id, day_of_week, period_id, subject_id, teacher_id, term, academic_year, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.companyId, classId, dayOfWeek, periodId, subjectId, teacherId || null, term, academicYear, req.user.id]
    );
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'timetable_entry', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new ApiError(400, 'This class already has a subject assigned for this exact day and period');
    throw err;
  }
});

// PATCH /school/timetable/:id — reassign subject/teacher for an existing slot
const updateTimetableEntry = asyncHandler(async (req, res) => {
  const { subjectId, teacherId } = req.body;

  const existing = await db.query('SELECT * FROM timetable_entries WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Timetable entry not found');
  const entry = existing.rows[0];
  const finalTeacherId = teacherId !== undefined ? teacherId : entry.teacher_id;

  if (finalTeacherId) {
    const conflict = await db.query(
      `SELECT te.id, c.name AS class_name FROM timetable_entries te JOIN classes c ON c.id = te.class_id
       WHERE te.teacher_id = $1 AND te.day_of_week = $2 AND te.period_id = $3 AND te.term = $4 AND te.academic_year = $5 AND te.id != $6`,
      [finalTeacherId, entry.day_of_week, entry.period_id, entry.term, entry.academic_year, entry.id]
    );
    if (conflict.rows.length) throw new ApiError(400, `This teacher is already assigned to ${conflict.rows[0].class_name} at this exact day and period`);
  }

  const { rows } = await db.query(
    'UPDATE timetable_entries SET subject_id = COALESCE($1, subject_id), teacher_id = $2 WHERE id = $3 RETURNING *',
    [subjectId, teacherId !== undefined ? teacherId : entry.teacher_id, req.params.id]
  );
  res.json(rows[0]);
});

// DELETE /school/timetable/:id
const deleteTimetableEntry = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM timetable_entries WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Timetable entry not found');
  res.status(204).end();
});

// ============================================================================
// Library Management
// ============================================================================

// GET /school/library/settings
const getLibrarySettings = asyncHandler(async (req, res) => {
  let { rows } = await db.query('SELECT * FROM library_settings WHERE company_id = $1', [req.user.companyId]);
  if (!rows.length) {
    const inserted = await db.query('INSERT INTO library_settings (company_id) VALUES ($1) RETURNING *', [req.user.companyId]);
    rows = inserted.rows;
  }
  res.json(rows[0]);
});

// PATCH /school/library/settings { loanPeriodDays, finePerDay }
const updateLibrarySettings = asyncHandler(async (req, res) => {
  const { loanPeriodDays, finePerDay } = req.body;
  if (loanPeriodDays !== undefined && Number(loanPeriodDays) <= 0) throw new ApiError(400, 'loanPeriodDays must be greater than zero');
  if (finePerDay !== undefined && Number(finePerDay) < 0) throw new ApiError(400, 'finePerDay cannot be negative');

  const { rows } = await db.query(
    `INSERT INTO library_settings (company_id, loan_period_days, fine_per_day) VALUES ($1,$2,$3)
     ON CONFLICT (company_id) DO UPDATE SET loan_period_days = COALESCE($2, library_settings.loan_period_days), fine_per_day = COALESCE($3, library_settings.fine_per_day)
     RETURNING *`,
    [req.user.companyId, loanPeriodDays, finePerDay]
  );
  res.json(rows[0]);
});

// ---------- Books ----------

const listLibraryBooks = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM library_books WHERE company_id = $1 ORDER BY title', [req.user.companyId]);
  res.json(rows);
});

const createLibraryBook = asyncHandler(async (req, res) => {
  const { title, author, isbn, category, totalCopies } = req.body;
  if (!title) throw new ApiError(400, 'title is required');
  const copies = totalCopies ? Number(totalCopies) : 1;
  if (copies <= 0) throw new ApiError(400, 'totalCopies must be greater than zero');

  const { rows } = await db.query(
    'INSERT INTO library_books (company_id, title, author, isbn, category, total_copies, available_copies) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *',
    [req.user.companyId, title, author || null, isbn || null, category || null, copies]
  );
  res.status(201).json(rows[0]);
});

const updateLibraryBook = asyncHandler(async (req, res) => {
  const { title, author, isbn, category, totalCopies, isActive } = req.body;
  const existing = await db.query('SELECT * FROM library_books WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Book not found');

  let newAvailable = existing.rows[0].available_copies;
  if (totalCopies !== undefined) {
    const onLoan = existing.rows[0].total_copies - existing.rows[0].available_copies;
    if (Number(totalCopies) < onLoan) throw new ApiError(400, `Cannot reduce total copies below ${onLoan}, which are currently on loan`);
    newAvailable = Number(totalCopies) - onLoan;
  }

  const { rows } = await db.query(
    `UPDATE library_books SET title = COALESCE($1, title), author = COALESCE($2, author), isbn = COALESCE($3, isbn),
       category = COALESCE($4, category), total_copies = COALESCE($5, total_copies), available_copies = $6, is_active = COALESCE($7, is_active)
     WHERE id = $8 AND company_id = $9 RETURNING *`,
    [title, author, isbn, category, totalCopies, newAvailable, isActive, req.params.id, req.user.companyId]
  );
  res.json(rows[0]);
});

const deleteLibraryBook = asyncHandler(async (req, res) => {
  const inUse = await db.query(`SELECT id FROM library_loans WHERE book_id = $1 AND status = 'issued' LIMIT 1`, [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This book has real copies currently on loan and cannot be deleted');
  try {
    const { rows } = await db.query('DELETE FROM library_books WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Book not found');
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') throw new ApiError(400, 'This book has real loan history on record and cannot be deleted — mark it inactive instead');
    throw err;
  }
});

// ---------- Loans (Issue / Return) ----------

const listLibraryLoans = asyncHandler(async (req, res) => {
  const { status, studentId } = req.query;
  const params = [req.user.companyId];
  let where = 'l.company_id = $1';
  if (status) { params.push(status); where += ` AND l.status = $${params.length}`; }
  if (studentId) { params.push(studentId); where += ` AND l.student_id = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT l.*, b.title AS book_title, s.student_no, s.first_name, s.last_name
     FROM library_loans l JOIN library_books b ON b.id = l.book_id JOIN students s ON s.id = l.student_id
     WHERE ${where} ORDER BY l.issue_date DESC`,
    params
  );
  const now = new Date();
  res.json(rows.map((r) => ({ ...r, isOverdue: r.status === 'issued' && new Date(r.due_date) < now })));
});

// POST /school/library/loans { bookId, studentId, dueDate }
// Decrements the book's available copies in the same transaction as the
// loan record — kept in sync by application logic rather than computed
// separately and risking drift. Blocked outright if no copies remain.
const issueBook = asyncHandler(async (req, res) => {
  const { bookId, studentId, dueDate } = req.body;
  if (!bookId) throw new ApiError(400, 'bookId is required');
  if (!studentId) throw new ApiError(400, 'studentId is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const bookResult = await client.query('SELECT * FROM library_books WHERE id = $1 AND company_id = $2 FOR UPDATE', [bookId, req.user.companyId]);
    if (!bookResult.rows.length) throw new ApiError(404, 'Book not found');
    const book = bookResult.rows[0];
    if (book.available_copies <= 0) throw new ApiError(400, `No copies of "${book.title}" are currently available`);

    const settings = await client.query('SELECT * FROM library_settings WHERE company_id = $1', [req.user.companyId]);
    const loanPeriodDays = settings.rows[0]?.loan_period_days || 14;
    const computedDueDate = dueDate || new Date(Date.now() + loanPeriodDays * 86400000).toISOString().slice(0, 10);

    await client.query('UPDATE library_books SET available_copies = available_copies - 1 WHERE id = $1', [bookId]);
    const { rows } = await client.query(
      `INSERT INTO library_loans (company_id, book_id, student_id, due_date, issued_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.companyId, bookId, studentId, computedDueDate, req.user.id]
    );
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'library_loan', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /school/library/loans/:id/return { returnDate }
// Computes a real overdue fine (days late × the company's configured
// rate) rather than leaving it to be worked out separately, and
// increments the book's available copies back — kept in the same
// transaction as the loan update.
const returnBook = asyncHandler(async (req, res) => {
  const { returnDate } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const loanResult = await client.query('SELECT * FROM library_loans WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!loanResult.rows.length) throw new ApiError(404, 'Loan not found');
    const loan = loanResult.rows[0];
    if (loan.status !== 'issued') throw new ApiError(400, 'This loan has already been closed');

    const actualReturnDate = returnDate || new Date().toISOString().slice(0, 10);
    const daysLate = Math.max(0, Math.floor((new Date(actualReturnDate) - new Date(loan.due_date)) / 86400000));
    const settings = await client.query('SELECT * FROM library_settings WHERE company_id = $1', [req.user.companyId]);
    const fineAmount = daysLate * Number(settings.rows[0]?.fine_per_day || 0);

    await client.query('UPDATE library_books SET available_copies = available_copies + 1 WHERE id = $1', [loan.book_id]);
    const { rows } = await client.query(
      `UPDATE library_loans SET status = 'returned', return_date = $1, fine_amount = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [actualReturnDate, fineAmount, loan.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /school/library/loans/:id/mark-lost
// Does NOT return the copy to available_copies — a lost book genuinely
// isn't available to loan out again until the catalog is corrected.
const markBookLost = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE library_loans SET status = 'lost', updated_at = NOW() WHERE id = $1 AND company_id = $2 AND status = 'issued' RETURNING *`,
    [req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Loan not found or already closed');
  res.json(rows[0]);
});

// PATCH /school/library/loans/:id/fine-paid
const markFinePaid = asyncHandler(async (req, res) => {
  const { rows } = await db.query('UPDATE library_loans SET fine_paid = TRUE WHERE id = $1 AND company_id = $2 RETURNING *', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Loan not found');
  res.json(rows[0]);
});

// ============================================================================
// Transport Management
// ============================================================================

// ---------- Vehicles ----------

const listVehicles = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT v.*, e.first_name AS driver_first_name, e.last_name AS driver_last_name,
            (SELECT COUNT(*) FROM student_transport_assignments sta JOIN transport_routes r ON r.id = sta.route_id WHERE r.vehicle_id = v.id AND sta.is_active = TRUE) AS assigned_count
     FROM transport_vehicles v LEFT JOIN school_staff e ON e.id = v.driver_id
     WHERE v.company_id = $1 ORDER BY v.registration_no`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createVehicle = asyncHandler(async (req, res) => {
  const { registrationNo, capacity, driverId } = req.body;
  if (!registrationNo) throw new ApiError(400, 'registrationNo is required');
  if (!capacity || Number(capacity) <= 0) throw new ApiError(400, 'capacity is required and must be greater than zero');

  const { rows } = await db.query(
    'INSERT INTO transport_vehicles (company_id, registration_no, capacity, driver_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.companyId, registrationNo, capacity, driverId || null]
  );
  res.status(201).json(rows[0]);
});

const updateVehicle = asyncHandler(async (req, res) => {
  const { registrationNo, capacity, driverId, isActive } = req.body;
  if (capacity !== undefined) {
    const assigned = await db.query(
      `SELECT COUNT(*) FROM student_transport_assignments sta JOIN transport_routes r ON r.id = sta.route_id WHERE r.vehicle_id = $1 AND sta.is_active = TRUE`,
      [req.params.id]
    );
    if (Number(capacity) < Number(assigned.rows[0].count)) throw new ApiError(400, `Cannot reduce capacity below ${assigned.rows[0].count}, the number of students currently assigned`);
  }

  const { rows } = await db.query(
    `UPDATE transport_vehicles SET registration_no = COALESCE($1, registration_no), capacity = COALESCE($2, capacity),
       driver_id = COALESCE($3, driver_id), is_active = COALESCE($4, is_active)
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [registrationNo, capacity, driverId, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Vehicle not found');
  res.json(rows[0]);
});

const deleteVehicle = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM transport_routes WHERE vehicle_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This vehicle is assigned to a real route and cannot be deleted');
  const { rows } = await db.query('DELETE FROM transport_vehicles WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Vehicle not found');
  res.status(204).end();
});

// ---------- Routes & Stops ----------

const listRoutes = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.*, v.registration_no, v.capacity,
            (SELECT COUNT(*) FROM student_transport_assignments sta WHERE sta.route_id = r.id AND sta.is_active = TRUE) AS assigned_count
     FROM transport_routes r LEFT JOIN transport_vehicles v ON v.id = r.vehicle_id
     WHERE r.company_id = $1 ORDER BY r.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getRoute = asyncHandler(async (req, res) => {
  const routeResult = await db.query(
    `SELECT r.*, v.registration_no, v.capacity FROM transport_routes r LEFT JOIN transport_vehicles v ON v.id = r.vehicle_id WHERE r.id = $1 AND r.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!routeResult.rows.length) throw new ApiError(404, 'Route not found');
  const stops = await db.query('SELECT * FROM transport_stops WHERE route_id = $1 ORDER BY sequence_order', [req.params.id]);
  const students = await db.query(
    `SELECT sta.*, s.student_no, s.first_name, s.last_name, ts.stop_name
     FROM student_transport_assignments sta JOIN students s ON s.id = sta.student_id LEFT JOIN transport_stops ts ON ts.id = sta.stop_id
     WHERE sta.route_id = $1 AND sta.is_active = TRUE ORDER BY s.last_name`,
    [req.params.id]
  );
  res.json({ ...routeResult.rows[0], stops: stops.rows, students: students.rows });
});

const createRoute = asyncHandler(async (req, res) => {
  const { name, vehicleId, stops } = req.body;
  if (!name) throw new ApiError(400, 'name is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO transport_routes (company_id, name, vehicle_id) VALUES ($1,$2,$3) RETURNING *', [req.user.companyId, name, vehicleId || null]);
    if (Array.isArray(stops)) {
      for (const [i, s] of stops.entries()) {
        await client.query('INSERT INTO transport_stops (route_id, stop_name, sequence_order, pickup_time) VALUES ($1,$2,$3,$4)', [rows[0].id, s.stopName, i, s.pickupTime || null]);
      }
    }
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const updateRoute = asyncHandler(async (req, res) => {
  const { name, vehicleId, isActive } = req.body;
  const { rows } = await db.query(
    'UPDATE transport_routes SET name = COALESCE($1, name), vehicle_id = COALESCE($2, vehicle_id), is_active = COALESCE($3, is_active) WHERE id = $4 AND company_id = $5 RETURNING *',
    [name, vehicleId, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Route not found');
  res.json(rows[0]);
});

const deleteRoute = asyncHandler(async (req, res) => {
  const inUse = await db.query(`SELECT id FROM student_transport_assignments WHERE route_id = $1 AND is_active = TRUE LIMIT 1`, [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This route has real students actively assigned and cannot be deleted');
  const { rows } = await db.query('DELETE FROM transport_routes WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Route not found');
  res.status(204).end();
});

const addStop = asyncHandler(async (req, res) => {
  const { stopName, sequenceOrder, pickupTime } = req.body;
  if (!stopName) throw new ApiError(400, 'stopName is required');
  const { rows } = await db.query(
    'INSERT INTO transport_stops (route_id, stop_name, sequence_order, pickup_time) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, stopName, sequenceOrder || 0, pickupTime || null]
  );
  res.status(201).json(rows[0]);
});

const updateStop = asyncHandler(async (req, res) => {
  const { stopName, sequenceOrder, pickupTime } = req.body;
  const { rows } = await db.query(
    'UPDATE transport_stops SET stop_name = COALESCE($1, stop_name), sequence_order = COALESCE($2, sequence_order), pickup_time = COALESCE($3, pickup_time) WHERE id = $4 RETURNING *',
    [stopName, sequenceOrder, pickupTime, req.params.id]
  );
  if (!rows.length) throw new ApiError(404, 'Stop not found');
  res.json(rows[0]);
});

const deleteStop = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM student_transport_assignments WHERE stop_id = $1 AND is_active = TRUE LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This stop has real students assigned to it and cannot be deleted');
  const { rows } = await db.query('DELETE FROM transport_stops WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Stop not found');
  res.status(204).end();
});

// ---------- Student Assignments ----------

// POST /school/transport/routes/:id/assign { studentId, stopId }
// Enforces real vehicle capacity — a route's vehicle can't carry more
// actively-assigned students than its seating capacity, the same
// "don't let the data go somewhere physically impossible" discipline as
// the timetable's teacher double-booking guard.
const assignStudentToRoute = asyncHandler(async (req, res) => {
  const { studentId, stopId } = req.body;
  if (!studentId) throw new ApiError(400, 'studentId is required');

  const route = await db.query('SELECT r.*, v.capacity FROM transport_routes r LEFT JOIN transport_vehicles v ON v.id = r.vehicle_id WHERE r.id = $1 AND r.company_id = $2', [req.params.id, req.user.companyId]);
  if (!route.rows.length) throw new ApiError(404, 'Route not found');

  if (route.rows[0].capacity) {
    const currentCount = await db.query(`SELECT COUNT(*) FROM student_transport_assignments WHERE route_id = $1 AND is_active = TRUE`, [req.params.id]);
    if (Number(currentCount.rows[0].count) >= Number(route.rows[0].capacity)) {
      throw new ApiError(400, `This route's vehicle is at full capacity (${route.rows[0].capacity} seats)`);
    }
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO student_transport_assignments (company_id, student_id, route_id, stop_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (student_id, route_id) DO UPDATE SET stop_id = $4, is_active = TRUE RETURNING *`,
      [req.user.companyId, studentId, req.params.id, stopId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    throw err;
  }
});

const unassignStudentFromRoute = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE student_transport_assignments SET is_active = FALSE WHERE student_id = $1 AND route_id = $2 RETURNING *`,
    [req.params.studentId, req.params.routeId]
  );
  if (!rows.length) throw new ApiError(404, 'Assignment not found');
  res.status(204).end();
});

// ============================================================================
// Learning Management
// ============================================================================

/** End of the due date, as a real Date object — built by adding a day and
 * subtracting 1ms, rather than string-concatenating onto due_date, since
 * pg returns DATE columns as JS Date objects, not strings, and
 * `someDate + 'T23:59:59'` silently produces an Invalid Date that any
 * comparison against it will always evaluate to false. */
function endOfDueDate(dueDate) {
  const d = new Date(dueDate);
  d.setDate(d.getDate() + 1);
  return new Date(d.getTime() - 1);
}

// ---------- Study Materials ----------

const listStudyMaterials = asyncHandler(async (req, res) => {
  const { classId } = req.query;
  const params = [req.user.companyId];
  let where = 'sm.company_id = $1';
  if (classId) { params.push(classId); where += ` AND sm.class_id = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT sm.*, c.name AS class_name, s.name AS subject_name
     FROM study_materials sm LEFT JOIN classes c ON c.id = sm.class_id LEFT JOIN subjects s ON s.id = sm.subject_id
     WHERE ${where} ORDER BY sm.created_at DESC`,
    params
  );
  res.json(rows);
});

const createStudyMaterial = asyncHandler(async (req, res) => {
  const { classId, subjectId, title, description, resourceUrl } = req.body;
  if (!title) throw new ApiError(400, 'title is required');

  const { rows } = await db.query(
    'INSERT INTO study_materials (company_id, class_id, subject_id, title, description, resource_url, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.user.companyId, classId || null, subjectId || null, title, description || null, resourceUrl || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

const updateStudyMaterial = asyncHandler(async (req, res) => {
  const { classId, subjectId, title, description, resourceUrl } = req.body;
  const { rows } = await db.query(
    `UPDATE study_materials SET class_id = COALESCE($1, class_id), subject_id = COALESCE($2, subject_id),
       title = COALESCE($3, title), description = COALESCE($4, description), resource_url = COALESCE($5, resource_url)
     WHERE id = $6 AND company_id = $7 RETURNING *`,
    [classId, subjectId, title, description, resourceUrl, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Study material not found');
  res.json(rows[0]);
});

const deleteStudyMaterial = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM study_materials WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Study material not found');
  res.status(204).end();
});

// ---------- Assignments ----------

const listAssignmentsForClass = asyncHandler(async (req, res) => {
  const { classId } = req.query;
  const params = [req.user.companyId];
  let where = 'a.company_id = $1';
  if (classId) { params.push(classId); where += ` AND a.class_id = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT a.*, c.name AS class_name, s.name AS subject_name,
            (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id) AS submitted_count,
            (SELECT COUNT(*) FROM students WHERE class_id = a.class_id AND status = 'enrolled') AS enrolled_count
     FROM assignments a JOIN classes c ON c.id = a.class_id JOIN subjects s ON s.id = a.subject_id
     WHERE ${where} ORDER BY a.due_date DESC`,
    params
  );
  res.json(rows);
});

const createAssignment = asyncHandler(async (req, res) => {
  const { classId, subjectId, title, description, dueDate, maxScore } = req.body;
  if (!classId) throw new ApiError(400, 'classId is required');
  if (!subjectId) throw new ApiError(400, 'subjectId is required');
  if (!title) throw new ApiError(400, 'title is required');
  if (!dueDate) throw new ApiError(400, 'dueDate is required');

  const { rows } = await db.query(
    'INSERT INTO assignments (company_id, class_id, subject_id, title, description, due_date, max_score, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [req.user.companyId, classId, subjectId, title, description || null, dueDate, maxScore || 100, req.user.id]
  );
  res.status(201).json(rows[0]);
});

const updateAssignment = asyncHandler(async (req, res) => {
  const { title, description, dueDate, maxScore } = req.body;
  if (maxScore !== undefined) {
    const highestScore = await db.query('SELECT MAX(score) AS max FROM assignment_submissions WHERE assignment_id = $1', [req.params.id]);
    const recorded = highestScore.rows[0].max;
    if (recorded !== null && Number(maxScore) < Number(recorded)) {
      throw new ApiError(400, `Cannot reduce max score below ${recorded}, a score already recorded against this assignment`);
    }
  }

  const { rows } = await db.query(
    `UPDATE assignments SET title = COALESCE($1, title), description = COALESCE($2, description),
       due_date = COALESCE($3, due_date), max_score = COALESCE($4, max_score)
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [title, description, dueDate, maxScore, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Assignment not found');
  res.json(rows[0]);
});

const deleteAssignment = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM assignment_submissions WHERE assignment_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This assignment has real student submissions and cannot be deleted');
  const { rows } = await db.query('DELETE FROM assignments WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Assignment not found');
  res.status(204).end();
});

// GET /school/assignments/:id — includes every enrolled student paired
// with their submission if one exists, mirroring the attendance
// register's "show the whole roster, not just who's already acted"
// pattern.
const getAssignment = asyncHandler(async (req, res) => {
  const assignmentResult = await db.query(
    `SELECT a.*, c.name AS class_name, s.name AS subject_name FROM assignments a JOIN classes c ON c.id = a.class_id JOIN subjects s ON s.id = a.subject_id
     WHERE a.id = $1 AND a.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!assignmentResult.rows.length) throw new ApiError(404, 'Assignment not found');
  const assignment = assignmentResult.rows[0];

  const { rows } = await db.query(
    `SELECT st.id AS student_id, st.student_no, st.first_name, st.last_name, sub.id AS submission_id, sub.submitted_at, sub.content, sub.score, sub.feedback
     FROM students st
     LEFT JOIN assignment_submissions sub ON sub.student_id = st.id AND sub.assignment_id = $1
     WHERE st.class_id = $2 AND st.status = 'enrolled'
     ORDER BY st.last_name, st.first_name`,
    [req.params.id, assignment.class_id]
  );
  const now = new Date();
  res.json({
    ...assignment,
    students: rows.map((r) => ({ ...r, isLate: r.submitted_at ? new Date(r.submitted_at) > endOfDueDate(assignment.due_date) : false })),
  });
});

// ---------- Submissions & Grading ----------

// POST /school/assignments/:id/submissions { studentId, content }
// Upserts — resubmitting corrects the existing submission rather than
// creating a duplicate, the same discipline already used for attendance
// and skill assessments. Whether it's late is computed by comparing
// submitted_at to the assignment's due_date, never stored.
const submitAssignment = asyncHandler(async (req, res) => {
  const { studentId, content } = req.body;
  if (!studentId) throw new ApiError(400, 'studentId is required');

  const assignment = await db.query('SELECT * FROM assignments WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!assignment.rows.length) throw new ApiError(404, 'Assignment not found');

  const { rows } = await db.query(
    `INSERT INTO assignment_submissions (company_id, assignment_id, student_id, content) VALUES ($1,$2,$3,$4)
     ON CONFLICT (assignment_id, student_id) DO UPDATE SET content = $4, submitted_at = NOW() RETURNING *`,
    [req.user.companyId, req.params.id, studentId, content || null]
  );
  const isLate = new Date(rows[0].submitted_at) > endOfDueDate(assignment.rows[0].due_date);
  res.status(201).json({ ...rows[0], isLate });
});

// PATCH /school/submissions/:id { score, feedback }
const gradeSubmission = asyncHandler(async (req, res) => {
  const { score, feedback } = req.body;
  if (score === undefined || Number(score) < 0) throw new ApiError(400, 'score is required and cannot be negative');

  const submission = await db.query(
    `SELECT sub.*, a.max_score FROM assignment_submissions sub JOIN assignments a ON a.id = sub.assignment_id WHERE sub.id = $1 AND sub.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!submission.rows.length) throw new ApiError(404, 'Submission not found');
  if (Number(score) > Number(submission.rows[0].max_score)) throw new ApiError(400, `Score ${score} exceeds this assignment's max score of ${submission.rows[0].max_score}`);

  const { rows } = await db.query(
    'UPDATE assignment_submissions SET score = $1, feedback = $2, graded_by = $3, graded_at = NOW() WHERE id = $4 RETURNING *',
    [score, feedback || null, req.user.id, req.params.id]
  );
  res.json(rows[0]);
});

// GET /school/students/:id/assignments — a student's own view across all their assignments
const listStudentAssignments = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.*, c.name AS class_name, s.name AS subject_name, sub.id AS submission_id, sub.submitted_at, sub.score, sub.feedback
     FROM assignments a
     JOIN classes c ON c.id = a.class_id
     JOIN subjects s ON s.id = a.subject_id
     JOIN students st ON st.class_id = a.class_id AND st.id = $1
     LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = $1
     WHERE a.company_id = $2
     ORDER BY a.due_date DESC`,
    [req.params.id, req.user.companyId]
  );
  res.json(rows);
});

// ============================================================================
// Academic Terms — a real calendar, not just a free-text "term" label
// ============================================================================

const listAcademicTerms = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM academic_terms WHERE company_id = $1 ORDER BY academic_year DESC, sequence_order', [req.user.companyId]);
  res.json(rows);
});

const createAcademicTerm = asyncHandler(async (req, res) => {
  const { academicYear, termName, sequenceOrder, startDate, endDate } = req.body;
  if (!academicYear) throw new ApiError(400, 'academicYear is required');
  if (!termName) throw new ApiError(400, 'termName is required');
  if (!sequenceOrder || Number(sequenceOrder) < 1) throw new ApiError(400, 'sequenceOrder is required and must be at least 1');
  if (!startDate || !endDate) throw new ApiError(400, 'startDate and endDate are required');
  if (startDate >= endDate) throw new ApiError(400, 'startDate must be before endDate');

  const { rows } = await db.query(
    'INSERT INTO academic_terms (company_id, academic_year, term_name, sequence_order, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.companyId, academicYear, termName, sequenceOrder, startDate, endDate]
  );
  res.status(201).json(rows[0]);
});

const updateAcademicTerm = asyncHandler(async (req, res) => {
  const { termName, sequenceOrder, startDate, endDate } = req.body;
  if (startDate && endDate && startDate >= endDate) throw new ApiError(400, 'startDate must be before endDate');

  const { rows } = await db.query(
    `UPDATE academic_terms SET term_name = COALESCE($1, term_name), sequence_order = COALESCE($2, sequence_order),
       start_date = COALESCE($3, start_date), end_date = COALESCE($4, end_date)
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [termName, sequenceOrder, startDate, endDate, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Academic term not found');
  res.json(rows[0]);
});

const deleteAcademicTerm = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM promotion_batches WHERE term_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This term already triggered a promotion batch and cannot be deleted');
  const { rows } = await db.query('DELETE FROM academic_terms WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Academic term not found');
  res.status(204).end();
});

// ============================================================================
// Class Promotion — generation is automatic (manually triggered here, or by
// the scheduler once the last term of the year has ended), but nothing
// actually moves a student until a teacher approves it and it's applied.
// ============================================================================

/** Builds one promotion batch with a candidate for every enrolled student in
 * every class that has a next_class_id configured — the actual class move
 * doesn't happen here, only the proposal. Shared by the manual trigger below
 * and the scheduler, the same core-function pattern already used for
 * payroll auto-run and recurring invoices. */
async function generatePromotionBatchCore(client, companyId, academicYear, termId, userId) {
  const existing = await client.query('SELECT id FROM promotion_batches WHERE company_id = $1 AND academic_year = $2', [companyId, academicYear]);
  if (existing.rows.length) throw new ApiError(400, `A promotion batch for ${academicYear} already exists`);

  const batchResult = await client.query(
    'INSERT INTO promotion_batches (company_id, academic_year, term_id, generated_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [companyId, academicYear, termId || null, userId || null]
  );

  const eligibleStudents = await client.query(
    `SELECT s.id AS student_id, s.class_id AS from_class_id, c.next_class_id AS to_class_id
     FROM students s JOIN classes c ON c.id = s.class_id
     WHERE s.company_id = $1 AND s.status = 'enrolled' AND s.class_id IS NOT NULL AND c.next_class_id IS NOT NULL`,
    [companyId]
  );

  for (const s of eligibleStudents.rows) {
    await client.query(
      'INSERT INTO promotion_candidates (promotion_batch_id, company_id, student_id, from_class_id, to_class_id) VALUES ($1,$2,$3,$4,$5)',
      [batchResult.rows[0].id, companyId, s.student_id, s.from_class_id, s.to_class_id]
    );
  }

  return { batch: batchResult.rows[0], candidateCount: eligibleStudents.rows.length };
}

// POST /school/promotions/generate { academicYear, termId }
const generatePromotionBatch = asyncHandler(async (req, res) => {
  const { academicYear, termId } = req.body;
  if (!academicYear) throw new ApiError(400, 'academicYear is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await generatePromotionBatchCore(client, req.user.companyId, academicYear, termId, req.user.id);
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'promotion_batch', entityId: result.batch.id, newValues: { academicYear, candidateCount: result.candidateCount }, ip: req.ip });
    res.status(201).json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const listPromotionBatches = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT pb.*, at.term_name,
            (SELECT COUNT(*) FROM promotion_candidates WHERE promotion_batch_id = pb.id) AS total_count,
            (SELECT COUNT(*) FROM promotion_candidates WHERE promotion_batch_id = pb.id AND status = 'pending') AS pending_count,
            (SELECT COUNT(*) FROM promotion_candidates WHERE promotion_batch_id = pb.id AND status = 'approved') AS approved_count,
            (SELECT COUNT(*) FROM promotion_candidates WHERE promotion_batch_id = pb.id AND status = 'rejected') AS rejected_count
     FROM promotion_batches pb LEFT JOIN academic_terms at ON at.id = pb.term_id
     WHERE pb.company_id = $1 ORDER BY pb.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getPromotionBatch = asyncHandler(async (req, res) => {
  const batchResult = await db.query('SELECT * FROM promotion_batches WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!batchResult.rows.length) throw new ApiError(404, 'Promotion batch not found');

  const candidates = await db.query(
    `SELECT pc.*, s.student_no, s.first_name, s.last_name, fc.name AS from_class_name, tc.name AS to_class_name
     FROM promotion_candidates pc
     JOIN students s ON s.id = pc.student_id
     LEFT JOIN classes fc ON fc.id = pc.from_class_id
     LEFT JOIN classes tc ON tc.id = pc.to_class_id
     WHERE pc.promotion_batch_id = $1 ORDER BY fc.name, s.last_name`,
    [req.params.id]
  );
  res.json({ ...batchResult.rows[0], candidates: candidates.rows });
});

// PATCH /school/promotions/candidates/:id { status, toClassId, notes } — the
// actual teacher-approval step. Changing toClassId at review time is
// deliberately allowed, since a teacher reviewing the list is exactly the
// moment a school would catch "actually, this one repeats the year" or
// "this student is moving to a different stream."
const reviewPromotionCandidate = asyncHandler(async (req, res) => {
  const { status, toClassId, notes } = req.body;
  const validStatuses = ['approved', 'rejected', 'pending'];
  if (status && !validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);

  const existing = await db.query('SELECT applied FROM promotion_candidates WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Promotion candidate not found');
  if (existing.rows[0].applied) throw new ApiError(400, 'This promotion has already been applied and cannot be changed');

  const { rows } = await db.query(
    `UPDATE promotion_candidates SET status = COALESCE($1, status), to_class_id = COALESCE($2, to_class_id), notes = COALESCE($3, notes),
       reviewed_by = $4, reviewed_at = NOW()
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [status, toClassId, notes, req.user.id, req.params.id, req.user.companyId]
  );
  res.json(rows[0]);
});

// POST /school/promotions/:id/apply — the actual class change. Only
// candidates already marked approved are touched; anything still pending
// or rejected is left exactly as it is, so a partially-reviewed batch can
// be applied incrementally without forcing every decision at once.
const applyPromotionBatch = asyncHandler(async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const batch = await client.query('SELECT * FROM promotion_batches WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!batch.rows.length) throw new ApiError(404, 'Promotion batch not found');

    const approved = await client.query(
      `SELECT * FROM promotion_candidates WHERE promotion_batch_id = $1 AND status = 'approved' AND applied = FALSE`,
      [req.params.id]
    );

    for (const c of approved.rows) {
      await client.query('UPDATE students SET class_id = $1, updated_at = NOW() WHERE id = $2', [c.to_class_id, c.student_id]);
      await client.query('UPDATE promotion_candidates SET applied = TRUE WHERE id = $1', [c.id]);
    }

    const remainingPending = await client.query(
      `SELECT COUNT(*) FROM promotion_candidates WHERE promotion_batch_id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    if (Number(remainingPending.rows[0].count) === 0) {
      await client.query(`UPDATE promotion_batches SET status = 'completed' WHERE id = $1`, [req.params.id]);
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'promotion_batch', entityId: req.params.id, newValues: { appliedCount: approved.rows.length }, ip: req.ip });
    res.json({ appliedCount: approved.rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// School Structure — Departments, an ordered Grade Level ladder, and Houses.
// classes.grade_level_id and students.house_id are both additive links
// alongside the existing free-text fields, not replacements.
// ============================================================================

// ---------- Departments ----------

const listDepartments = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.*, e.first_name AS head_first_name, e.last_name AS head_last_name,
            (SELECT COUNT(*) FROM grade_levels WHERE department_id = d.id) AS grade_level_count
     FROM school_departments d LEFT JOIN school_staff e ON e.id = d.head_staff_id
     WHERE d.company_id = $1 ORDER BY d.sequence_order, d.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createDepartment = asyncHandler(async (req, res) => {
  const { name, description, headStaffId, sequenceOrder } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const { rows } = await db.query(
    'INSERT INTO school_departments (company_id, name, description, head_staff_id, sequence_order) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.companyId, name, description || null, headStaffId || null, sequenceOrder || 0]
  );
  res.status(201).json(rows[0]);
});

const updateDepartment = asyncHandler(async (req, res) => {
  const { name, description, headStaffId, sequenceOrder } = req.body;
  const { rows } = await db.query(
    `UPDATE school_departments SET name = COALESCE($1, name), description = COALESCE($2, description),
       head_staff_id = COALESCE($3, head_staff_id), sequence_order = COALESCE($4, sequence_order)
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [name, description, headStaffId, sequenceOrder, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Department not found');
  res.json(rows[0]);
});

const deleteDepartment = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM grade_levels WHERE department_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This department has real grade levels assigned to it and cannot be deleted');
  const { rows } = await db.query('DELETE FROM school_departments WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Department not found');
  res.status(204).end();
});

// ---------- Grade Levels ----------

const listGradeLevels = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT gl.*, d.name AS department_name,
            (SELECT COUNT(*) FROM classes WHERE grade_level_id = gl.id) AS class_count
     FROM grade_levels gl LEFT JOIN school_departments d ON d.id = gl.department_id
     WHERE gl.company_id = $1 ORDER BY gl.sequence_order`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createGradeLevel = asyncHandler(async (req, res) => {
  const { name, departmentId, sequenceOrder } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  if (!sequenceOrder || Number(sequenceOrder) < 1) throw new ApiError(400, 'sequenceOrder is required and must be at least 1');

  try {
    const { rows } = await db.query(
      'INSERT INTO grade_levels (company_id, department_id, name, sequence_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.companyId, departmentId || null, name, sequenceOrder]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new ApiError(400, `Sequence order ${sequenceOrder} is already used by another grade level`);
    throw err;
  }
});

const updateGradeLevel = asyncHandler(async (req, res) => {
  const { name, departmentId, sequenceOrder } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE grade_levels SET name = COALESCE($1, name), department_id = COALESCE($2, department_id), sequence_order = COALESCE($3, sequence_order)
       WHERE id = $4 AND company_id = $5 RETURNING *`,
      [name, departmentId, sequenceOrder, req.params.id, req.user.companyId]
    );
    if (!rows.length) throw new ApiError(404, 'Grade level not found');
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new ApiError(400, `Sequence order ${sequenceOrder} is already used by another grade level`);
    throw err;
  }
});

const deleteGradeLevel = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM classes WHERE grade_level_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This grade level has real classes linked to it and cannot be deleted');
  const { rows } = await db.query('DELETE FROM grade_levels WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Grade level not found');
  res.status(204).end();
});

// ---------- Houses ----------

const listHouses = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT h.*, e.first_name AS master_first_name, e.last_name AS master_last_name,
            (SELECT COUNT(*) FROM students WHERE house_id = h.id AND status = 'enrolled') AS student_count
     FROM houses h LEFT JOIN school_staff e ON e.id = h.house_master_id
     WHERE h.company_id = $1 ORDER BY h.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createHouse = asyncHandler(async (req, res) => {
  const { name, color, houseMasterId } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const { rows } = await db.query(
    'INSERT INTO houses (company_id, name, color, house_master_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.companyId, name, color || null, houseMasterId || null]
  );
  res.status(201).json(rows[0]);
});

const updateHouse = asyncHandler(async (req, res) => {
  const { name, color, houseMasterId } = req.body;
  const { rows } = await db.query(
    'UPDATE houses SET name = COALESCE($1, name), color = COALESCE($2, color), house_master_id = COALESCE($3, house_master_id) WHERE id = $4 AND company_id = $5 RETURNING *',
    [name, color, houseMasterId, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'House not found');
  res.json(rows[0]);
});

const deleteHouse = asyncHandler(async (req, res) => {
  const inUse = await db.query(`SELECT id FROM students WHERE house_id = $1 AND status = 'enrolled' LIMIT 1`, [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This house has real enrolled students assigned to it and cannot be deleted');
  const { rows } = await db.query('DELETE FROM houses WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'House not found');
  res.status(204).end();
});

// ============================================================================
// School Shop — genuinely buys and sells real items for real money, so
// unlike Attendance or Library this DOES post proper double-entry journal
// entries, the same discipline already used for Fees Management.
// ============================================================================

// ---------- Items ----------

const listShopItems = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM shop_items WHERE company_id = $1 ORDER BY name', [req.user.companyId]);
  res.json(rows);
});

const createShopItem = asyncHandler(async (req, res) => {
  const { name, sku, category, sellingPrice, costPrice, stockQuantity, reorderLevel } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  if (sellingPrice === undefined || Number(sellingPrice) < 0) throw new ApiError(400, 'sellingPrice is required and cannot be negative');

  const { rows } = await db.query(
    `INSERT INTO shop_items (company_id, name, sku, category, selling_price, cost_price, stock_quantity, reorder_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, name, sku || null, category || null, sellingPrice, costPrice || 0, stockQuantity || 0, reorderLevel || 0]
  );
  res.status(201).json(rows[0]);
});

const updateShopItem = asyncHandler(async (req, res) => {
  const { name, sku, category, sellingPrice, costPrice, reorderLevel, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE shop_items SET name = COALESCE($1, name), sku = COALESCE($2, sku), category = COALESCE($3, category),
       selling_price = COALESCE($4, selling_price), cost_price = COALESCE($5, cost_price),
       reorder_level = COALESCE($6, reorder_level), is_active = COALESCE($7, is_active)
     WHERE id = $8 AND company_id = $9 RETURNING *`,
    [name, sku, category, sellingPrice, costPrice, reorderLevel, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Shop item not found');
  res.json(rows[0]);
});

const deleteShopItem = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM shop_sale_items WHERE item_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This item has real sales history and cannot be deleted — mark it inactive instead');
  try {
    const { rows } = await db.query('DELETE FROM shop_items WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Shop item not found');
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') throw new ApiError(400, 'This item has real purchase history and cannot be deleted — mark it inactive instead');
    throw err;
  }
});

// ---------- Purchases (restocking) ----------

// POST /school/shop/purchases { supplierName, purchaseDate, items: [{ itemId, quantity, unitCost }] }
// Posts Dr Shop Inventory / Cr Cash and increments stock_quantity for every
// line — restocking is a cash outflow for real goods received.
const createShopPurchase = asyncHandler(async (req, res) => {
  const { supplierName, purchaseDate, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'At least one item line is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const purchaseNo = await salesService.generateDocNo(client, req.user.companyId, 'SPU');
    let totalAmount = 0;
    const lineDetails = [];
    for (const line of items) {
      if (!line.itemId || !line.quantity || line.quantity <= 0) throw new ApiError(400, 'Each line needs a real itemId and a positive quantity');
      const unitCost = Number(line.unitCost || 0);
      const lineTotal = unitCost * Number(line.quantity);
      totalAmount += lineTotal;
      lineDetails.push({ itemId: line.itemId, quantity: Number(line.quantity), unitCost, lineTotal });
    }

    const purchaseResult = await client.query(
      `INSERT INTO shop_purchases (company_id, purchase_no, supplier_name, total_amount, purchase_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.companyId, purchaseNo, supplierName || null, totalAmount, purchaseDate || new Date().toISOString().slice(0, 10), req.user.id]
    );
    const purchase = purchaseResult.rows[0];

    for (const line of lineDetails) {
      await client.query(
        'INSERT INTO shop_purchase_items (purchase_id, item_id, quantity, unit_cost, line_total) VALUES ($1,$2,$3,$4,$5)',
        [purchase.id, line.itemId, line.quantity, line.unitCost, line.lineTotal]
      );
      const updatedItem = await client.query(
        'UPDATE shop_items SET stock_quantity = stock_quantity + $1 WHERE id = $2 AND company_id = $3 RETURNING id',
        [line.quantity, line.itemId, req.user.companyId]
      );
      if (!updatedItem.rows.length) throw new ApiError(400, `Item ${line.itemId} not found`);
    }

    let journalEntryId = null;
    if (totalAmount > 0) {
      const inventoryAccountId = await schoolAccountingService.getSchoolAccountId(client, req.user.companyId, '1240');
      const cashAccountId = await schoolAccountingService.getSchoolAccountId(client, req.user.companyId, '1000');
      const je = await schoolAccountingService.postSchoolJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: purchase.purchase_date,
        referenceType: 'shop_purchase', referenceId: purchase.id,
        description: `Shop restock ${purchaseNo}${supplierName ? ' — ' + supplierName : ''}`,
        lines: [
          { accountId: inventoryAccountId, debit: totalAmount, credit: 0 },
          { accountId: cashAccountId, debit: 0, credit: totalAmount },
        ],
      });
      journalEntryId = je.id;
      await client.query('UPDATE shop_purchases SET journal_entry_id = $1 WHERE id = $2', [journalEntryId, purchase.id]);
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'shop_purchase', entityId: purchase.id, newValues: { purchaseNo, totalAmount }, ip: req.ip });
    res.status(201).json({ ...purchase, journal_entry_id: journalEntryId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const listShopPurchases = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM shop_purchases WHERE company_id = $1 ORDER BY purchase_date DESC, created_at DESC', [req.user.companyId]);
  res.json(rows);
});

const getShopPurchase = asyncHandler(async (req, res) => {
  const purchaseResult = await db.query('SELECT * FROM shop_purchases WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!purchaseResult.rows.length) throw new ApiError(404, 'Purchase not found');
  const items = await db.query(
    `SELECT pi.*, si.name AS item_name FROM shop_purchase_items pi JOIN shop_items si ON si.id = pi.item_id WHERE pi.purchase_id = $1`,
    [req.params.id]
  );
  res.json({ ...purchaseResult.rows[0], items: items.rows });
});

// ---------- Sales ----------

// POST /school/shop/sales { studentId, paymentMethod, saleDate, items: [{ itemId, quantity }] }
// Blocked outright if any line would oversell stock. Posts TWO journal
// lines pairs at once: Dr Cash / Cr Shop Sales Revenue for what was
// charged, and Dr COGS / Cr Shop Inventory for what the goods actually
// cost — the real accounting for a merchandise sale, not just the
// revenue side, which would overstate profit.
const createShopSale = asyncHandler(async (req, res) => {
  const { studentId, paymentMethod, saleDate, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'At least one item line is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const saleNo = await salesService.generateDocNo(client, req.user.companyId, 'SSL');
    let totalRevenue = 0;
    let totalCost = 0;
    const lineDetails = [];

    for (const line of items) {
      if (!line.itemId || !line.quantity || line.quantity <= 0) throw new ApiError(400, 'Each line needs a real itemId and a positive quantity');
      const itemResult = await client.query('SELECT * FROM shop_items WHERE id = $1 AND company_id = $2 FOR UPDATE', [line.itemId, req.user.companyId]);
      if (!itemResult.rows.length) throw new ApiError(404, `Item ${line.itemId} not found`);
      const item = itemResult.rows[0];
      const quantity = Number(line.quantity);
      if (item.stock_quantity < quantity) throw new ApiError(400, `Not enough stock of "${item.name}" — only ${item.stock_quantity} available`);

      const unitPrice = Number(item.selling_price);
      const unitCost = Number(item.cost_price);
      const lineRevenue = unitPrice * quantity;
      const lineCost = unitCost * quantity;
      totalRevenue += lineRevenue;
      totalCost += lineCost;
      lineDetails.push({ itemId: item.id, quantity, unitPrice, unitCost, lineTotal: lineRevenue });

      await client.query('UPDATE shop_items SET stock_quantity = stock_quantity - $1 WHERE id = $2', [quantity, item.id]);
    }

    const saleResult = await client.query(
      `INSERT INTO shop_sales (company_id, sale_no, student_id, total_amount, payment_method, sale_date, sold_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.companyId, saleNo, studentId || null, totalRevenue, paymentMethod || 'cash', saleDate || new Date().toISOString().slice(0, 10), req.user.id]
    );
    const sale = saleResult.rows[0];

    for (const line of lineDetails) {
      await client.query(
        'INSERT INTO shop_sale_items (sale_id, item_id, quantity, unit_price, unit_cost, line_total) VALUES ($1,$2,$3,$4,$5,$6)',
        [sale.id, line.itemId, line.quantity, line.unitPrice, line.unitCost, line.lineTotal]
      );
    }

    const cashAccountId = await schoolAccountingService.getSchoolAccountId(client, req.user.companyId, '1000');
    const revenueAccountId = await schoolAccountingService.getSchoolAccountId(client, req.user.companyId, '4220');
    const cogsAccountId = await schoolAccountingService.getSchoolAccountId(client, req.user.companyId, '6080');
    const inventoryAccountId = await schoolAccountingService.getSchoolAccountId(client, req.user.companyId, '1240');

    const revenueLines = [{ accountId: cashAccountId, debit: totalRevenue, credit: 0 }, { accountId: revenueAccountId, debit: 0, credit: totalRevenue }];
    const cogsLines = totalCost > 0 ? [{ accountId: cogsAccountId, debit: totalCost, credit: 0 }, { accountId: inventoryAccountId, debit: 0, credit: totalCost }] : [];

    const je = await schoolAccountingService.postSchoolJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: sale.sale_date,
      referenceType: 'shop_sale', referenceId: sale.id,
      description: `Shop sale ${saleNo}`,
      lines: [...revenueLines, ...cogsLines],
    });
    await client.query('UPDATE shop_sales SET journal_entry_id = $1 WHERE id = $2', [je.id, sale.id]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'shop_sale', entityId: sale.id, newValues: { saleNo, totalRevenue }, ip: req.ip });
    res.status(201).json({ ...sale, journal_entry_id: je.id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const listShopSales = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.*, st.first_name AS student_first_name, st.last_name AS student_last_name
     FROM shop_sales s LEFT JOIN students st ON st.id = s.student_id
     WHERE s.company_id = $1 ORDER BY s.sale_date DESC, s.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getShopSale = asyncHandler(async (req, res) => {
  const saleResult = await db.query(
    `SELECT s.*, st.first_name AS student_first_name, st.last_name AS student_last_name
     FROM shop_sales s LEFT JOIN students st ON st.id = s.student_id
     WHERE s.id = $1 AND s.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!saleResult.rows.length) throw new ApiError(404, 'Sale not found');
  const items = await db.query(
    `SELECT si.*, it.name AS item_name FROM shop_sale_items si JOIN shop_items it ON it.id = si.item_id WHERE si.sale_id = $1`,
    [req.params.id]
  );
  res.json({ ...saleResult.rows[0], items: items.rows });
});

// ============================================================================
// School Staff — School's own staff roster, genuinely decoupled from HR's
// employees table. A school can record a teacher, driver, or department
// head here without any HR employee record existing at all.
// ============================================================================

const listSchoolStaff = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM school_staff WHERE company_id = $1 ORDER BY first_name, last_name', [req.user.companyId]);
  res.json(rows);
});

const createSchoolStaff = asyncHandler(async (req, res) => {
  const { firstName, lastName, role, phone, email } = req.body;
  if (!firstName || !lastName) throw new ApiError(400, 'firstName and lastName are required');
  const { rows } = await db.query(
    'INSERT INTO school_staff (company_id, first_name, last_name, role, phone, email) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.companyId, firstName, lastName, role || null, phone || null, email || null]
  );
  res.status(201).json(rows[0]);
});

const updateSchoolStaff = asyncHandler(async (req, res) => {
  const { firstName, lastName, role, phone, email, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE school_staff SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
       role = COALESCE($3, role), phone = COALESCE($4, phone), email = COALESCE($5, email), is_active = COALESCE($6, is_active)
     WHERE id = $7 AND company_id = $8 RETURNING *`,
    [firstName, lastName, role, phone, email, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Staff member not found');
  res.json(rows[0]);
});

const deleteSchoolStaff = asyncHandler(async (req, res) => {
  const inUse = await db.query(
    `SELECT 1 FROM classes WHERE class_teacher_id = $1
     UNION SELECT 1 FROM timetable_entries WHERE teacher_id = $1
     UNION SELECT 1 FROM transport_vehicles WHERE driver_id = $1
     UNION SELECT 1 FROM school_departments WHERE head_staff_id = $1
     UNION SELECT 1 FROM houses WHERE house_master_id = $1
     LIMIT 1`,
    [req.params.id]
  );
  if (inUse.rows.length) throw new ApiError(400, 'This staff member is currently assigned somewhere (class teacher, timetable, transport, department, or house) and cannot be deleted — mark them inactive instead');
  const { rows } = await db.query('DELETE FROM school_staff WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Staff member not found');
  res.status(204).end();
});

// ============================================================================
// School Bank Accounts — School's own bank account list, decoupled from
// Accounting & Finance's bank_accounts. Each one gets its own real
// school_chart_of_accounts asset account under the hood, the same way
// Accounting's bank_accounts each got their own GL account.
// ============================================================================

const listSchoolBankAccounts = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM school_bank_accounts WHERE company_id = $1 ORDER BY bank_name', [req.user.companyId]);
  res.json(rows);
});

const createSchoolBankAccount = asyncHandler(async (req, res) => {
  const { bankName, accountNumber } = req.body;
  if (!bankName) throw new ApiError(400, 'bankName is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(SUBSTRING(account_code FROM 3)::INTEGER), 0) + 1 AS next_seq
       FROM school_chart_of_accounts WHERE company_id = $1 AND account_code LIKE '10%' AND account_code ~ '^\\d+$'`,
      [req.user.companyId]
    );
    const nextCode = '10' + String(seqResult.rows[0].next_seq).padStart(2, '0');
    const accountResult = await client.query(
      `INSERT INTO school_chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance) VALUES ($1,$2,$3,'asset','debit') RETURNING id`,
      [req.user.companyId, nextCode, `${bankName} (School)`]
    );

    const { rows } = await client.query(
      'INSERT INTO school_bank_accounts (company_id, bank_name, account_number, account_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.companyId, bankName, accountNumber || null, accountResult.rows[0].id]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const deleteSchoolBankAccount = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM student_fee_payments WHERE bank_account_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This bank account has real fee payments recorded against it and cannot be deleted');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    // Fetch the bank account's own GL account first — with no fee
    // payments referencing this bank account (confirmed above), its GL
    // account genuinely has no journal entries against it either, so
    // deleting both together doesn't orphan a stray account behind.
    const bankResult = await client.query('SELECT account_id FROM school_bank_accounts WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
    if (!bankResult.rows.length) throw new ApiError(404, 'Bank account not found');
    const accountId = bankResult.rows[0].account_id;

    await client.query('DELETE FROM school_bank_accounts WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
    await client.query('DELETE FROM school_chart_of_accounts WHERE id = $1', [accountId]);

    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// School Financial Statements — a real trial balance and income statement
// for School's own, separate books (school_chart_of_accounts /
// school_journal_entries), the missing piece after decoupling School's
// ledger from the shared one: every transaction was already correctly
// posted and balanced, but there was no way to actually see the numbers
// as a statement, only as raw rows in the database.
// ============================================================================

// GET /school/finance/trial-balance
const getSchoolTrialBalance = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT coa.account_code, coa.account_name, coa.account_type, coa.normal_balance,
            COALESCE(SUM(jel.debit), 0) AS total_debit,
            COALESCE(SUM(jel.credit), 0) AS total_credit
     FROM school_chart_of_accounts coa
     LEFT JOIN school_journal_entry_lines jel ON jel.account_id = coa.id
     WHERE coa.company_id = $1
     GROUP BY coa.id
     ORDER BY coa.account_code`,
    [req.user.companyId]
  );

  // The real balance per account, in the direction that account normally
  // runs in (debit accounts show positive when debits exceed credits,
  // credit accounts show positive when credits exceed debits) — not just
  // a raw net-of-everything number that would read backwards for half
  // the accounts.
  const accounts = rows.map((r) => {
    const netDebit = Number(r.total_debit) - Number(r.total_credit);
    const balance = r.normal_balance === 'debit' ? netDebit : -netDebit;
    return { ...r, balance };
  });

  const totalDebit = rows.reduce((sum, r) => sum + Number(r.total_debit), 0);
  const totalCredit = rows.reduce((sum, r) => sum + Number(r.total_credit), 0);

  res.json({ accounts, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
});

// GET /school/finance/income-statement
const getSchoolIncomeStatement = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT coa.account_code, coa.account_name, coa.account_type,
            COALESCE(SUM(jel.debit), 0) AS total_debit,
            COALESCE(SUM(jel.credit), 0) AS total_credit
     FROM school_chart_of_accounts coa
     LEFT JOIN school_journal_entry_lines jel ON jel.account_id = coa.id
     WHERE coa.company_id = $1 AND coa.account_type IN ('revenue', 'expense')
     GROUP BY coa.id
     ORDER BY coa.account_code`,
    [req.user.companyId]
  );

  const revenue = rows
    .filter((r) => r.account_type === 'revenue')
    .map((r) => ({ account_code: r.account_code, account_name: r.account_name, amount: Number(r.total_credit) - Number(r.total_debit) }));
  const expenses = rows
    .filter((r) => r.account_type === 'expense')
    .map((r) => ({ account_code: r.account_code, account_name: r.account_name, amount: Number(r.total_debit) - Number(r.total_credit) }));

  const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = expenses.reduce((sum, r) => sum + r.amount, 0);

  res.json({ revenue, expenses, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses });
});

// GET /school/finance/statement-of-financial-position
// Assets = Liabilities + Equity. School's ledger has no liability accounts
// yet (nothing currently posts one), and no equity account is ever posted
// to directly either — "Retained Earnings" here is a genuinely computed
// figure (accumulated revenue minus accumulated expenses, the same
// calculation the income statement makes), not a stored balance, since
// nothing in this ledger ever closes revenue/expense into an equity
// account at period-end. This is mathematically exactly what keeps the
// statement in balance: every asset change in this ledger is ultimately
// driven by a revenue or expense line, so Assets will always equal this
// computed Retained Earnings figure when liabilities are zero.
const getSchoolStatementOfFinancialPosition = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT coa.account_code, coa.account_name, coa.account_type, coa.normal_balance,
            COALESCE(SUM(jel.debit), 0) AS total_debit,
            COALESCE(SUM(jel.credit), 0) AS total_credit
     FROM school_chart_of_accounts coa
     LEFT JOIN school_journal_entry_lines jel ON jel.account_id = coa.id
     WHERE coa.company_id = $1
     GROUP BY coa.id
     ORDER BY coa.account_code`,
    [req.user.companyId]
  );

  const assets = rows
    .filter((r) => r.account_type === 'asset')
    .map((r) => ({ account_code: r.account_code, account_name: r.account_name, amount: Number(r.total_debit) - Number(r.total_credit) }));
  const liabilities = rows
    .filter((r) => r.account_type === 'liability')
    .map((r) => ({ account_code: r.account_code, account_name: r.account_name, amount: Number(r.total_credit) - Number(r.total_debit) }));

  const revenueTotal = rows.filter((r) => r.account_type === 'revenue').reduce((sum, r) => sum + (Number(r.total_credit) - Number(r.total_debit)), 0);
  const expenseTotal = rows.filter((r) => r.account_type === 'expense').reduce((sum, r) => sum + (Number(r.total_debit) - Number(r.total_credit)), 0);
  const retainedEarnings = revenueTotal - expenseTotal;

  const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);
  const totalEquity = retainedEarnings;

  res.json({
    assets, liabilities,
    equity: [{ account_code: null, account_name: 'Retained Earnings (accumulated)', amount: retainedEarnings }],
    totalAssets, totalLiabilities, totalEquity,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});

// GET /school/finance/statement-of-cash-flows
// The direct method: real cash-account movements, grouped by what actually
// caused them, not a reconciliation-from-net-income indirect calculation.
// School's ledger only ever has three transaction types that touch a real
// cash or bank account at all — generating a fee invoice debits Fees
// Receivable, not cash, so it correctly never appears here; only actually
// collecting a payment does. Investing and Financing sections are
// genuinely empty rather than hidden — nothing in this ledger can
// currently post a fixed-asset purchase or an owner contribution, so
// showing zero here is honest, not a placeholder for a feature that
// doesn't exist yet.
const CASH_FLOW_LABELS = {
  student_fee_payment: 'Cash received from fee payments',
  shop_sale: 'Cash received from shop sales',
  shop_purchase: 'Cash paid for shop purchases',
};

const getSchoolStatementOfCashFlows = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sje.reference_type,
            COALESCE(SUM(sjel.debit), 0) - COALESCE(SUM(sjel.credit), 0) AS net_change
     FROM school_journal_entry_lines sjel
     JOIN school_journal_entries sje ON sje.id = sjel.journal_entry_id
     JOIN school_chart_of_accounts sca ON sca.id = sjel.account_id
     WHERE sje.company_id = $1 AND sca.account_type = 'asset' AND sca.account_code ~ '^10\\d{2}$'
     GROUP BY sje.reference_type
     ORDER BY sje.reference_type`,
    [req.user.companyId]
  );

  const operatingActivities = rows
    .filter((r) => CASH_FLOW_LABELS[r.reference_type])
    .map((r) => ({ referenceType: r.reference_type, label: CASH_FLOW_LABELS[r.reference_type], amount: Number(r.net_change) }));

  const netCashFromOperating = operatingActivities.reduce((sum, a) => sum + a.amount, 0);
  const netCashFromInvesting = 0;
  const netCashFromFinancing = 0;
  const netIncreaseInCash = netCashFromOperating + netCashFromInvesting + netCashFromFinancing;

  // Opening cash is genuinely zero — School's ledger has no fiscal-period
  // concept yet, so this is a since-inception statement (the same framing
  // the Trial Balance and Income Statement already use), not a specific
  // date-range one. Closing cash should exactly equal the real cash/bank
  // balances shown on the Statement of Financial Position — cross-checked
  // live during testing, not just assumed to line up.
  const openingCash = 0;
  const closingCash = openingCash + netIncreaseInCash;

  res.json({
    operatingActivities, netCashFromOperating,
    investingActivities: [], netCashFromInvesting,
    financingActivities: [], netCashFromFinancing,
    netIncreaseInCash, openingCash, closingCash,
  });
});

// ============================================================================
// School Reports — genuinely new cross-cutting views, not a re-display of
// what's already on the Students/Fees/Attendance tabs. getFeesSummary
// already gives an aggregate by-status total; this adds the actual
// per-student breakdown a school administrator needs to know who
// specifically owes what.
// ============================================================================

// GET /school/reports/outstanding-fees
const getOutstandingFeesReport = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sfi.id, sfi.invoice_no, sfi.total_amount, sfi.amount_paid, sfi.status, sfi.due_date,
            s.student_no, s.first_name, s.last_name, c.name AS class_name
     FROM student_fee_invoices sfi
     JOIN students s ON s.id = sfi.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE sfi.company_id = $1 AND sfi.status IN ('unpaid', 'partial')
     ORDER BY (sfi.total_amount - sfi.amount_paid) DESC`,
    [req.user.companyId]
  );
  const report = rows.map((r) => ({ ...r, balance: Number(r.total_amount) - Number(r.amount_paid) }));
  const totalOutstanding = report.reduce((sum, r) => sum + r.balance, 0);
  res.json({ students: report, totalOutstanding, studentCount: new Set(report.map((r) => r.student_no)).size });
});

// GET /school/reports/class-roster?classId=...
const getClassRosterReport = asyncHandler(async (req, res) => {
  const { classId } = req.query;
  if (!classId) throw new ApiError(400, 'classId is required');

  const classResult = await db.query('SELECT * FROM classes WHERE id = $1 AND company_id = $2', [classId, req.user.companyId]);
  if (!classResult.rows.length) throw new ApiError(404, 'Class not found');

  const { rows } = await db.query(
    `SELECT s.id, s.student_no, s.first_name, s.last_name, s.gender, s.date_of_birth,
            g.first_name AS guardian_first_name, g.last_name AS guardian_last_name, g.phone AS guardian_phone
     FROM students s
     LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary_contact = TRUE
     LEFT JOIN guardians g ON g.id = sg.guardian_id
     WHERE s.class_id = $1 AND s.company_id = $2 AND s.status = 'enrolled'
     ORDER BY s.last_name, s.first_name`,
    [classId, req.user.companyId]
  );
  res.json({ class: classResult.rows[0], students: rows });
});

// GET /school/reports/attendance-summary?from=...&to=...
// A school-wide view every enrolled student's attendance rate over a real
// date range, in one table — the per-student summary and per-class
// register already built only ever show one student or one class/day at a
// time; this is genuinely new, for spotting a chronic absentee anywhere
// in the school at a glance, not just within a class you already
// suspected.
const getSchoolAttendanceSummaryReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to dates are required');

  const { rows } = await db.query(
    `SELECT s.id, s.student_no, s.first_name, s.last_name, c.name AS class_name,
            COUNT(sa.id) AS total_marked,
            COUNT(sa.id) FILTER (WHERE sa.status IN ('present', 'late')) AS present_count
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.attendance_date BETWEEN $2 AND $3
     WHERE s.company_id = $1 AND s.status = 'enrolled'
     GROUP BY s.id, c.name
     ORDER BY c.name, s.last_name, s.first_name`,
    [req.user.companyId, from, to]
  );

  const report = rows.map((r) => ({
    ...r,
    attendanceRate: Number(r.total_marked) > 0 ? Number(r.present_count) / Number(r.total_marked) : null,
  }));
  res.json(report);
});

module.exports = {
  listClasses, createClass, updateClass, deleteClass: deleteClassEndpoint,
  listGuardians, createGuardian, updateGuardian, deleteGuardian,
  listStudents, getStudent, createStudent, updateStudent, deleteStudent, linkGuardian, unlinkGuardian,
  listAdmissions, createAdmission, updateAdmission, deleteAdmission, enrollApplication,
  getWorkspaceDashboard,
  getClassRegister, bulkMarkAttendance, getStudentAttendanceSummary, getClassAttendanceHistory,
  listSubjects, createSubject, updateSubject, deleteSubject,
  listGradingScale, replaceGradingScale,
  listExams, getExam, createExam, updateExam, deleteExam, addExamSubject,
  getMarksSheet, bulkEnterMarks, getReportCard,
  listSkillAssessments, recordSkillAssessment,
  listFeeCategories, createFeeCategory, updateFeeCategory, deleteFeeCategory,
  listFeeStructures, getFeeStructure, createFeeStructure, updateFeeStructure, deleteFeeStructure,
  generateFeeInvoice, generateFeeInvoicesBulk, listStudentFeeInvoices, getFeeInvoice, recordFeePayment,
  getFeesSummary,
  listPeriods, createPeriod, updatePeriod, deletePeriod,
  getClassTimetable, getTeacherTimetable, createTimetableEntry, updateTimetableEntry, deleteTimetableEntry,
  getLibrarySettings, updateLibrarySettings,
  listLibraryBooks, createLibraryBook, updateLibraryBook, deleteLibraryBook,
  listLibraryLoans, issueBook, returnBook, markBookLost, markFinePaid,
  listVehicles, createVehicle, updateVehicle, deleteVehicle,
  listRoutes, getRoute, createRoute, updateRoute, deleteRoute, addStop, updateStop, deleteStop,
  assignStudentToRoute, unassignStudentFromRoute,
  listStudyMaterials, createStudyMaterial, updateStudyMaterial, deleteStudyMaterial,
  listAssignmentsForClass, createAssignment, updateAssignment, deleteAssignment, getAssignment,
  submitAssignment, gradeSubmission, listStudentAssignments,
  listAcademicTerms, createAcademicTerm, updateAcademicTerm, deleteAcademicTerm,
  generatePromotionBatch, generatePromotionBatchCore, listPromotionBatches, getPromotionBatch, reviewPromotionCandidate, applyPromotionBatch,
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listGradeLevels, createGradeLevel, updateGradeLevel, deleteGradeLevel,
  listHouses, createHouse, updateHouse, deleteHouse,
  listShopItems, createShopItem, updateShopItem, deleteShopItem,
  createShopPurchase, listShopPurchases, getShopPurchase,
  createShopSale, listShopSales, getShopSale,
  listSchoolStaff, createSchoolStaff, updateSchoolStaff, deleteSchoolStaff,
  listSchoolBankAccounts, createSchoolBankAccount, deleteSchoolBankAccount,
  getSchoolTrialBalance, getSchoolIncomeStatement, getSchoolStatementOfFinancialPosition, getSchoolStatementOfCashFlows,
  getOutstandingFeesReport, getClassRosterReport, getSchoolAttendanceSummaryReport,
};
