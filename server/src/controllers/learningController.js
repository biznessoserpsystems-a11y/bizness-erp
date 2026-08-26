const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const DELIVERY_TYPES = ['internal', 'external'];
const SESSION_STATUSES = ['scheduled', 'ongoing', 'completed', 'cancelled'];
const ENROLLMENT_STATUSES = ['enrolled', 'attended', 'no_show', 'cancelled'];
const COMPLETION_STATUSES = ['pending', 'passed', 'failed', 'not_applicable'];
const PRIORITIES = ['low', 'medium', 'high'];
const NEED_STATUSES = ['identified', 'planned', 'addressed'];

function canManageTraining(user) {
  return (user.permissions || []).includes('hr.training.manage');
}

async function findOwnEmployee(req) {
  const { rows } = await db.query('SELECT * FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
  return rows[0] || null;
}

// ---------------- Courses ----------------

const listCourses = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM training_sessions s WHERE s.course_id = c.id) AS session_count
     FROM training_courses c WHERE c.company_id = $1 ORDER BY c.title`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createCourse = asyncHandler(async (req, res) => {
  const { title, description, category, deliveryType, provider, durationHours, costPerParticipant } = req.body;
  if (!title) throw new ApiError(400, 'title is required');
  if (deliveryType && !DELIVERY_TYPES.includes(deliveryType)) throw new ApiError(400, `deliveryType must be one of: ${DELIVERY_TYPES.join(', ')}`);

  const { rows } = await db.query(
    `INSERT INTO training_courses (company_id, title, description, category, delivery_type, provider, duration_hours, cost_per_participant, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.companyId, title, description || null, category || null, deliveryType || 'internal',
      provider || null, durationHours || null, costPerParticipant || 0, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'training_course', entityId: rows[0].id, newValues: { title }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateCourse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, category, deliveryType, provider, durationHours, costPerParticipant, isActive } = req.body;
  if (deliveryType && !DELIVERY_TYPES.includes(deliveryType)) throw new ApiError(400, `deliveryType must be one of: ${DELIVERY_TYPES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE training_courses SET
       title = COALESCE($1, title), description = COALESCE($2, description), category = COALESCE($3, category),
       delivery_type = COALESCE($4, delivery_type), provider = COALESCE($5, provider),
       duration_hours = COALESCE($6, duration_hours), cost_per_participant = COALESCE($7, cost_per_participant),
       is_active = COALESCE($8, is_active), updated_at = NOW()
     WHERE id = $9 AND company_id = $10 RETURNING *`,
    [title, description, category, deliveryType, provider, durationHours, costPerParticipant, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Course not found');
  res.json(rows[0]);
});

// ---------------- Sessions (Training Calendar) ----------------

