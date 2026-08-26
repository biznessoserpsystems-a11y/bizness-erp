const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { generateStructuredInsight } = require('../utils/aiInsight');

// GET /governance/ai-insights
// A real, live call to Claude, structured as four parts — what
// happened, why, what's likely next, and what management should do —
// via the shared generateStructuredInsight helper every suite
// dashboard now uses. Like Specialty Businesses, no new summary
// endpoint was needed alongside this one: bcm/workspace-dashboard and
// compliance-calendar/summary already existed and were already
// comprehensive, so this is the only genuinely new backend code for
// this page.
//
// Deliberately does not reference "Projects" anywhere — this codebase
// has no projects table or project-tracking feature of any kind, and
// fabricating project data for an AI prompt would mean asking Claude to
// comment on something that doesn't exist in the company's real data.
const getAiInsights = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  const [risksResult, incidentsResult, plansResult, complianceResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS active_count, COUNT(*) FILTER (WHERE risk_score >= 15)::int AS high_count
       FROM bcm_risks WHERE company_id = $1 AND status NOT IN ('resolved', 'accepted')`,
      [companyId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS count FROM bcm_incidents WHERE company_id = $1 AND is_resolved = FALSE`,
      [companyId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS count FROM bcm_continuity_plans
       WHERE company_id = $1 AND (status = 'needs_review' OR (next_test_due IS NOT NULL AND next_test_due < CURRENT_DATE))`,
      [companyId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS count FROM compliance_calendar_items
       WHERE company_id = $1 AND is_active = TRUE AND next_due_date < CURRENT_DATE`,
      [companyId]
    ),
  ]);

  const summary = {
    activeRisks: risksResult.rows[0].active_count,
    highSeverityRisks: risksResult.rows[0].high_count,
    unresolvedIncidents: incidentsResult.rows[0].count,
    continuityPlansNeedingReview: plansResult.rows[0].count,
    overdueComplianceFilings: complianceResult.rows[0].count,
  };

  const dataSummaryText = `- Active risks: ${summary.activeRisks} (${summary.highSeverityRisks} high-severity)
- Unresolved incidents: ${summary.unresolvedIncidents}
- Continuity plans needing review: ${summary.continuityPlansNeedingReview}
- Overdue compliance filings: ${summary.overdueComplianceFilings}`;

  const result = await generateStructuredInsight('Governance & Risk (Business Continuity + Compliance)', dataSummaryText);
  res.json({ ...result, basedOn: summary });
});

module.exports = { getAiInsights };
