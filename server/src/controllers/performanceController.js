const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const GOAL_STATUSES = ['not_started', 'in_progress', 'completed', 'missed'];
const CYCLE_TYPES = ['annual', 'semi_annual', 'quarterly', 'probation', 'ad_hoc'];
const CYCLE_STATUSES = ['draft', 'active', 'closed'];
const REVIEW_TYPES = ['supervisor', 'self', 'peer'];
const REVIEW_STATUSES = ['draft', 'submitted', 'acknowledged'];

function canManage(user) {
  return (user.permissions || []).includes('hr.performance.manage');
}

async function findOwnEmployee(req) {
  const { rows } = await db.query('SELECT * FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
  return rows[0] || null;
}

async function isManagerOf(req, employeeId) {
  const own = await findOwnEmployee(req);
  if (!own) return false;
  const { rows } = await db.query('SELECT 1 FROM employees WHERE id = $1 AND manager_id = $2', [employeeId, own.id]);
  return rows.length > 0;
}

// ---------------- KPIs ----------------

const listKpis = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM kpis WHERE company_id = $1 ORDER BY name', [req.user.companyId]);
  res.json(rows);
});

const createKpi = asyncHandler(async (req, res) => {
  const { name, description, department, unit, targetDirection } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  if (targetDirection && !['higher_is_better', 'lower_is_better'].includes(targetDirection)) {
    throw new ApiError(400, 'targetDirection must be higher_is_better or lower_is_better');
  }
  const { rows } = await db.query(
    `INSERT INTO kpis (company_id, name, description, department, unit, target_direction, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.companyId, name, description || null, department || null, unit || null, targetDirection || 'higher_is_better', req.user.id]
  );
  res.status(201).json(rows[0]);
});

const updateKpi = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, department, unit, targetDirection, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE kpis SET name = COALESCE($1,name), description = COALESCE($2,description), department = COALESCE($3,department),
       unit = COALESCE($4,unit), target_direction = COALESCE($5,target_direction), is_active = COALESCE($6,is_active)
     WHERE id = $7 AND company_id = $8 RETURNING *`,
    [name, description, department, unit, targetDirection, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'KPI not found');
  res.json(rows[0]);
});

// ---------------- Review cycles ----------------

const listCycles = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM performance_review_cycles WHERE company_id = $1 ORDER BY start_date DESC', [req.user.companyId]);
  res.json(rows);
});

