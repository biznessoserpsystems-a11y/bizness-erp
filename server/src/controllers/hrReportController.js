const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /hr-reports/headcount-summary
// Backs both the Departmental Reports and HR Reports pages: headcount and
// monthly salary cost grouped by department (a free-text field on
// employees — there's no separate departments table), plus overall
// employment-status counts and recent hiring activity.
const headcountSummary = asyncHandler(async (req, res) => {
  const byDepartment = await db.query(
    `SELECT COALESCE(NULLIF(department, ''), 'Unassigned') AS department,
            COUNT(*) FILTER (WHERE employment_status = 'active')::int AS active_count,
            COUNT(*)::int AS total_count,
            COALESCE(SUM(basic_salary + allowances) FILTER (WHERE employment_status = 'active'), 0) AS monthly_cost
     FROM employees
     WHERE company_id = $1
     GROUP BY department
     ORDER BY active_count DESC`,
    [req.user.companyId]
  );

  const byStatus = await db.query(
    `SELECT employment_status, COUNT(*)::int AS count
     FROM employees WHERE company_id = $1 GROUP BY employment_status`,
    [req.user.companyId]
  );

  const newHires = await db.query(
    `SELECT COUNT(*)::int AS count FROM employees
     WHERE company_id = $1 AND hire_date >= CURRENT_DATE - INTERVAL '30 days'`,
    [req.user.companyId]
  );

  res.json({
    byDepartment: byDepartment.rows,
    byStatus: byStatus.rows,
    newHiresLast30Days: newHires.rows[0].count,
  });
});

// GET /hr-reports/payroll-cost-trend?periods=6
const payrollCostTrend = asyncHandler(async (req, res) => {
  const periods = Math.min(Math.max(Number(req.query.periods) || 6, 1), 24);

  const { rows } = await db.query(
    `SELECT period_year, period_month, total_gross, total_deductions, total_net, status
     FROM payroll_runs
     WHERE company_id = $1
     ORDER BY period_year DESC, period_month DESC
     LIMIT $2`,
    [req.user.companyId, periods]
  );

  res.json(rows.reverse());
});

// GET /hr-reports/attendance-by-department?from=&to= — the department-level
// counterpart to hrPayrollController's getAttendanceSummary (which is
// per-employee); groups the same attendance_records by the employee's
// department instead, for the Departmental Reports page.
const attendanceByDepartment = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const { rows } = await db.query(
    `SELECT COALESCE(NULLIF(e.department, ''), 'Unassigned') AS department,
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present_count,
            COUNT(*) FILTER (WHERE a.status = 'late')::int AS late_count,
            COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent_count,
            COUNT(*)::int AS total_records
     FROM attendance_records a JOIN employees e ON e.id = a.employee_id
     WHERE a.company_id = $1 AND a.work_date >= $2 AND a.work_date <= $3
     GROUP BY department
     ORDER BY department`,
    [req.user.companyId, from, to]
  );

  res.json(rows);
});

module.exports = { headcountSummary, payrollCostTrend, attendanceByDepartment };
