const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');
const { seedOnboardingSteps } = require('../services/onboardingService');

const POSTING_STATUSES = ['open', 'on_hold', 'closed'];
const SOURCES = ['referral', 'job_board', 'direct', 'agency', 'other'];
const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const OUTCOMES = ['pending', 'pass', 'fail'];

// ---------------- Job postings ----------------

const listJobPostings = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const conditions = ['company_id = $1'];
  const params = [req.user.companyId];
  if (status) {
    if (!POSTING_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${POSTING_STATUSES.join(', ')}`);
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT jp.*, (SELECT COUNT(*)::int FROM candidates c WHERE c.job_posting_id = jp.id AND c.stage NOT IN ('rejected')) AS active_candidate_count
     FROM job_postings jp WHERE ${conditions.join(' AND ')} ORDER BY jp.created_at DESC`,
    params
  );
  res.json(rows);
});

const createJobPosting = asyncHandler(async (req, res) => {
  const { title, department, description, employmentType, positionsAvailable, targetHireDate } = req.body;
  if (!title) throw new ApiError(400, 'title is required');

  const { rows } = await db.query(
    `INSERT INTO job_postings (company_id, title, department, description, employment_type, positions_available, target_hire_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, title, department || null, description || null, employmentType || 'full_time',
      positionsAvailable || 1, targetHireDate || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'job_posting', entityId: rows[0].id, newValues: { title }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateJobPosting = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, department, description, employmentType, positionsAvailable, status, targetHireDate } = req.body;
  if (status && !POSTING_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${POSTING_STATUSES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE job_postings SET
       title = COALESCE($1, title), department = COALESCE($2, department), description = COALESCE($3, description),
       employment_type = COALESCE($4, employment_type), positions_available = COALESCE($5, positions_available),
       status = COALESCE($6, status), target_hire_date = COALESCE($7, target_hire_date), updated_at = NOW()
     WHERE id = $8 AND company_id = $9 RETURNING *`,
    [title, department, description, employmentType, positionsAvailable, status, targetHireDate, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Job posting not found');
  res.json(rows[0]);
});

// ---------------- Candidates ----------------

const listCandidates = asyncHandler(async (req, res) => {
  const { stage, jobPostingId } = req.query;
  const conditions = ['c.company_id = $1'];
  const params = [req.user.companyId];
  if (stage) {
    if (!STAGES.includes(stage)) throw new ApiError(400, `stage must be one of: ${STAGES.join(', ')}`);
    params.push(stage);
    conditions.push(`c.stage = $${params.length}`);
  }
  if (jobPostingId) {
    params.push(jobPostingId);
    conditions.push(`c.job_posting_id = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT c.*, jp.title AS job_posting_title
     FROM candidates c LEFT JOIN job_postings jp ON jp.id = c.job_posting_id
     WHERE ${conditions.join(' AND ')} ORDER BY c.applied_date DESC`,
    params
  );
  res.json(rows);
});

const getCandidate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT c.*, jp.title AS job_posting_title
     FROM candidates c LEFT JOIN job_postings jp ON jp.id = c.job_posting_id
     WHERE c.id = $1 AND c.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Candidate not found');

  const interviews = await db.query(
    `SELECT ci.*, u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
     FROM candidate_interviews ci LEFT JOIN users u ON u.id = ci.created_by
     WHERE ci.candidate_id = $1 ORDER BY ci.scheduled_at DESC NULLS LAST, ci.created_at DESC`,
    [id]
  );
  res.json({ ...header.rows[0], interviews: interviews.rows });
});

const createCandidate = asyncHandler(async (req, res) => {
  const { jobPostingId, firstName, lastName, email, phone, source, expectedSalary, notes, appliedDate } = req.body;
  if (!firstName || !lastName) throw new ApiError(400, 'firstName and lastName are required');
  if (source && !SOURCES.includes(source)) throw new ApiError(400, `source must be one of: ${SOURCES.join(', ')}`);

  const { rows } = await db.query(
    `INSERT INTO candidates (company_id, job_posting_id, first_name, last_name, email, phone, source, expected_salary, notes, applied_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user.companyId, jobPostingId || null, firstName, lastName, email || null, phone || null,
      source || 'other', expectedSalary || null, notes || null, appliedDate || new Date().toISOString().slice(0, 10), req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'candidate', entityId: rows[0].id, newValues: { firstName, lastName }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateCandidate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { jobPostingId, firstName, lastName, email, phone, source, stage, expectedSalary, rejectedReason, notes } = req.body;
  if (source && !SOURCES.includes(source)) throw new ApiError(400, `source must be one of: ${SOURCES.join(', ')}`);
  if (stage && !STAGES.includes(stage)) throw new ApiError(400, `stage must be one of: ${STAGES.join(', ')}`);
  if (stage === 'rejected' && !rejectedReason) throw new ApiError(400, 'rejectedReason is required when rejecting a candidate');

  const { rows } = await db.query(
    `UPDATE candidates SET
       job_posting_id = COALESCE($1, job_posting_id), first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name), email = COALESCE($4, email), phone = COALESCE($5, phone),
       source = COALESCE($6, source), stage = COALESCE($7, stage), expected_salary = COALESCE($8, expected_salary),
       rejected_reason = COALESCE($9, rejected_reason), notes = COALESCE($10, notes), updated_at = NOW()
     WHERE id = $11 AND company_id = $12 RETURNING *`,
    [jobPostingId, firstName, lastName, email, phone, source, stage, expectedSalary, rejectedReason, notes, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Candidate not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'candidate', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// POST /candidates/:id/interviews { roundName, scheduledAt, interviewerNotes, outcome, rating }
const addInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { roundName, scheduledAt, interviewerNotes, outcome, rating } = req.body;
  if (!roundName) throw new ApiError(400, 'roundName is required');
  if (outcome && !OUTCOMES.includes(outcome)) throw new ApiError(400, `outcome must be one of: ${OUTCOMES.join(', ')}`);
  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) throw new ApiError(400, 'rating must be between 1 and 5');

  const owner = await db.query('SELECT 1 FROM candidates WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!owner.rows.length) throw new ApiError(404, 'Candidate not found');

  const { rows } = await db.query(
    `INSERT INTO candidate_interviews (company_id, candidate_id, round_name, scheduled_at, interviewer_notes, outcome, rating, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, id, roundName, scheduledAt || null, interviewerNotes || null, outcome || 'pending', rating || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// POST /candidates/:id/hire { jobTitle, department, hireDate, basicSalary, allowances, employmentType }
// Converts an offer-stage candidate into a real employee record.
const hireCandidate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { jobTitle, department, hireDate, basicSalary, allowances, employmentType } = req.body;
  if (!hireDate) throw new ApiError(400, 'hireDate is required');

  const candRes = await db.query('SELECT * FROM candidates WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!candRes.rows.length) throw new ApiError(404, 'Candidate not found');
  const candidate = candRes.rows[0];
  if (candidate.stage === 'hired') throw new ApiError(400, 'This candidate has already been hired');

  const countResult = await db.query('SELECT COUNT(*)::int AS n FROM employees WHERE company_id = $1', [req.user.companyId]);
  const employeeNo = `EMP-${String(countResult.rows[0].n + 1).padStart(4, '0')}`;

  const empRes = await db.query(
    `INSERT INTO employees (company_id, employee_no, first_name, last_name, email, phone, job_title, department, employment_type, hire_date, basic_salary, allowances, created_by, probation_status, probation_end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [req.user.companyId, employeeNo, candidate.first_name, candidate.last_name, candidate.email, candidate.phone,
      jobTitle || null, department || null, employmentType || 'full_time', hireDate, basicSalary || 0, allowances || 0, req.user.id,
      'on_probation', new Date(new Date(hireDate).getTime() + 90 * 86400000).toISOString().slice(0, 10)]
  );

  await db.query(
    `INSERT INTO employee_history (company_id, employee_id, change_type, note, effective_date, changed_by)
     VALUES ($1,$2,'hired',$3,$4,$5)`,
    [req.user.companyId, empRes.rows[0].id, 'Hired via recruitment pipeline', hireDate, req.user.id]
  );

  await seedOnboardingSteps(req.user.companyId, empRes.rows[0].id, hireDate);

  const updatedCandidate = await db.query(
    `UPDATE candidates SET stage = 'hired', converted_employee_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [empRes.rows[0].id, id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'employee', entityId: empRes.rows[0].id, newValues: { hiredFromCandidate: id }, ip: req.ip });
  res.status(201).json({ employee: empRes.rows[0], candidate: updatedCandidate.rows[0] });
});

module.exports = {
  listJobPostings, createJobPosting, updateJobPosting,
  listCandidates, getCandidate, createCandidate, updateCandidate,
  addInterview, hireCandidate,
};