const createCycle = asyncHandler(async (req, res) => {
  const { name, cycleType, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) throw new ApiError(400, 'name, startDate, and endDate are required');
  if (cycleType && !CYCLE_TYPES.includes(cycleType)) throw new ApiError(400, `cycleType must be one of: ${CYCLE_TYPES.join(', ')}`);

  const { rows } = await db.query(
    `INSERT INTO performance_review_cycles (company_id, name, cycle_type, start_date, end_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.companyId, name, cycleType || 'annual', startDate, endDate, req.user.id]
  );
  res.status(201).json(rows[0]);
});

const updateCycle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, status, startDate, endDate } = req.body;
  if (status && !CYCLE_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${CYCLE_STATUSES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE performance_review_cycles SET name = COALESCE($1,name), status = COALESCE($2,status),
       start_date = COALESCE($3,start_date), end_date = COALESCE($4,end_date)
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [name, status, startDate, endDate, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Review cycle not found');
  res.json(rows[0]);
});

// ---------------- Goals ----------------

const listGoals = asyncHandler(async (req, res) => {
  const { id } = req.params; // employee id
  if (!canManage(req.user)) {
    const own = await findOwnEmployee(req);
    const isSelf = own && own.id === id;
    const isManager = await isManagerOf(req, id);
    if (!isSelf && !isManager) throw new ApiError(403, "You can only view your own or your direct reports' goals");
  }
  const { rows } = await db.query(
    `SELECT g.*, k.name AS kpi_name, k.unit AS kpi_unit
     FROM performance_goals g LEFT JOIN kpis k ON k.id = g.kpi_id
     WHERE g.company_id = $1 AND g.employee_id = $2 ORDER BY g.due_date NULLS LAST, g.created_at DESC`,
    [req.user.companyId, id]
  );
  res.json(rows);
});

const createGoal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { kpiId, title, description, targetValue, weightPct, startDate, dueDate } = req.body;
  if (!title) throw new ApiError(400, 'title is required');

  if (!canManage(req.user) && !(await isManagerOf(req, id))) {
    throw new ApiError(403, "You need to be this employee's manager or hold hr.performance.manage to set goals for them");
  }

  const emp = await db.query('SELECT 1 FROM employees WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!emp.rows.length) throw new ApiError(404, 'Employee not found');

  const { rows } = await db.query(
    `INSERT INTO performance_goals (company_id, employee_id, kpi_id, title, description, target_value, weight_pct, start_date, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.companyId, id, kpiId || null, title, description || null, targetValue || null, weightPct || null, startDate || null, dueDate || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// PATCH /goals/:id — full edit for manager/hr.performance.manage; self may only touch actual_value/status
const updateGoal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, targetValue, actualValue, weightPct, startDate, dueDate, status } = req.body;
  if (status && !GOAL_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${GOAL_STATUSES.join(', ')}`);

  const existing = await db.query('SELECT * FROM performance_goals WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Goal not found');

  const isManagerOrAdmin = canManage(req.user) || (await isManagerOf(req, existing.rows[0].employee_id));
  if (!isManagerOrAdmin) {
    const own = await findOwnEmployee(req);
    if (!own || own.id !== existing.rows[0].employee_id) throw new ApiError(403, 'You can only update your own goal progress');
    if (title !== undefined || description !== undefined || targetValue !== undefined || weightPct !== undefined || startDate !== undefined || dueDate !== undefined) {
      throw new ApiError(403, "You can only update actualValue and status on your own goal — ask your manager to change the target or deadline");
    }
  }

  const { rows } = await db.query(
    `UPDATE performance_goals SET
       title = COALESCE($1,title), description = COALESCE($2,description), target_value = COALESCE($3,target_value),
       actual_value = COALESCE($4,actual_value), weight_pct = COALESCE($5,weight_pct),
       start_date = COALESCE($6,start_date), due_date = COALESCE($7,due_date), status = COALESCE($8,status), updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [title, description, targetValue, actualValue, weightPct, startDate, dueDate, status, id]
  );
  res.json(rows[0]);
});

// ---------------- Reviews ----------------

// GET /employees/:id/performance-reviews?cycleId= — reviews ABOUT this employee
const listReviewsForEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cycleId } = req.query;

  if (!canManage(req.user)) {
    const own = await findOwnEmployee(req);
    const isSelf = own && own.id === id;
    const isManager = await isManagerOf(req, id);
    if (!isSelf && !isManager) throw new ApiError(403, "You can only view your own or your direct reports' reviews");
  }

  const conditions = ['r.company_id = $1', 'r.employee_id = $2'];
  const params = [req.user.companyId, id];
  if (cycleId) { params.push(cycleId); conditions.push(`r.cycle_id = $${params.length}`); }

  const { rows } = await db.query(
    `SELECT r.*, rev.first_name AS reviewer_first_name, rev.last_name AS reviewer_last_name, c.name AS cycle_name
     FROM performance_reviews r
     JOIN employees rev ON rev.id = r.reviewer_id
     JOIN performance_review_cycles c ON c.id = r.cycle_id
     WHERE ${conditions.join(' AND ')} ORDER BY r.created_at DESC`,
    params
  );
  res.json(rows);
});

