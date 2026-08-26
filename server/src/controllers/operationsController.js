const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { generateStructuredInsight } = require('../utils/aiInsight');

// GET /operations/manufacturing-summary
// Inventory and Procurement already have rich dashboard/summary endpoints
// (inventory-reports/workspace-dashboard, procurement-reports/summary) —
// this fills the one genuine gap: Manufacturing has no equivalent
// aggregate yet, just individual work-order/costing endpoints. Kept
// deliberately lightweight — status counts and this period's completed
// output — rather than duplicating the full costing/variance reports
// that already exist elsewhere for anyone who needs that level of detail.
const getManufacturingSummary = asyncHandler(async (req, res) => {
  const { rows: statusCounts } = await db.query(
    `SELECT status, COUNT(*) AS count
     FROM work_orders WHERE company_id = $1
     GROUP BY status`,
    [req.user.companyId]
  );

  const counts = { draft: 0, materials_issued: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const row of statusCounts) counts[row.status] = Number(row.count);

  const { rows: completedThisMonth } = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(quantity_to_produce), 0) AS total_quantity
     FROM work_orders
     WHERE company_id = $1 AND status = 'completed'
       AND completion_date >= date_trunc('month', CURRENT_DATE)`,
    [req.user.companyId]
  );

  res.json({
    statusCounts: counts,
    activeWorkOrders: counts.materials_issued + counts.in_progress,
    completedThisMonth: {
      count: Number(completedThisMonth[0].count),
      totalQuantity: Number(completedThisMonth[0].total_quantity),
    },
  });
});

// GET /operations/ai-insights
// A real, live call to Claude, structured as four parts — what
// happened, why, what's likely next, and what management should do —
// rather than one loose paragraph, via the shared
// generateStructuredInsight helper every suite dashboard now uses.
const getAiInsights = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  const [lowStockResult, payablesResult, workOrderResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS count FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
       LEFT JOIN product_warehouse_settings pws ON pws.product_id = sl.product_id AND pws.warehouse_id = sl.warehouse_id
       WHERE p.company_id = $1 AND sl.quantity <= COALESCE(pws.reorder_level, p.reorder_level, 0)`,
      [companyId]
    ),
    db.query(
      `SELECT COALESCE(SUM(total_amount - amount_paid - amount_credited), 0) AS total
       FROM purchase_invoices WHERE company_id = $1 AND status NOT IN ('paid', 'void')`,
      [companyId]
    ),
    db.query(
      `SELECT status, COUNT(*) AS count FROM work_orders WHERE company_id = $1 GROUP BY status`,
      [companyId]
    ),
  ]);

  const summary = {
    lowStockItemCount: Number(lowStockResult.rows[0].count),
    outstandingPayables: Number(payablesResult.rows[0].total),
    workOrdersByStatus: Object.fromEntries(workOrderResult.rows.map((r) => [r.status, Number(r.count)])),
  };

  const dataSummaryText = `- Low-stock items (at or below reorder level): ${summary.lowStockItemCount}
- Outstanding supplier payables: GHS ${summary.outstandingPayables.toFixed(2)}
- Work orders by status: ${JSON.stringify(summary.workOrdersByStatus)}`;

  const result = await generateStructuredInsight('Operations (Inventory, Procurement, Manufacturing)', dataSummaryText);
  res.json({ ...result, basedOn: summary });
});

module.exports = { getManufacturingSummary, getAiInsights };
