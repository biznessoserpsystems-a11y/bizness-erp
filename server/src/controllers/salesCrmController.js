const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { generateStructuredInsight } = require('../utils/aiInsight');

// GET /sales-crm/pipeline-summary
// Sales already has a rich reporting suite (sales-reports/summary,
// receivables-aging, register, by-branch, by-category); the CRM side
// only ever had raw list endpoints (leads, contacts, activities) with no
// aggregate view of the pipeline itself — the genuine gap this fills,
// the same role Manufacturing's summary played for the Operations page.
const getPipelineSummary = asyncHandler(async (req, res) => {
  const { rows: byStage } = await db.query(
    `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(estimated_value), 0) AS total_value
     FROM leads WHERE company_id = $1 AND is_active = TRUE
     GROUP BY stage`,
    [req.user.companyId]
  );

  const counts = { new: 0, contacted: 0, qualified: 0, proposal: 0, won: 0, lost: 0 };
  const valueByStage = { new: 0, contacted: 0, qualified: 0, proposal: 0, won: 0, lost: 0 };
  for (const row of byStage) {
    counts[row.stage] = row.count;
    valueByStage[row.stage] = Number(row.total_value);
  }

  const openStages = ['new', 'contacted', 'qualified', 'proposal'];
  const openPipelineValue = openStages.reduce((sum, s) => sum + valueByStage[s], 0);
  const openLeadCount = openStages.reduce((sum, s) => sum + counts[s], 0);
  const closedCount = counts.won + counts.lost;
  const winRate = closedCount > 0 ? (counts.won / closedCount) * 100 : null;

  res.json({
    counts, valueByStage,
    openPipelineValue, openLeadCount,
    winRate,
  });
});

// GET /sales-crm/ai-insights
// A real, live call to Claude, structured as four parts — what
// happened, why, what's likely next, and what management should do —
// via the shared generateStructuredInsight helper every suite
// dashboard now uses.
const getAiInsights = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  const [pipelineResult, salesResult, overdueResult] = await Promise.all([
    db.query(
      `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(estimated_value), 0) AS total_value
       FROM leads WHERE company_id = $1 AND is_active = TRUE GROUP BY stage`,
      [companyId]
    ),
    db.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*)::int AS invoice_count
       FROM sales_invoices WHERE company_id = $1 AND status != 'void'
         AND invoice_date >= date_trunc('month', CURRENT_DATE)`,
      [companyId]
    ),
    db.query(
      `SELECT COALESCE(SUM(total_amount - amount_paid - amount_credited), 0) AS total
       FROM sales_invoices WHERE company_id = $1 AND status NOT IN ('paid', 'void')
         AND due_date < CURRENT_DATE`,
      [companyId]
    ),
  ]);

  const summary = {
    pipelineByStage: Object.fromEntries(pipelineResult.rows.map((r) => [r.stage, { count: r.count, value: Number(r.total_value) }])),
    salesThisMonth: { total: Number(salesResult.rows[0].total), invoiceCount: salesResult.rows[0].invoice_count },
    overdueReceivables: Number(overdueResult.rows[0].total),
  };

  const dataSummaryText = `- Pipeline by stage: ${JSON.stringify(summary.pipelineByStage)}
- Sales this month: GHS ${summary.salesThisMonth.total.toFixed(2)} across ${summary.salesThisMonth.invoiceCount} invoices
- Overdue receivables: GHS ${summary.overdueReceivables.toFixed(2)}`;

  const result = await generateStructuredInsight('Sales & CRM', dataSummaryText);
  res.json({ ...result, basedOn: summary });
});

module.exports = { getPipelineSummary, getAiInsights };
