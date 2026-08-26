const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { generateStructuredInsight } = require('../utils/aiInsight');

// Shared by getAcademicInsights (feeds the AI prompt) and
// getExecutiveOverview (a fast, free, no-AI-call summary someone can
// load as often as they like) — computed once here rather than
// duplicating five queries between two endpoints with two different
// purposes but the same underlying numbers.
async function computeAcademicSummary(companyId) {
  const [enrollmentResult, attendanceResult, scoreResult, atRiskResult, feesResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'enrolled')::int AS enrolled,
              COUNT(*) FILTER (WHERE admission_date >= CURRENT_DATE - INTERVAL '30 days')::int AS new_this_month
       FROM students WHERE company_id = $1`,
      [companyId]
    ),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'present')::int AS present, COUNT(*)::int AS total
       FROM student_attendance WHERE company_id = $1 AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'`,
      [companyId]
    ),
    db.query(
      `SELECT AVG(er.score)::numeric(8,2) AS avg_score
       FROM exam_results er JOIN exams ex ON ex.id = er.exam_id
       WHERE er.company_id = $1 AND ex.exam_date >= CURRENT_DATE - INTERVAL '90 days'`,
      [companyId]
    ),
    // A student worth flagging: enrolled, and either poor attendance
    // (under 75% present over the last 30 days) or poor recent exam
    // performance (under 50 average over the last 90 days) — either
    // condition alone is worth a look, not only both together. A
    // student with no attendance or exam records yet simply doesn't
    // match either comparison (SQL's own NULL semantics handle this
    // correctly without an extra guard), so a brand-new admission
    // isn't miscounted as "at risk" for lack of data yet.
    db.query(
      `WITH attendance_rates AS (
         SELECT student_id, COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) * 100 AS pct
         FROM student_attendance WHERE company_id = $1 AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY student_id
       ), avg_scores AS (
         SELECT er.student_id, AVG(er.score) AS avg_score
         FROM exam_results er JOIN exams ex ON ex.id = er.exam_id
         WHERE er.company_id = $1 AND ex.exam_date >= CURRENT_DATE - INTERVAL '90 days'
         GROUP BY er.student_id
       )
       SELECT COUNT(*)::int AS at_risk_count
       FROM students s
       LEFT JOIN attendance_rates ar ON ar.student_id = s.id
       LEFT JOIN avg_scores av ON av.student_id = s.id
       WHERE s.company_id = $1 AND s.status = 'enrolled' AND (ar.pct < 75 OR av.avg_score < 50)`,
      [companyId]
    ),
    db.query(
      `SELECT COALESCE(SUM(total_amount - amount_paid), 0) AS outstanding
       FROM student_fee_invoices WHERE company_id = $1 AND status IN ('unpaid', 'partial')`,
      [companyId]
    ),
  ]);

  const attendanceTotal = attendanceResult.rows[0].total;
  const attendanceRate = attendanceTotal > 0 ? Number(((attendanceResult.rows[0].present / attendanceTotal) * 100).toFixed(1)) : null;

  return {
    enrolledStudents: enrollmentResult.rows[0].enrolled,
    newAdmissionsLast30Days: enrollmentResult.rows[0].new_this_month,
    attendanceRateLast30Days: attendanceRate,
    averageExamScoreLast90Days: scoreResult.rows[0].avg_score !== null ? Number(scoreResult.rows[0].avg_score) : null,
    atRiskStudentCount: atRiskResult.rows[0].at_risk_count,
    outstandingFees: Number(feesResult.rows[0].outstanding),
  };
}

