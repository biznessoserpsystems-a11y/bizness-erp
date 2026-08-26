const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const TIMESHEET_STATUSES = ['draft', 'submitted', 'approved', 'rejected'];
const LOAN_STATUSES = ['pending', 'approved', 'rejected', 'repaying', 'completed'];

async function findOwnEmployee(req) {
  const { rows } = await db.query('SELECT * FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
  return rows[0] || null;
}

function canManageTimesheets(user) {
  return (user.permissions || []).includes('hr.timesheets.manage');
}
function canManageLoans(user) {
  return (user.permissions || []).includes('hr.loans.manage');
}

// GET /me/employee — the linked employee record for the current user, or null
const getMyEmployee = asyncHandler(async (req, res) => {
  const employee = await findOwnEmployee(req);
  res.json(employee);
});

// GET /me/payslips
const getMyPayslips = asyncHandler(async (req, res) => {
  const employee = await findOwnEmployee(req);
  if (!employee) throw new ApiError(400, 'Your user account is not linked to an employee record');

  const { rows } = await db.query(
    `SELECT p.*, pr.period_month, pr.period_year, pr.status AS run_status
     FROM payslips p JOIN payroll_runs pr ON pr.id = p.payroll_run_id
     WHERE p.employee_id = $1 ORDER BY pr.period_year DESC, pr.period_month DESC`,
    [employee.id]
  );
  res.json(rows);
});

// GET /me/leave-balance — days_per_year minus approved days taken this calendar year, per leave type
const getMyLeaveBalance = asyncHandler(async (req, res) => {
  const employee = await findOwnEmployee(req);
  if (!employee) throw new ApiError(400, 'Your user account is not linked to an employee record');

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;

  const { rows } = await db.query(
    `SELECT lt.id, lt.name, lt.days_per_year, lt.is_paid,
            COALESCE(SUM(lr.days) FILTER (WHERE lr.status = 'approved'), 0)::int AS days_taken
     FROM leave_types lt
     LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id AND lr.employee_id = $1
       AND lr.start_date >= $2 AND lr.start_date <= $3
     WHERE lt.company_id = $4
     GROUP BY lt.id, lt.name, lt.days_per_year, lt.is_paid
     ORDER BY lt.name`,
    [employee.id, yearStart, yearEnd, req.user.companyId]
  );
  res.json(rows.map((r) => ({ ...r, days_remaining: r.days_per_year - r.days_taken })));
});

// ---------------- Timesheets ----------------

// GET /timesheets?employeeId=&status=
const listTimesheets = asyncHandler(async (req, res) => {
  const { employeeId, status } = req.query;
  const conditions = ['t.company_id = $1'];
  const params = [req.user.companyId];

  if (status) {
    if (!TIMESHEET_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${TIMESHEET_STATUSES.join(', ')}`);
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (employeeId) {
    if (!canManageTimesheets(req.user)) {
      const own = await findOwnEmployee(req);
      if (!own || own.id !== employeeId) throw new ApiError(403, 'You can only view your own timesheets');
    }
    params.push(employeeId);
    conditions.push(`t.employee_id = $${params.length}`);
  } else if (!canManageTimesheets(req.user)) {
    const own = await findOwnEmployee(req);
    if (!own) throw new ApiError(403, 'Missing required permission: hr.timesheets.manage');
    params.push(own.id);
    conditions.push(`t.employee_id = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT t.*, e.first_name, e.last_name, e.employee_no
     FROM timesheets t JOIN employees e ON e.id = t.employee_id
     WHERE ${conditions.join(' AND ')} ORDER BY t.period_start DESC`,
    params
  );
  res.json(rows);
});

// POST /timesheets { periodStart, periodEnd, totalHours, notes } — always for the caller's own employee record
const createTimesheet = asyncHandler(async (req, res) => {
  const { periodStart, periodEnd, totalHours, notes } = req.body;
  if (!periodStart || !periodEnd || totalHours == null) throw new ApiError(400, 'periodStart, periodEnd, and totalHours are required');
  if (new Date(periodEnd) < new Date(periodStart)) throw new ApiError(400, 'periodEnd must be on or after periodStart');

  const employee = await findOwnEmployee(req);
  if (!employee) throw new ApiError(400, 'Your user account is not linked to an employee record');

  const { rows } = await db.query(
    `INSERT INTO timesheets (company_id, employee_id, period_start, period_end, total_hours, notes, status, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,'submitted',NOW())
     ON CONFLICT (employee_id, period_start) DO UPDATE SET
       period_end = EXCLUDED.period_end, total_hours = EXCLUDED.total_hours, notes = EXCLUDED.notes,
       status = 'submitted', submitted_at = NOW(), updated_at = NOW()
     RETURNING *`,
    [req.user.companyId, employee.id, periodStart, periodEnd, totalHours, notes || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /timesheets/:id/status { status, rejectionReason } — hr.timesheets.manage only
const updateTimesheetStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;
  if (!TIMESHEET_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${TIMESHEET_STATUSES.join(', ')}`);
  if (status === 'rejected' && !rejectionReason) throw new ApiError(400, 'rejectionReason is required when rejecting a timesheet');

  const { rows } = await db.query(
    `UPDATE timesheets SET status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $4 AND company_id = $5 RETURNING *`,
    [status, status === 'rejected' ? rejectionReason : null, req.user.id, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Timesheet not found');
  res.json(rows[0]);
});

// ---------------- Employee loans ----------------

// GET /loans?employeeId=&status=
const listLoans = asyncHandler(async (req, res) => {
  const { employeeId, status } = req.query;
  const conditions = ['l.company_id = $1'];
  const params = [req.user.companyId];

  if (status) {
    if (!LOAN_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${LOAN_STATUSES.join(', ')}`);
    params.push(status);
    conditions.push(`l.status = $${params.length}`);
  }

  if (employeeId) {
    if (!canManageLoans(req.user)) {
      const own = await findOwnEmployee(req);
      if (!own || own.id !== employeeId) throw new ApiError(403, 'You can only view your own loans');
    }
    params.push(employeeId);
    conditions.push(`l.employee_id = $${params.length}`);
  } else if (!canManageLoans(req.user)) {
    const own = await findOwnEmployee(req);
    if (!own) throw new ApiError(403, 'Missing required permission: hr.loans.manage');
    params.push(own.id);
    conditions.push(`l.employee_id = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT l.*, e.first_name, e.last_name, e.employee_no
     FROM employee_loans l JOIN employees e ON e.id = l.employee_id
     WHERE ${conditions.join(' AND ')} ORDER BY l.requested_date DESC`,
    params
  );
  res.json(rows);
});

// POST /loans { amount, reason } — always for the caller's own employee record
const createLoanRequest = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'amount must be a positive number');

  const employee = await findOwnEmployee(req);
  if (!employee) throw new ApiError(400, 'Your user account is not linked to an employee record');

  const { rows } = await db.query(
    `INSERT INTO employee_loans (company_id, employee_id, amount, reason) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.companyId, employee.id, amount, reason || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /loans/:id/status { status, monthlyDeduction, rejectionReason } — hr.loans.manage only
const updateLoanStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, monthlyDeduction, rejectionReason } = req.body;
  if (!LOAN_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${LOAN_STATUSES.join(', ')}`);
  if (status === 'rejected' && !rejectionReason) throw new ApiError(400, 'rejectionReason is required when rejecting a loan');
  if (status === 'approved' && !monthlyDeduction) throw new ApiError(400, 'monthlyDeduction is required when approving a loan');

  const existing = await db.query('SELECT * FROM employee_loans WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Loan not found');

  const balanceRemaining = status === 'approved' ? existing.rows[0].amount : existing.rows[0].balance_remaining;

  const { rows } = await db.query(
    `UPDATE employee_loans SET
       status = $1::varchar, monthly_deduction = COALESCE($2, monthly_deduction), balance_remaining = $3,
       rejection_reason = $4, approved_by = $5, approved_at = CASE WHEN $1::varchar = 'approved' THEN NOW() ELSE approved_at END,
       updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [status, monthlyDeduction || null, balanceRemaining, status === 'rejected' ? rejectionReason : null, req.user.id, id]
  );
  res.json(rows[0]);
});

// POST /loans/:id/repayment { amount } — hr.loans.manage only; records a manual repayment against the balance
const recordLoanRepayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'amount must be a positive number');

  const existing = await db.query('SELECT * FROM employee_loans WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Loan not found');
  if (!['repaying', 'approved'].includes(existing.rows[0].status)) throw new ApiError(400, 'This loan is not in a repayable state');

  const newBalance = Math.max(0, Number(existing.rows[0].balance_remaining) - Number(amount));
  const newStatus = newBalance === 0 ? 'completed' : 'repaying';

  const { rows } = await db.query(
    `UPDATE employee_loans SET balance_remaining = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
    [newBalance, newStatus, id]
  );
  res.json(rows[0]);
});

module.exports = {
  getMyEmployee, getMyPayslips, getMyLeaveBalance,
  listTimesheets, createTimesheet, updateTimesheetStatus,
  listLoans, createLoanRequest, updateLoanStatus, recordLoanRepayment,
};
