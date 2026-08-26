const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { generateStructuredInsight } = require('../utils/aiInsight');

// GET /specialty/ai-insights
// A real, live call to Claude, structured as four parts — what
// happened, why, what's likely next, and what management should do —
// via the shared generateStructuredInsight helper every suite
// dashboard now uses. Unlike the other suite pages, no new summary
// endpoint was needed alongside this one — services/workspace-dashboard
// and rental/reports/workspace-dashboard already existed and were
// already comprehensive, so this is the only genuinely new backend
// code for this page.
const getAiInsights = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  const [jobsResult, unbilledResult, rentalResult] = await Promise.all([
    db.query(
      `SELECT status, COUNT(*)::int AS count FROM service_jobs WHERE company_id = $1 GROUP BY status`,
      [companyId]
    ),
    db.query(
      `SELECT
         COALESCE((SELECT SUM(hours * hourly_rate) FROM service_job_time_entries t JOIN service_jobs j ON j.id = t.job_id WHERE j.company_id = $1 AND t.billable = TRUE AND t.invoiced = FALSE), 0) AS unbilled_time,
         COALESCE((SELECT SUM(amount) FROM service_job_expenses e JOIN service_jobs j ON j.id = e.job_id WHERE j.company_id = $1 AND e.billable = TRUE AND e.invoiced = FALSE), 0) AS unbilled_expenses`,
      [companyId]
    ),
    db.query(
      `SELECT ra.status, COUNT(*)::int AS count
       FROM rental_agreements ra WHERE ra.company_id = $1 GROUP BY ra.status`,
      [companyId]
    ),
  ]);

  const overdueReturnsResult = await db.query(
    `SELECT COUNT(*)::int AS count FROM rental_agreements
     WHERE company_id = $1 AND status = 'active' AND expected_return_date < CURRENT_DATE`,
    [companyId]
  );

  const summary = {
    serviceJobsByStatus: Object.fromEntries(jobsResult.rows.map((r) => [r.status, r.count])),
    unbilledServiceRevenue: Number(unbilledResult.rows[0].unbilled_time) + Number(unbilledResult.rows[0].unbilled_expenses),
    rentalAgreementsByStatus: Object.fromEntries(rentalResult.rows.map((r) => [r.status, r.count])),
    overdueRentalReturns: overdueReturnsResult.rows[0].count,
  };

  const dataSummaryText = `- Service jobs by status: ${JSON.stringify(summary.serviceJobsByStatus)}
- Unbilled service revenue (time + expenses not yet invoiced): GHS ${summary.unbilledServiceRevenue.toFixed(2)}
- Rental agreements by status: ${JSON.stringify(summary.rentalAgreementsByStatus)}
- Overdue rental returns: ${summary.overdueRentalReturns}`;

  const result = await generateStructuredInsight('Specialty Businesses (Service + Rental)', dataSummaryText);
  res.json({ ...result, basedOn: summary });
});

module.exports = { getAiInsights };