// GET /school/academic-insights
// The AI-insights half of Academic Intelligence — the Report Builder
// half already lives in the four School data sources added to
// biRegistry.js. Same shared generateStructuredInsight pattern as
// every other domain's AI insight in this app: real data gathered
// server-side, four-part structured narrative (what happened, why,
// what's likely, what to do) generated from it, honest degradation
// when no ANTHROPIC_API_KEY is configured.
const getAcademicInsights = asyncHandler(async (req, res) => {
  const summary = await computeAcademicSummary(req.user.companyId);

  const dataSummaryText = `- Enrolled students: ${summary.enrolledStudents}
- New admissions in the last 30 days: ${summary.newAdmissionsLast30Days}
- Attendance rate over the last 30 days: ${summary.attendanceRateLast30Days !== null ? `${summary.attendanceRateLast30Days}%` : 'no attendance recorded yet'}
- Average exam score over the last 90 days: ${summary.averageExamScoreLast90Days !== null ? summary.averageExamScoreLast90Days : 'no exam results recorded yet'}
- Students flagged as at-risk (attendance under 75% or average score under 50 recently): ${summary.atRiskStudentCount}
- Outstanding school fees: GHS ${summary.outstandingFees.toFixed(2)}`;

  const result = await generateStructuredInsight('Academic performance for a school (enrollment, attendance, exam results, at-risk students, fee collection)', dataSummaryText);
  res.json({ ...result, basedOn: summary });
});

// GET /school/academic-intelligence/executive-overview
// The same real numbers computeAcademicSummary always computes, but
// returned directly with no AI call — a fast, free KPI summary someone
// can load as often as they like, distinct from the deliberate,
// rate-limited "Generate Insight" AI narrative.
const getExecutiveOverview = asyncHandler(async (req, res) => {
  res.json(await computeAcademicSummary(req.user.companyId));
});