// POST /employees/:id/performance-reviews { cycleId, reviewType, overallRating, strengths, areasForImprovement, comments, promotionRecommended, promotionNotes }
const createReview = asyncHandler(async (req, res) => {
  const { id } = req.params; // employee being reviewed
  const { cycleId, reviewType, overallRating, strengths, areasForImprovement, comments, promotionRecommended, promotionNotes } = req.body;
  if (!cycleId || !reviewType) throw new ApiError(400, 'cycleId and reviewType are required');
  if (!REVIEW_TYPES.includes(reviewType)) throw new ApiError(400, `reviewType must be one of: ${REVIEW_TYPES.join(', ')}`);
  if (overallRating !== undefined && overallRating !== null && (overallRating < 1 || overallRating > 5)) throw new ApiError(400, 'overallRating must be between 1 and 5');

  const own = await findOwnEmployee(req);

  let reviewerId;
  if (reviewType === 'self') {
    if (!own || own.id !== id) throw new ApiError(403, 'A self-assessment must be written by the employee themselves');
    reviewerId = own.id;
  } else if (reviewType === 'supervisor') {
    if (await isManagerOf(req, id)) {
      reviewerId = own.id;
    } else if (canManage(req.user)) {
      if (!own) throw new ApiError(400, 'Your user account is not linked to an employee record, so a reviewer cannot be attributed');
      reviewerId = own.id;
    } else {
      throw new ApiError(403, "A supervisor evaluation must be written by the employee's manager or someone with hr.performance.manage");
    }
  } else {
    // peer — any linked employee, about someone else
    if (!own) throw new ApiError(400, 'Your user account is not linked to an employee record');
    if (own.id === id) throw new ApiError(400, 'You cannot submit a peer review about yourself');
    reviewerId = own.id;
  }

  const emp = await db.query('SELECT 1 FROM employees WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!emp.rows.length) throw new ApiError(404, 'Employee not found');
  const cycle = await db.query('SELECT 1 FROM performance_review_cycles WHERE id = $1 AND company_id = $2', [cycleId, req.user.companyId]);
  if (!cycle.rows.length) throw new ApiError(404, 'Review cycle not found');

  const { rows } = await db.query(
    `INSERT INTO performance_reviews (company_id, cycle_id, employee_id, reviewer_id, review_type, overall_rating, strengths, areas_for_improvement, comments, promotion_recommended, promotion_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (cycle_id, employee_id, reviewer_id, review_type) DO UPDATE SET
       overall_rating = EXCLUDED.overall_rating, strengths = EXCLUDED.strengths,
       areas_for_improvement = EXCLUDED.areas_for_improvement, comments = EXCLUDED.comments,
       promotion_recommended = EXCLUDED.promotion_recommended, promotion_notes = EXCLUDED.promotion_notes, updated_at = NOW()
     RETURNING *`,
    [req.user.companyId, cycleId, id, reviewerId, reviewType, overallRating || null, strengths || null,
      areasForImprovement || null, comments || null, !!promotionRecommended, promotionNotes || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /performance-reviews/:id — only the author, or hr.performance.manage
const updateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { overallRating, strengths, areasForImprovement, comments, promotionRecommended, promotionNotes, status } = req.body;
  if (status && !REVIEW_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${REVIEW_STATUSES.join(', ')}`);
  if (overallRating !== undefined && overallRating !== null && (overallRating < 1 || overallRating > 5)) throw new ApiError(400, 'overallRating must be between 1 and 5');

  const existing = await db.query('SELECT * FROM performance_reviews WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Review not found');

  if (!canManage(req.user)) {
    const own = await findOwnEmployee(req);
    if (!own || own.id !== existing.rows[0].reviewer_id) throw new ApiError(403, "Only the review's author can edit it");
  }

  const submittedAt = status === 'submitted' ? new Date() : undefined;
  const { rows } = await db.query(
    `UPDATE performance_reviews SET
       overall_rating = COALESCE($1,overall_rating), strengths = COALESCE($2,strengths),
       areas_for_improvement = COALESCE($3,areas_for_improvement), comments = COALESCE($4,comments),
       promotion_recommended = COALESCE($5,promotion_recommended), promotion_notes = COALESCE($6,promotion_notes),
       status = COALESCE($7,status), submitted_at = COALESCE($8, submitted_at), updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [overallRating, strengths, areasForImprovement, comments, promotionRecommended, promotionNotes, status, submittedAt, id]
  );
  res.json(rows[0]);
});

// ---------------- Reports ----------------

// GET /hr-reports/performance-summary?cycleId=
const getPerformanceSummary = asyncHandler(async (req, res) => {
  const { cycleId } = req.query;
  if (!cycleId) throw new ApiError(400, 'cycleId is required');

  const byDepartment = await db.query(
    `SELECT COALESCE(e.department, 'Unassigned') AS department,
            ROUND(AVG(r.overall_rating)::numeric, 2) AS avg_rating,
            COUNT(*)::int AS review_count
     FROM performance_reviews r JOIN employees e ON e.id = r.employee_id
     WHERE r.company_id = $1 AND r.cycle_id = $2 AND r.review_type = 'supervisor' AND r.overall_rating IS NOT NULL
     GROUP BY e.department ORDER BY avg_rating DESC`,
    [req.user.companyId, cycleId]
  );

  const goalCompletion = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM performance_goals
     WHERE company_id = $1 GROUP BY status`,
    [req.user.companyId]
  );

  const promotions = await db.query(
    `SELECT r.id, e.first_name, e.last_name, e.job_title, e.department, r.promotion_notes, r.overall_rating
     FROM performance_reviews r JOIN employees e ON e.id = r.employee_id
     WHERE r.company_id = $1 AND r.cycle_id = $2 AND r.promotion_recommended = TRUE AND r.review_type = 'supervisor'
     ORDER BY r.overall_rating DESC NULLS LAST`,
    [req.user.companyId, cycleId]
  );

  res.json({ byDepartment: byDepartment.rows, goalCompletion: goalCompletion.rows, promotions: promotions.rows });
});

module.exports = {
  listKpis, createKpi, updateKpi,
  listCycles, createCycle, updateCycle,
  listGoals, createGoal, updateGoal,
  listReviewsForEmployee, createReview, updateReview,
  getPerformanceSummary,
};
