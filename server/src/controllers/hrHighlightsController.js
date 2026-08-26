const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { accountBalance } = require('./statutoryComplianceController');

function pct(n, d) {
  return d && Math.abs(d) > 0.0001 ? (n / d) * 100 : null;
}

async function headcountAt(companyId, asOf) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS active_count FROM employees
     WHERE company_id = $1 AND hire_date <= $2 AND (termination_date IS NULL OR termination_date > $2)`,
    [companyId, asOf]
  );
  return Number(rows[0].active_count);
}

/**
 * GET /hr-reports/hr-highlights?from=&to=
 * Consolidates the full HR Highlights report into one call. Every section
 * either comes from a real table or is explicitly marked unavailable — this
 * schema simply doesn't track a few things the template asks for (Employee
 * Satisfaction survey scores, recruitment cost, Lost Time Injuries as a
 * distinct metric from general safety incidents, a Productivity Index, or a
 * "Payroll Accuracy" QA metric) and those are surfaced as `null` with a
 * clear reason rather than a fabricated number.
 */
const hrHighlights = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const companyId = req.user.companyId;

  const prevMonthTo = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10);
  const prevMonthFrom = new Date(new Date(prevMonthTo).getFullYear(), new Date(prevMonthTo).getMonth(), 1).toISOString().slice(0, 10);
  const prevYearFrom = new Date(new Date(from).getFullYear() - 1, new Date(from).getMonth(), new Date(from).getDate()).toISOString().slice(0, 10);
  const prevYearTo = new Date(new Date(to).getFullYear() - 1, new Date(to).getMonth(), new Date(to).getDate()).toISOString().slice(0, 10);

  // ---- 1. HR Highlights KPIs ----
  const [totalNow, totalPrevMonth, totalPrevYear] = await Promise.all([
    headcountAt(companyId, to),
    headcountAt(companyId, prevMonthTo),
    headcountAt(companyId, prevYearTo),
  ]);

  const { rows: hiresRows } = await db.query(
    `SELECT COUNT(*) AS c FROM employee_history WHERE company_id = $1 AND change_type = 'hired' AND effective_date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const { rows: termRows } = await db.query(
    `SELECT COUNT(*) AS c FROM employee_history WHERE company_id = $1 AND change_type = 'terminated' AND effective_date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const newHires = Number(hiresRows[0].c);
  const resignations = Number(termRows[0].c);
  const avgHeadcount = (totalNow + totalPrevMonth) / 2;
  const turnoverRate = pct(resignations, avgHeadcount);

  const { rows: attRows } = await db.query(
    `SELECT status, COUNT(*) AS c FROM attendance_records WHERE company_id = $1 AND work_date BETWEEN $2 AND $3 GROUP BY status`,
    [companyId, from, to]
  );
  const attByStatus = Object.fromEntries(attRows.map((r) => [r.status, Number(r.c)]));
  const attTotal = attRows.reduce((s, r) => s + Number(r.c), 0);
  const presentLike = (attByStatus.present || 0) + (attByStatus.late || 0) + (attByStatus.half_day || 0);
  const attendanceRate = pct(presentLike, attTotal);

  const { rows: trainingRows } = await db.query(
    `SELECT COUNT(*) AS c FROM training_sessions WHERE company_id = $1 AND status = 'completed' AND starts_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );

  const kpis = {
    totalEmployees: { current: totalNow, previousMonth: totalPrevMonth, previousYear: totalPrevYear },
    newHires: { current: newHires },
    resignations: { current: resignations },
    staffTurnoverRate: { current: turnoverRate },
    averageAttendance: { current: attendanceRate },
    trainingSessions: { current: Number(trainingRows[0].c) },
    employeeSatisfaction: { current: null, note: 'No employee satisfaction survey data is captured anywhere in this system yet.' },
  };

  // ---- 2. Workforce Summary: distribution by department x gender ----
  const { rows: workforceRows } = await db.query(
    `SELECT COALESCE(department, 'Unassigned') AS department, COALESCE(gender, 'Unspecified') AS gender, COUNT(*) AS c
     FROM employees WHERE company_id = $1 AND employment_status != 'terminated'
     GROUP BY department, gender`,
    [companyId]
  );
  const workforceMap = {};
  for (const r of workforceRows) {
    workforceMap[r.department] = workforceMap[r.department] || { department: r.department, male: 0, female: 0, other: 0, total: 0 };
    const g = r.gender.toLowerCase();
    if (g === 'male') workforceMap[r.department].male += Number(r.c);
    else if (g === 'female') workforceMap[r.department].female += Number(r.c);
    else workforceMap[r.department].other += Number(r.c);
    workforceMap[r.department].total += Number(r.c);
  }
  const workforceSummary = Object.values(workforceMap);
  const totalActiveEmployees = workforceSummary.reduce((s, d) => s + d.total, 0);

  // ---- 3. Recruitment Report ----
  const { rows: postings } = await db.query(
    `SELECT id, title, department, positions_available FROM job_postings WHERE company_id = $1 AND status = 'open'`,
    [companyId]
  );
  const recruitment = [];
  for (const p of postings) {
    const { rows: candRows } = await db.query(
      `SELECT stage, COUNT(*) AS c FROM candidates WHERE company_id = $1 AND job_posting_id = $2 GROUP BY stage`,
      [companyId, p.id]
    );
    const byStage = Object.fromEntries(candRows.map((r) => [r.stage, Number(r.c)]));
    const applied = Object.values(byStage).reduce((s, v) => s + v, 0);
    const { rows: interviewedRows } = await db.query(
      `SELECT COUNT(DISTINCT ci.candidate_id) AS c FROM candidate_interviews ci
       JOIN candidates c ON c.id = ci.candidate_id WHERE c.company_id = $1 AND c.job_posting_id = $2`,
      [companyId, p.id]
    );
    const hired = byStage.hired || 0;
    const rejected = byStage.rejected || 0;
    recruitment.push({
      position: p.title, vacancies: p.positions_available, applied,
      interviewed: Number(interviewedRows[0].c), hired, pending: applied - hired - rejected,
    });
  }
  const totalApplied = recruitment.reduce((s, r) => s + r.applied, 0);
  const totalHired = recruitment.reduce((s, r) => s + r.hired, 0);
  const totalVacancies = recruitment.reduce((s, r) => s + r.vacancies, 0);
  const recruitmentKpis = {
    averageHiringTime: { value: null, note: 'No applied-to-hire date pairing is tracked to compute this reliably.' },
    costPerHire: { value: null, note: 'Recruitment cost is not tracked anywhere in this system.' },
    offerAcceptanceRate: { value: null, note: 'Offer-stage history is not retained once a candidate moves past it, so acceptance rate cannot be reconstructed.' },
    vacancyFillRate: { value: pct(totalHired, totalVacancies) },
  };

  // ---- 4. Attendance Report ----
  const { rows: prevAttRows } = await db.query(
    `SELECT status, COUNT(*) AS c FROM attendance_records WHERE company_id = $1 AND work_date BETWEEN $2 AND $3 GROUP BY status`,
    [companyId, prevMonthFrom, prevMonthTo]
  );
  const prevAttByStatus = Object.fromEntries(prevAttRows.map((r) => [r.status, Number(r.c)]));
  const prevAttTotal = prevAttRows.reduce((s, r) => s + Number(r.c), 0);
  const prevPresentLike = (prevAttByStatus.present || 0) + (prevAttByStatus.late || 0) + (prevAttByStatus.half_day || 0);

  const { rows: leaveTypeRows } = await db.query(
    `SELECT lt.name, COUNT(*) AS c FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.company_id = $1 AND lr.status = 'approved' AND lr.start_date BETWEEN $2 AND $3 GROUP BY lt.name`,
    [companyId, from, to]
  );
  const leaveTypeCounts = Object.fromEntries(leaveTypeRows.map((r) => [r.name.toLowerCase(), Number(r.c)]));

  const attendanceReport = {
    attendanceRate: { current: attendanceRate, previous: pct(prevPresentLike, prevAttTotal) },
    lateArrivals: { current: attByStatus.late || 0, previous: prevAttByStatus.late || 0 },
    earlyDepartures: { current: null, note: 'Early departure isn\'t tracked distinctly — would need each attendance record compared against its shift\'s scheduled end time.' },
    absentWithoutPermission: { current: attByStatus.absent || 0, previous: prevAttByStatus.absent || 0, note: 'Reported as total "absent" status records — this schema doesn\'t distinguish authorized vs. unauthorized absence.' },
    sickLeave: { current: leaveTypeCounts.sick || 0 },
    annualLeave: { current: leaveTypeCounts.annual || 0 },
  };

  // ---- 5. Leave Report ----
  const { rows: leaveReportRows } = await db.query(
    `SELECT lt.name AS leave_type, lr.status, COUNT(*) AS c
     FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.company_id = $1 AND lr.start_date BETWEEN $2 AND $3
     GROUP BY lt.name, lr.status`,
    [companyId, from, to]
  );
  const leaveReportMap = {};
  for (const r of leaveReportRows) {
    leaveReportMap[r.leave_type] = leaveReportMap[r.leave_type] || { leaveType: r.leave_type, approved: 0, pending: 0, rejected: 0 };
    if (r.status === 'approved') leaveReportMap[r.leave_type].approved = Number(r.c);
    else if (r.status === 'pending') leaveReportMap[r.leave_type].pending = Number(r.c);
    else if (r.status === 'rejected') leaveReportMap[r.leave_type].rejected = Number(r.c);
  }
  const leaveReport = Object.values(leaveReportMap);

  // ---- 6. Payroll Summary ----
  const { rows: payslipRows } = await db.query(
    `SELECT COALESCE(SUM(p.basic_salary),0) AS basic_salary, COALESCE(SUM(p.allowances),0) AS allowances,
            COALESCE(SUM(p.gross_pay),0) AS gross_pay, COALESCE(SUM(p.ssnit_employee),0) AS ssnit_employee,
            COALESCE(SUM(p.income_tax),0) AS income_tax, COALESCE(SUM(p.other_deductions),0) AS other_deductions,
            COALESCE(SUM(p.net_pay),0) AS net_pay
     FROM payslips p JOIN payroll_runs pr ON pr.id = p.payroll_run_id
     WHERE p.company_id = $1 AND make_date(pr.period_year, pr.period_month, 1) BETWEEN date_trunc('month', $2::date) AND $3::date`,
    [companyId, from, to]
  );
  const ps = payslipRows[0];
  const payrollSummary = {
    grossSalary: Number(ps.gross_pay), basicSalary: Number(ps.basic_salary), allowances: Number(ps.allowances),
    paye: Number(ps.income_tax), ssnitEmployee: Number(ps.ssnit_employee), otherDeductions: Number(ps.other_deductions),
    netPayroll: Number(ps.net_pay),
    note: 'Overtime, bonuses, SSNIT Tier 2, and loan deductions are not tracked as separate payslip line items in this system — they fall within Allowances/Other Deductions above rather than being fabricated as a split that doesn\'t exist in the data.',
  };

  // ---- 7. Employee Performance ----
  const { rows: perfRows } = await db.query(
    `SELECT overall_rating FROM performance_reviews
     WHERE company_id = $1 AND status = 'submitted' AND submitted_at::date BETWEEN $2 AND $3 AND overall_rating IS NOT NULL`,
    [companyId, from, to]
  );
  const perfBuckets = { Excellent: 0, 'Very Good': 0, Good: 0, Fair: 0, Poor: 0 };
  for (const r of perfRows) {
    const v = Number(r.overall_rating);
    if (v >= 4.5) perfBuckets.Excellent += 1;
    else if (v >= 3.5) perfBuckets['Very Good'] += 1;
    else if (v >= 2.5) perfBuckets.Good += 1;
    else if (v >= 1.5) perfBuckets.Fair += 1;
    else perfBuckets.Poor += 1;
  }
  const totalReviews = perfRows.length;
  const employeePerformance = Object.entries(perfBuckets).map(([rating, employees]) => ({ rating, employees, pct: pct(employees, totalReviews) }));

  // ---- 8. Training & Development ----
  const { rows: trainingDetailRows } = await db.query(
    `SELECT ts.id, tc.title, tc.cost_per_participant, ts.actual_cost,
            COUNT(te.id) AS participants,
            COUNT(*) FILTER (WHERE te.completion_status = 'passed') AS passed
     FROM training_sessions ts
     JOIN training_courses tc ON tc.id = ts.course_id
     LEFT JOIN training_enrollments te ON te.session_id = ts.id
     WHERE ts.company_id = $1 AND ts.starts_at::date BETWEEN $2 AND $3
     GROUP BY ts.id, tc.title, tc.cost_per_participant, ts.actual_cost`,
    [companyId, from, to]
  );
  const trainingDevelopment = trainingDetailRows.map((r) => {
    const participants = Number(r.participants);
    const cost = r.actual_cost !== null ? Number(r.actual_cost) : Number(r.cost_per_participant) * participants;
    return { training: r.title, participants, cost, completionRate: pct(Number(r.passed), participants) };
  });

  // ---- 9. Employee Turnover ----
  const { rows: turnoverRows } = await db.query(
    `SELECT COALESCE(termination_reason, 'unspecified') AS reason, COUNT(*) AS c
     FROM employee_history WHERE company_id = $1 AND change_type = 'terminated' AND effective_date BETWEEN $2 AND $3
     GROUP BY termination_reason`,
    [companyId, from, to]
  );
  const REASON_LABELS = { resignation: 'Resignation', retirement: 'Retirement', involuntary_termination: 'Termination', end_of_contract: 'End of Contract', unspecified: 'Unspecified' };
  const employeeTurnover = turnoverRows.map((r) => ({ reason: REASON_LABELS[r.reason] || r.reason, employees: Number(r.c) }));

  // ---- 10. Disciplinary Cases ----
  // This schema tracks severity (low/medium/high) and status, not the
  // template's specific action-type rows (Warning Letter / Suspension /
  // Investigation / Termination) — presented by severity x status instead
  // of forcing a mapping this data doesn't actually support.
  const { rows: discRows } = await db.query(
    `SELECT severity, status FROM compliance_incidents
     WHERE company_id = $1 AND incident_type = 'disciplinary' AND incident_date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const discBuckets = { low: { open: 0, closed: 0 }, medium: { open: 0, closed: 0 }, high: { open: 0, closed: 0 } };
  for (const r of discRows) {
    const isOpen = r.status === 'open' || r.status === 'investigating';
    discBuckets[r.severity][isOpen ? 'open' : 'closed'] += 1;
  }
  const disciplinaryCases = Object.entries(discBuckets).map(([severity, v]) => ({ severity, ...v }));

  // ---- 11. Health & Safety ----
  const { rows: safetyRows } = await db.query(
    `SELECT status, COUNT(*) AS c FROM compliance_incidents
     WHERE company_id = $1 AND incident_type = 'safety_incident' AND incident_date BETWEEN $2 AND $3 GROUP BY status`,
    [companyId, from, to]
  );
  const workplaceIncidents = safetyRows.reduce((s, r) => s + Number(r.c), 0);
  const { rows: safetyTrainingRows } = await db.query(
    `SELECT COUNT(*) AS c FROM training_sessions ts JOIN training_courses tc ON tc.id = ts.course_id
     WHERE ts.company_id = $1 AND tc.category ILIKE '%safety%' AND ts.starts_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const healthAndSafety = {
    workplaceIncidents,
    lostTimeInjuries: { value: null, note: 'Not tracked as a distinct field — would need to know which incidents resulted in missed work days.' },
    medicalCases: { value: null, note: 'Not tracked — this schema records incidents generally, not a separate medical-case log.' },
    safetyTrainings: Number(safetyTrainingRows[0].c),
  };

  // ---- 12. Diversity Report ----
  // No explicit job-level field exists (only free-text job_title) — bucketed
  // by keyword match as a documented heuristic, not an exact classification.
  const { rows: diversityRows } = await db.query(
    `SELECT job_title, COALESCE(gender, 'Unspecified') AS gender, COUNT(*) AS c
     FROM employees WHERE company_id = $1 AND employment_status != 'terminated' GROUP BY job_title, gender`,
    [companyId]
  );
  const diversityBuckets = { Management: { male: 0, female: 0 }, Supervisors: { male: 0, female: 0 }, Staff: { male: 0, female: 0 } };
  for (const r of diversityRows) {
    const title = (r.job_title || '').toLowerCase();
    const level = /manager|director|head|chief|executive/.test(title) ? 'Management'
      : /supervisor|lead|coordinator/.test(title) ? 'Supervisors' : 'Staff';
    const g = r.gender.toLowerCase();
    if (g === 'male') diversityBuckets[level].male += Number(r.c);
    else if (g === 'female') diversityBuckets[level].female += Number(r.c);
  }
  const diversityReport = Object.entries(diversityBuckets).map(([category, v]) => ({ category, ...v }));

  // ---- 14. HR Compliance ----
  const [ssnit, paye] = await Promise.all([
    accountBalance(companyId, 'ssnit_payable'),
    accountBalance(companyId, 'paye_payable'),
  ]);
  const { rows: docCoverageRows } = await db.query(
    `SELECT COUNT(DISTINCT employee_id) AS c FROM compliance_documents WHERE company_id = $1 AND status = 'active'`,
    [companyId]
  );
  const hrCompliance = {
    ssnitRemittance: { balance: ssnit ? ssnit.balance : null, status: ssnit && Math.abs(ssnit.balance) < 0.01 ? 'Submitted' : 'Outstanding balance' },
    payeFiling: { balance: paye ? paye.balance : null, status: paye && Math.abs(paye.balance) < 0.01 ? 'Submitted' : 'Outstanding balance' },
    employeeFilesUpdated: pct(Number(docCoverageRows[0].c), totalActiveEmployees),
    employmentContracts: { status: null, note: 'Not tracked as its own compliance item in this schema.' },
    labourCompliance: { status: null, note: 'Not tracked as its own compliance item in this schema.' },
  };

  // ---- 15. HR KPI Dashboard ----
  const avgTrainingHoursRows = await db.query(
    `SELECT COALESCE(SUM(tc.duration_hours), 0) AS total_hours
     FROM training_enrollments te
     JOIN training_sessions ts ON ts.id = te.session_id
     JOIN training_courses tc ON tc.id = ts.course_id
     WHERE te.company_id = $1 AND te.completion_status = 'passed' AND ts.starts_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const totalTrainingHours = Number(avgTrainingHoursRows.rows[0].total_hours);
  const hrKpiDashboard = {
    employeeRetention: turnoverRate !== null ? 100 - turnoverRate : null,
    attendanceRate,
    productivityIndex: { value: null, note: 'No productivity metric is tracked anywhere in this system.' },
    employeeSatisfaction: { value: null, note: 'No employee satisfaction survey data is captured.' },
    recruitmentSuccessRate: pct(totalHired, totalApplied),
    averageTrainingHours: totalActiveEmployees > 0 ? totalTrainingHours / totalActiveEmployees : null,
    payrollAccuracy: { value: null, note: 'No payroll-correction/QA tracking exists to compute an accuracy rate from.' },
  };

  res.json({
    from, to,
    kpis,
    workforceSummary, totalActiveEmployees,
    recruitment, recruitmentKpis,
    attendanceReport,
    leaveReport,
    payrollSummary,
    employeePerformance,
    trainingDevelopment,
    employeeTurnover,
    disciplinaryCases,
    healthAndSafety,
    diversityReport,
    hrCompliance,
    hrKpiDashboard,
  });
});

module.exports = { hrHighlights };