// GET /school/academic-intelligence/students
// Every enrolled student with their own attendance rate and average
// score, computed from all their own attendance and exam records —
// the actual list Student Intelligence needs, not just the aggregate
// counts the Executive Overview already covers.
const getStudentIntelligence = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.id, s.student_no, s.first_name, s.last_name, cl.name AS class_name,
            att.rate AS attendance_rate, sc.avg_score
     FROM students s
     LEFT JOIN classes cl ON cl.id = s.class_id
     LEFT JOIN (
       SELECT student_id, (COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) AS rate
       FROM student_attendance WHERE company_id = $1 GROUP BY student_id
     ) att ON att.student_id = s.id
     LEFT JOIN (
       SELECT student_id, AVG(score)::numeric(5,1) AS avg_score FROM exam_results WHERE company_id = $1 GROUP BY student_id
     ) sc ON sc.student_id = s.id
     WHERE s.company_id = $1 AND s.status = 'enrolled'
     ORDER BY s.last_name, s.first_name`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /school/academic-intelligence/classes
const getClassIntelligence = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT cl.id, cl.name, cl.grade_level,
            COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'enrolled')::int AS student_count,
            att.rate AS attendance_rate, sc.avg_score
     FROM classes cl
     LEFT JOIN students s ON s.class_id = cl.id
     LEFT JOIN (
       SELECT class_id, (COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) AS rate
       FROM student_attendance WHERE company_id = $1 GROUP BY class_id
     ) att ON att.class_id = cl.id
     LEFT JOIN (
       SELECT ex.class_id, AVG(er.score)::numeric(5,1) AS avg_score
       FROM exam_results er JOIN exams ex ON ex.id = er.exam_id
       WHERE er.company_id = $1 GROUP BY ex.class_id
     ) sc ON sc.class_id = cl.id
     WHERE cl.company_id = $1 AND cl.is_active = TRUE
     GROUP BY cl.id, cl.name, cl.grade_level, att.rate, sc.avg_score
     ORDER BY cl.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /school/academic-intelligence/subjects
const getSubjectIntelligence = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sub.id, sub.name,
            COUNT(er.id)::int AS result_count,
            AVG(er.score)::numeric(5,1) AS avg_score,
            (COUNT(*) FILTER (WHERE er.score >= 50)::float / NULLIF(COUNT(er.id), 0) * 100)::numeric(5,1) AS pass_rate
     FROM subjects sub
     LEFT JOIN exam_results er ON er.subject_id = sub.id AND er.company_id = $1
     WHERE sub.company_id = $1
     GROUP BY sub.id, sub.name
     ORDER BY sub.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /school/academic-intelligence/teachers
// Every member of school_staff currently assigned as a class teacher —
// deliberately not filtered by role, since that field is School's own
// free-text concept (see school_staff's own comment) and "who teaches
// a class" is defined by classes.class_teacher_id, not by a role label
// that might say "Teacher", "Form Teacher", or something else entirely.
const getTeacherIntelligence = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `WITH teacher_classes AS (
       SELECT ss.id AS teacher_id, ss.first_name, ss.last_name, ss.role, cl.id AS class_id
       FROM school_staff ss JOIN classes cl ON cl.class_teacher_id = ss.id
       WHERE ss.company_id = $1 AND cl.is_active = TRUE
     )
     SELECT tc.teacher_id, tc.first_name, tc.last_name, tc.role,
            COUNT(DISTINCT tc.class_id)::int AS classes_taught,
            (SELECT (COUNT(*) FILTER (WHERE sa.status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1)
             FROM student_attendance sa WHERE sa.company_id = $1
               AND sa.class_id IN (SELECT class_id FROM teacher_classes WHERE teacher_id = tc.teacher_id)) AS attendance_rate,
            (SELECT AVG(er.score)::numeric(5,1)
             FROM exam_results er JOIN exams ex ON ex.id = er.exam_id
             WHERE er.company_id = $1
               AND ex.class_id IN (SELECT class_id FROM teacher_classes WHERE teacher_id = tc.teacher_id)) AS avg_score
     FROM teacher_classes tc
     GROUP BY tc.teacher_id, tc.first_name, tc.last_name, tc.role
     ORDER BY tc.last_name, tc.first_name`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /school/academic-intelligence/attendance
const getAttendanceIntelligence = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const [overallResult, byClassResult, byMonthResult, worstResult] = await Promise.all([
    db.query(
      `SELECT (COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) AS rate, COUNT(*)::int AS records
       FROM student_attendance WHERE company_id = $1`,
      [companyId]
    ),
    db.query(
      `SELECT cl.name AS class_name, (COUNT(*) FILTER (WHERE sa.status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) AS rate
       FROM student_attendance sa JOIN classes cl ON cl.id = sa.class_id
       WHERE sa.company_id = $1 GROUP BY cl.name ORDER BY cl.name`,
      [companyId]
    ),
    db.query(
      `SELECT to_char(attendance_date, 'YYYY-MM') AS month,
              (COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) AS rate
       FROM student_attendance WHERE company_id = $1 GROUP BY 1 ORDER BY 1`,
      [companyId]
    ),
    db.query(
      `SELECT s.first_name, s.last_name, cl.name AS class_name,
              (COUNT(*) FILTER (WHERE sa.status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) AS rate,
              COUNT(*)::int AS records
       FROM student_attendance sa
       JOIN students s ON s.id = sa.student_id
       LEFT JOIN classes cl ON cl.id = s.class_id
       WHERE sa.company_id = $1
       GROUP BY s.id, s.first_name, s.last_name, cl.name
       HAVING COUNT(*) >= 3
       ORDER BY rate ASC LIMIT 5`,
      [companyId]
    ),
  ]);
  res.json({
    overallRate: overallResult.rows[0].rate,
    totalRecords: overallResult.rows[0].records,
    byClass: byClassResult.rows,
    byMonth: byMonthResult.rows,
    lowestAttendance: worstResult.rows,
  });
});

// GET /school/academic-intelligence/assessments
const getAssessmentIntelligence = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const [byExamResult, distributionResult] = await Promise.all([
    db.query(
      `SELECT ex.id, ex.name, ex.term, ex.academic_year, ex.exam_date,
              AVG(er.score)::numeric(5,1) AS avg_score, COUNT(er.id)::int AS result_count
       FROM exams ex LEFT JOIN exam_results er ON er.exam_id = ex.id AND er.company_id = $1
       WHERE ex.company_id = $1
       GROUP BY ex.id, ex.name, ex.term, ex.academic_year, ex.exam_date
       ORDER BY ex.exam_date DESC`,
      [companyId]
    ),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE score < 50)::int AS below_50,
              COUNT(*) FILTER (WHERE score >= 50 AND score < 70)::int AS band_50_69,
              COUNT(*) FILTER (WHERE score >= 70)::int AS band_70_plus
       FROM exam_results WHERE company_id = $1`,
      [companyId]
    ),
  ]);
  res.json({ byExam: byExamResult.rows, scoreDistribution: distributionResult.rows[0] });
});