const listSessions = asyncHandler(async (req, res) => {
  const { from, to, courseId } = req.query;
  const conditions = ['s.company_id = $1'];
  const params = [req.user.companyId];
  if (from) { params.push(from); conditions.push(`s.starts_at >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`s.starts_at <= $${params.length}`); }
  if (courseId) { params.push(courseId); conditions.push(`s.course_id = $${params.length}`); }

  const { rows } = await db.query(
    `SELECT s.*, c.title AS course_title, c.delivery_type, c.category,
            (SELECT COUNT(*)::int FROM training_enrollments e WHERE e.session_id = s.id AND e.status != 'cancelled') AS enrolled_count
     FROM training_sessions s JOIN training_courses c ON c.id = s.course_id
     WHERE ${conditions.join(' AND ')} ORDER BY s.starts_at`,
    params
  );
  res.json(rows);
});

const createSession = asyncHandler(async (req, res) => {
  const { courseId, startsAt, endsAt, location, instructor, capacity } = req.body;
  if (!courseId || !startsAt) throw new ApiError(400, 'courseId and startsAt are required');

  const course = await db.query('SELECT 1 FROM training_courses WHERE id = $1 AND company_id = $2', [courseId, req.user.companyId]);
  if (!course.rows.length) throw new ApiError(404, 'Course not found');

  const { rows } = await db.query(
    `INSERT INTO training_sessions (company_id, course_id, starts_at, ends_at, location, instructor, capacity, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, courseId, startsAt, endsAt || null, location || null, instructor || null, capacity || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

const updateSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { startsAt, endsAt, location, instructor, capacity, status, actualCost } = req.body;
  if (status && !SESSION_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${SESSION_STATUSES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE training_sessions SET
       starts_at = COALESCE($1, starts_at), ends_at = COALESCE($2, ends_at), location = COALESCE($3, location),
       instructor = COALESCE($4, instructor), capacity = COALESCE($5, capacity), status = COALESCE($6, status),
       actual_cost = COALESCE($7, actual_cost), updated_at = NOW()
     WHERE id = $8 AND company_id = $9 RETURNING *`,
    [startsAt, endsAt, location, instructor, capacity, status, actualCost, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Session not found');
  res.json(rows[0]);
});

// ---------------- Enrollments ----------------

const listSessionEnrollments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT e.*, emp.first_name, emp.last_name, emp.employee_no
     FROM training_enrollments e JOIN employees emp ON emp.id = e.employee_id
     WHERE e.session_id = $1 AND e.company_id = $2 ORDER BY emp.first_name`,
    [id, req.user.companyId]
  );
  res.json(rows);
});

// POST /training-sessions/:id/enroll { employeeId } — self-enroll if employeeId omitted or your own
const enrollInSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let { employeeId } = req.body;

  if (!employeeId) {
    const own = await findOwnEmployee(req);
    if (!own) throw new ApiError(400, 'Your user account is not linked to an employee record');
    employeeId = own.id;
  } else if (!canManageTraining(req.user)) {
    const own = await findOwnEmployee(req);
    if (!own || own.id !== employeeId) throw new ApiError(403, 'You need hr.training.manage to enroll someone else');
  }

  const session = await db.query('SELECT * FROM training_sessions WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!session.rows.length) throw new ApiError(404, 'Session not found');
  if (session.rows[0].status === 'cancelled') throw new ApiError(400, 'This session has been cancelled');

  if (session.rows[0].capacity) {
    const countRes = await db.query(`SELECT COUNT(*)::int AS n FROM training_enrollments WHERE session_id = $1 AND status != 'cancelled'`, [id]);
    if (countRes.rows[0].n >= session.rows[0].capacity) throw new ApiError(400, 'This session is at capacity');
  }

  const { rows } = await db.query(
    `INSERT INTO training_enrollments (company_id, session_id, employee_id, created_by)
     VALUES ($1,$2,$3,$4) ON CONFLICT (session_id, employee_id) DO UPDATE SET status = 'enrolled'
     RETURNING *`,
    [req.user.companyId, id, employeeId, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// PATCH /training-enrollments/:id — evaluation + certification, or self-cancel
const updateEnrollment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, completionStatus, evaluationScore, evaluationNotes, certificateIssued, certificateExpiryDate } = req.body;
  if (status && !ENROLLMENT_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${ENROLLMENT_STATUSES.join(', ')}`);
  if (completionStatus && !COMPLETION_STATUSES.includes(completionStatus)) throw new ApiError(400, `completionStatus must be one of: ${COMPLETION_STATUSES.join(', ')}`);

  const existing = await db.query('SELECT * FROM training_enrollments WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Enrollment not found');

  const recordingResult = completionStatus !== undefined || evaluationScore !== undefined || evaluationNotes !== undefined || certificateIssued !== undefined || certificateExpiryDate !== undefined;
  if (recordingResult && !canManageTraining(req.user)) {
    throw new ApiError(403, 'You need hr.training.manage to record evaluation or certification results');
  }
  if (status !== undefined && !recordingResult && !canManageTraining(req.user)) {
    // Self-service: an employee may only cancel their own enrollment.
    const own = await findOwnEmployee(req);
    if (!own || own.id !== existing.rows[0].employee_id || status !== 'cancelled') {
      throw new ApiError(403, 'You can only cancel your own enrollment');
    }
  }

  const { rows } = await db.query(
    `UPDATE training_enrollments SET
       status = COALESCE($1, status), completion_status = COALESCE($2, completion_status),
       evaluation_score = COALESCE($3, evaluation_score), evaluation_notes = COALESCE($4, evaluation_notes),
       certificate_issued = COALESCE($5, certificate_issued), certificate_expiry_date = COALESCE($6, certificate_expiry_date)
     WHERE id = $7 RETURNING *`,
    [status, completionStatus, evaluationScore, evaluationNotes, certificateIssued, certificateExpiryDate, id]
  );
  res.json(rows[0]);
});

// GET /employees/:id/learning-history — self, or hr.training.manage for anyone
const getLearningHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!canManageTraining(req.user)) {
    const own = await findOwnEmployee(req);
    if (!own || own.id !== id) throw new ApiError(403, 'You can only view your own learning history');
  }

  const { rows } = await db.query(
    `SELECT e.*, s.starts_at, s.ends_at, s.location, s.instructor, s.status AS session_status,
            c.title AS course_title, c.category, c.delivery_type
     FROM training_enrollments e
     JOIN training_sessions s ON s.id = e.session_id
     JOIN training_courses c ON c.id = s.course_id
     WHERE e.company_id = $1 AND e.employee_id = $2
     ORDER BY s.starts_at DESC`,
    [req.user.companyId, id]
  );
  res.json(rows);
});

// ---------------- Training needs assessment ----------------

const listTrainingNeeds = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const conditions = ['n.company_id = $1'];
  const params = [req.user.companyId];
  if (status) {
    if (!NEED_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${NEED_STATUSES.join(', ')}`);
    params.push(status);
    conditions.push(`n.status = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT n.*, e.first_name, e.last_name, c.title AS recommended_course_title
     FROM training_needs n
     LEFT JOIN employees e ON e.id = n.employee_id
     LEFT JOIN training_courses c ON c.id = n.recommended_course_id
     WHERE ${conditions.join(' AND ')} ORDER BY n.created_at DESC`,
    params
  );
  res.json(rows);
});

const createTrainingNeed = asyncHandler(async (req, res) => {
  const { employeeId, department, skillGap, recommendedCourseId, priority, notes } = req.body;
  if (!skillGap) throw new ApiError(400, 'skillGap is required');
  if (!employeeId && !department) throw new ApiError(400, 'Either employeeId or department is required');
  if (priority && !PRIORITIES.includes(priority)) throw new ApiError(400, `priority must be one of: ${PRIORITIES.join(', ')}`);

  const { rows } = await db.query(
    `INSERT INTO training_needs (company_id, employee_id, department, skill_gap, recommended_course_id, priority, notes, identified_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, employeeId || null, department || null, skillGap, recommendedCourseId || null, priority || 'medium', notes || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

const updateTrainingNeed = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, priority, notes, recommendedCourseId } = req.body;
  if (status && !NEED_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${NEED_STATUSES.join(', ')}`);
  if (priority && !PRIORITIES.includes(priority)) throw new ApiError(400, `priority must be one of: ${PRIORITIES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE training_needs SET
       status = COALESCE($1, status), priority = COALESCE($2, priority), notes = COALESCE($3, notes),
       recommended_course_id = COALESCE($4, recommended_course_id), updated_at = NOW()
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [status, priority, notes, recommendedCourseId, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Training need not found');
  res.json(rows[0]);
});

// ---------------- Reports ----------------

// GET /hr-reports/training-costs?from=&to=
const getTrainingCostsReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const byCourse = await db.query(
    `SELECT c.id AS course_id, c.title, c.delivery_type,
            COUNT(DISTINCT s.id)::int AS session_count,
            COUNT(e.id) FILTER (WHERE e.status != 'cancelled')::int AS participant_count,
            COALESCE(SUM(s.actual_cost), 0) AS total_actual_cost,
            COALESCE(SUM(c.cost_per_participant) FILTER (WHERE e.status != 'cancelled'), 0) AS total_budgeted_cost
     FROM training_courses c
     JOIN training_sessions s ON s.course_id = c.id AND s.starts_at >= $2 AND s.starts_at <= $3
     LEFT JOIN training_enrollments e ON e.session_id = s.id
     WHERE c.company_id = $1
     GROUP BY c.id, c.title, c.delivery_type
     ORDER BY total_actual_cost DESC`,
    [req.user.companyId, from, to]
  );
  res.json({ byCourse: byCourse.rows });
});

// GET /hr-reports/certification-expiry?withinDays=
const getCertificationExpiryReport = asyncHandler(async (req, res) => {
  const withinDays = Number(req.query.withinDays) || 60;
  const { rows } = await db.query(
    `SELECT e.id, e.certificate_expiry_date, emp.id AS employee_id, emp.first_name, emp.last_name, c.title AS course_title
     FROM training_enrollments e
     JOIN employees emp ON emp.id = e.employee_id
     JOIN training_sessions s ON s.id = e.session_id
     JOIN training_courses c ON c.id = s.course_id
     WHERE e.company_id = $1 AND e.certificate_issued = TRUE
       AND e.certificate_expiry_date IS NOT NULL
       AND e.certificate_expiry_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL
     ORDER BY e.certificate_expiry_date`,
    [req.user.companyId, withinDays]
  );
  res.json(rows);
});

module.exports = {
  listCourses, createCourse, updateCourse,
  listSessions, createSession, updateSession,
  listSessionEnrollments, enrollInSession, updateEnrollment, getLearningHistory,
  listTrainingNeeds, createTrainingNeed, updateTrainingNeed,
  getTrainingCostsReport, getCertificationExpiryReport,
};