// GET /school/academic-intelligence/performance-trends
const getPerformanceTrends = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ex.academic_year, ex.term, AVG(er.score)::numeric(5,1) AS avg_score, COUNT(er.id)::int AS result_count
     FROM exam_results er JOIN exams ex ON ex.id = er.exam_id
     WHERE er.company_id = $1
     GROUP BY ex.academic_year, ex.term
     ORDER BY ex.academic_year, ex.term`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /school/academic-intelligence/at-risk-students
// The actual list behind the count already surfaced in the Executive
// Overview and the AI insight — who they are and specifically why,
// not just how many, so a school can act on it.
const getAtRiskStudents = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `WITH attendance_rates AS (
       SELECT student_id, (COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) AS rate
       FROM student_attendance WHERE company_id = $1 AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY student_id
     ), avg_scores AS (
       SELECT er.student_id, AVG(er.score)::numeric(5,1) AS avg_score
       FROM exam_results er JOIN exams ex ON ex.id = er.exam_id
       WHERE er.company_id = $1 AND ex.exam_date >= CURRENT_DATE - INTERVAL '90 days'
       GROUP BY er.student_id
     )
     SELECT s.id, s.student_no, s.first_name, s.last_name, cl.name AS class_name,
            ar.rate AS attendance_rate, av.avg_score,
            CASE
              WHEN ar.rate < 75 AND av.avg_score < 50 THEN 'Low attendance and low scores'
              WHEN ar.rate < 75 THEN 'Low attendance'
              WHEN av.avg_score < 50 THEN 'Low scores'
            END AS reason
     FROM students s
     LEFT JOIN classes cl ON cl.id = s.class_id
     LEFT JOIN attendance_rates ar ON ar.student_id = s.id
     LEFT JOIN avg_scores av ON av.student_id = s.id
     WHERE s.company_id = $1 AND s.status = 'enrolled' AND (ar.rate < 75 OR av.avg_score < 50)
     ORDER BY COALESCE(ar.rate, 100) ASC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /school/academic-intelligence/comparative-analysis
// Side-by-side comparison across two axes people actually ask "how do
// we compare" about: classes against each other, and this term against
// previous ones — reusing the exact same underlying aggregation as
// Class Intelligence and Performance Trends rather than a third,
// separate computation of the same numbers.
const getComparativeAnalysis = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const [classComparisonResult, termComparisonResult] = await Promise.all([
    db.query(
      `SELECT cl.name AS class_name, AVG(er.score)::numeric(5,1) AS avg_score,
              (SELECT (COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1)
               FROM student_attendance WHERE company_id = $1 AND class_id = cl.id) AS attendance_rate
       FROM classes cl
       LEFT JOIN exams ex ON ex.class_id = cl.id
       LEFT JOIN exam_results er ON er.exam_id = ex.id AND er.company_id = $1
       WHERE cl.company_id = $1 AND cl.is_active = TRUE
       GROUP BY cl.id, cl.name ORDER BY cl.name`,
      [companyId]
    ),
    db.query(
      `SELECT ex.academic_year, ex.term, AVG(er.score)::numeric(5,1) AS avg_score
       FROM exam_results er JOIN exams ex ON ex.id = er.exam_id
       WHERE er.company_id = $1 GROUP BY ex.academic_year, ex.term ORDER BY ex.academic_year, ex.term`,
      [companyId]
    ),
  ]);
  res.json({ byClass: classComparisonResult.rows, byTerm: termComparisonResult.rows });
});

// GET /school/academic-intelligence/alerts
// Shaped exactly like the Executive Dashboard's own alerts ({ text, to
// }), specifically so the frontend can reuse the same AlertExplainer
// component and its AI-explain button rather than building a second
// one for School.
const getAcademicAlerts = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const [lowAttendanceClasses, lowScoreSubjects, summary] = await Promise.all([
    db.query(
      `SELECT cl.name, (COUNT(*) FILTER (WHERE sa.status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) AS rate
       FROM student_attendance sa JOIN classes cl ON cl.id = sa.class_id
       WHERE sa.company_id = $1 GROUP BY cl.id, cl.name HAVING COUNT(*) >= 3
       AND (COUNT(*) FILTER (WHERE sa.status = 'present')::float / NULLIF(COUNT(*), 0) * 100) < 75`,
      [companyId]
    ),
    db.query(
      `SELECT sub.name, AVG(er.score)::numeric(5,1) AS avg_score
       FROM exam_results er JOIN subjects sub ON sub.id = er.subject_id
       WHERE er.company_id = $1 GROUP BY sub.id, sub.name HAVING COUNT(er.id) >= 3 AND AVG(er.score) < 50`,
      [companyId]
    ),
    computeAcademicSummary(companyId),
  ]);

  const alerts = [];
  for (const cls of lowAttendanceClasses.rows) {
    alerts.push({ text: `${cls.name} attendance is ${cls.rate}%, below the 75% threshold`, to: '/school/academic-intelligence' });
  }
  for (const sub of lowScoreSubjects.rows) {
    alerts.push({ text: `${sub.name} average score is ${sub.avg_score}, below passing`, to: '/school/academic-intelligence' });
  }
  if (summary.atRiskStudentCount > 0) {
    alerts.push({ text: `${summary.atRiskStudentCount} student${summary.atRiskStudentCount === 1 ? '' : 's'} flagged as at-risk`, to: '/school/academic-intelligence' });
  }
  if (summary.outstandingFees > 0) {
    alerts.push({ text: `GHS ${summary.outstandingFees.toFixed(2)} in outstanding school fees`, to: '/school/academic-intelligence' });
  }
  res.json(alerts);
});

// GET /school/academic-intelligence/kpis
// A broader scorecard than the Executive Overview — counts and ratios
// across the whole school, not the enrollment/attendance/fees snapshot
// already covered there.
const getAcademicKPIs = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const [countsResult, overallResult] = await Promise.all([
    db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM students WHERE company_id = $1 AND status = 'enrolled') AS students,
        (SELECT COUNT(*)::int FROM classes WHERE company_id = $1 AND is_active = TRUE) AS classes,
        (SELECT COUNT(*)::int FROM subjects WHERE company_id = $1) AS subjects,
        (SELECT COUNT(DISTINCT class_teacher_id)::int FROM classes WHERE company_id = $1 AND is_active = TRUE AND class_teacher_id IS NOT NULL) AS teachers`,
      [companyId]
    ),
    db.query(
      `SELECT
        (SELECT (COUNT(*) FILTER (WHERE status = 'present')::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) FROM student_attendance WHERE company_id = $1) AS attendance_rate,
        (SELECT AVG(score)::numeric(5,1) FROM exam_results WHERE company_id = $1) AS avg_score,
        (SELECT (COUNT(*) FILTER (WHERE score >= 50)::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,1) FROM exam_results WHERE company_id = $1) AS pass_rate,
        (SELECT (SUM(amount_paid)::float / NULLIF(SUM(total_amount), 0) * 100)::numeric(5,1) FROM student_fee_invoices WHERE company_id = $1) AS fee_collection_rate`,
      [companyId]
    ),
  ]);
  const counts = countsResult.rows[0];
  res.json({
    ...counts,
    studentTeacherRatio: counts.teachers > 0 ? Number((counts.students / counts.teachers).toFixed(1)) : null,
    ...overallResult.rows[0],
  });
});

module.exports = {
  getAcademicInsights, getExecutiveOverview, getStudentIntelligence, getClassIntelligence,
  getSubjectIntelligence, getTeacherIntelligence, getAttendanceIntelligence, getAssessmentIntelligence,
  getPerformanceTrends, getAtRiskStudents, getComparativeAnalysis, getAcademicAlerts, getAcademicKPIs,
};
