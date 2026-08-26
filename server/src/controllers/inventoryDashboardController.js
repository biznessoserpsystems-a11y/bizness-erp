const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { movementBetween } = require('./financialStatementController');

const INBOUND_TYPES = ['stock_in', 'transfer_in', 'adjustment_increase'];
const OUTBOUND_TYPES = ['stock_out', 'transfer_out', 'adjustment_decrease', 'damaged'];
const DEAD_STOCK_LOOKBACK_DAYS = 90; // fixed, independent of the dashboard's own date range filter — "hasn't moved in 90 days" is a stable definition regardless of what period someone happens to be viewing.

function pct(n, d) {
  return d && Math.abs(d) > 0.0001 ? (n / d) * 100 : null;
}

/**
 * GET /inventory-reports/workspace-dashboard?from=&to=
 * Everything the Inventory Workspace dashboard needs in one call — 8 KPIs
 * and the data behind 10 chart types — rather than 15+ separate round
 * trips. All figures are computed from real tables; nothing here is a
 * placeholder. Two different time bases are deliberately mixed:
 *   - Current-moment snapshots (stock value, stock-out rate, overstock
 *     rate, dead stock, ABC classification, aging) — these describe stock
 *     ON HAND right now, not something the selected period can change.
 *   - Period-based flow figures (turnover, fill rate, fulfilment rate,
 *     shrinkage, movement analysis, fast/slow movers) — computed only for
 *     the from/to range the person selected in the date filter.
 */
const workspaceDashboard = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const companyId = req.user.companyId;

  // ---- Current stock snapshot (valuation + category + warehouse) ----
  const { rows: valuationLines } = await db.query(
    `SELECT p.id AS product_id, p.sku, p.name, COALESCE(pc.name, 'Uncategorized') AS category_name,
            w.id AS warehouse_id, w.name AS warehouse_name,
            sl.quantity, sl.average_cost, (sl.quantity * sl.average_cost) AS stock_value,
            COALESCE(pws.reorder_level, p.reorder_level, 0) AS reorder_level
     FROM stock_levels sl
     JOIN products p ON p.id = sl.product_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     JOIN warehouses w ON w.id = sl.warehouse_id
     LEFT JOIN product_warehouse_settings pws ON pws.product_id = sl.product_id AND pws.warehouse_id = sl.warehouse_id
     WHERE p.company_id = $1 AND sl.quantity > 0`,
    [companyId]
  );
  const totalStockValue = valuationLines.reduce((s, l) => s + Number(l.stock_value), 0);

  // Also need every active product (including zero-stock ones) for stock-out rate.
  const { rows: allActiveProducts } = await db.query(
    `SELECT p.id, COALESCE(SUM(sl.quantity), 0) AS total_quantity
     FROM products p
     LEFT JOIN stock_levels sl ON sl.product_id = p.id
     WHERE p.company_id = $1 AND p.is_active = TRUE
     GROUP BY p.id`,
    [companyId]
  );

  // ---- 1. Inventory Value by Category ----
  const valueByCategory = Object.values(
    valuationLines.reduce((acc, l) => {
      acc[l.category_name] = acc[l.category_name] || { name: l.category_name, value: 0 };
      acc[l.category_name].value += Number(l.stock_value);
      return acc;
    }, {})
  );

  // ---- 4. Warehouse Inventory Distribution (stacked by category) ----
  const categoryNames = [...new Set(valuationLines.map((l) => l.category_name))];
  const warehouseMap = {};
  for (const l of valuationLines) {
    warehouseMap[l.warehouse_name] = warehouseMap[l.warehouse_name] || { name: l.warehouse_name };
    warehouseMap[l.warehouse_name][l.category_name] = (warehouseMap[l.warehouse_name][l.category_name] || 0) + Number(l.stock_value);
  }
  const warehouseDistribution = Object.values(warehouseMap);

  // ---- 8. Top 10 Inventory Items by Value ----
  const topItemsByValue = [...valuationLines]
    .sort((a, b) => Number(b.stock_value) - Number(a.stock_value))
    .slice(0, 10)
    .map((l) => ({ name: l.name, value: Number(l.stock_value) }));

  // ---- 6. ABC Classification (by cumulative value contribution: A=top 80%, B=next 15%, C=last 5%) ----
  const sortedByValue = [...valuationLines].sort((a, b) => Number(b.stock_value) - Number(a.stock_value));
  let cumulative = 0;
  const abc = { A: { count: 0, value: 0 }, B: { count: 0, value: 0 }, C: { count: 0, value: 0 } };
  for (const l of sortedByValue) {
    cumulative += Number(l.stock_value);
    const cumPct = totalStockValue > 0 ? cumulative / totalStockValue : 0;
    const cls = cumPct <= 0.8 ? 'A' : cumPct <= 0.95 ? 'B' : 'C';
    abc[cls].count += 1;
    abc[cls].value += Number(l.stock_value);
  }
  const abcClassification = ['A', 'B', 'C'].map((k) => ({ name: `Class ${k}`, value: abc[k].value, itemCount: abc[k].count }));

  // ---- 5. Inventory Ageing (by days since last inbound movement, weighted by current value) ----
  const { rows: lastInbound } = await db.query(
    `SELECT product_id, MAX(created_at) AS last_in
     FROM stock_movements
     WHERE company_id = $1 AND movement_type = ANY($2::text[])
     GROUP BY product_id`,
    [companyId, INBOUND_TYPES]
  );
  const lastInboundMap = new Map(lastInbound.map((r) => [r.product_id, r.last_in]));
  const agingBuckets = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, 'Over 90 days': 0, 'No record': 0 };
  const now = new Date();
  for (const l of valuationLines) {
    const lastIn = lastInboundMap.get(l.product_id);
    if (!lastIn) { agingBuckets['No record'] += Number(l.stock_value); continue; }
    const days = Math.floor((now - new Date(lastIn)) / (1000 * 60 * 60 * 24));
    const bucket = days <= 30 ? '0-30 days' : days <= 60 ? '31-60 days' : days <= 90 ? '61-90 days' : 'Over 90 days';
    agingBuckets[bucket] += Number(l.stock_value);
  }
  const aging = Object.entries(agingBuckets).map(([name, value]) => ({ name, value }));

  // ---- 7. Dead Stock % (no outbound movement in a fixed 90-day lookback) ----
  const lookbackDate = new Date(now.getTime() - DEAD_STOCK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { rows: recentOutbound } = await db.query(
    `SELECT DISTINCT product_id FROM stock_movements
     WHERE company_id = $1 AND movement_type = ANY($2::text[]) AND created_at >= $3`,
    [companyId, OUTBOUND_TYPES, lookbackDate]
  );
  const recentlyMovedIds = new Set(recentOutbound.map((r) => r.product_id));
  const deadStockValue = valuationLines.filter((l) => !recentlyMovedIds.has(l.product_id)).reduce((s, l) => s + Number(l.stock_value), 0);
  const deadStockPct = pct(deadStockValue, totalStockValue);

  // ---- 5/6 (KPI). Stock-out Rate & Overstock Rate ----
  const stockOutCount = allActiveProducts.filter((p) => Number(p.total_quantity) <= 0).length;
  const stockOutRate = pct(stockOutCount, allActiveProducts.length);
  // "Overstock" has no explicit max-stock field in this schema — using 3x
  // reorder level as a documented heuristic, not an exact business rule.
  const overstockCount = valuationLines.filter((l) => Number(l.reorder_level) > 0 && Number(l.quantity) > Number(l.reorder_level) * 3).length;
  const overstockRate = pct(overstockCount, valuationLines.length);

  // ---- Period-based: movements within the selected range ----
  const { rows: periodMovements } = await db.query(
    `SELECT sm.product_id, sm.movement_type, sm.quantity, sm.total_cost, sm.created_at, p.name AS product_name
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.company_id = $1 AND sm.created_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );

  // ---- 3. Stock Movement Analysis: monthly IN vs OUT vs adjustments ----
  const monthKey = (d) => new Date(d).toISOString().slice(0, 7);
  const monthlyMap = {};
  for (const m of periodMovements) {
    const key = monthKey(m.created_at);
    monthlyMap[key] = monthlyMap[key] || { name: key, in: 0, out: 0, countAdjustment: 0 };
    if (INBOUND_TYPES.includes(m.movement_type)) monthlyMap[key].in += Number(m.quantity);
    else if (OUTBOUND_TYPES.includes(m.movement_type)) monthlyMap[key].out += Number(m.quantity);
    else monthlyMap[key].countAdjustment += Number(m.quantity);
  }
  const movementAnalysis = Object.values(monthlyMap).sort((a, b) => a.name.localeCompare(b.name));

  // ---- 7. Fast vs Slow Moving Items (by total outbound quantity in period) ----
  const outboundByProduct = {};
  for (const m of periodMovements) {
    if (!OUTBOUND_TYPES.includes(m.movement_type)) continue;
    outboundByProduct[m.product_id] = outboundByProduct[m.product_id] || { name: m.product_name, quantity: 0 };
    outboundByProduct[m.product_id].quantity += Number(m.quantity);
  }
  const movedProducts = Object.values(outboundByProduct).sort((a, b) => b.quantity - a.quantity);
  const fastMoving = movedProducts.slice(0, 5).map((p) => ({ ...p, category: 'Fast-moving' }));
  const slowMoving = movedProducts.slice(-5).reverse().map((p) => ({ ...p, category: 'Slow-moving' }));

  // ---- 10. Inventory Turnover Trend (COGS per month bucket ÷ current total stock value) ----
  const turnoverTrend = [];
  for (const key of Object.keys(monthlyMap).sort()) {
    const [y, mo] = key.split('-');
    const monthStart = `${y}-${mo}-01`;
    const monthEndDate = new Date(Number(y), Number(mo), 0);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    const cogsRows = await movementBetween(companyId, monthStart, monthEnd, ['expense']);
    const cogs = cogsRows.filter((a) => a.account_subtype === 'cogs').reduce((s, a) => s + a.balance, 0);
    turnoverTrend.push({ name: key, turnover: totalStockValue > 0 ? Number((cogs / totalStockValue).toFixed(2)) : 0 });
  }

  // ---- 1. Inventory Turnover (whole selected period, one number) ----
  const periodCogsRows = await movementBetween(companyId, from, to, ['expense']);
  const periodCogs = periodCogsRows.filter((a) => a.account_subtype === 'cogs').reduce((s, a) => s + a.balance, 0);
  const inventoryTurnover = totalStockValue > 0 ? periodCogs / totalStockValue : null;

  // ---- 2. Fill Rate & 4. Order Fulfilment Rate (sales order lines in period) ----
  const { rows: orderLines } = await db.query(
    `SELECT sol.quantity, sol.delivered_quantity
     FROM sales_order_lines sol
     JOIN sales_orders so ON so.id = sol.sales_order_id
     WHERE so.company_id = $1 AND so.order_date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const fullyDeliveredLines = orderLines.filter((l) => Number(l.delivered_quantity) >= Number(l.quantity)).length;
  const fillRate = pct(fullyDeliveredLines, orderLines.length);
  const totalOrdered = orderLines.reduce((s, l) => s + Number(l.quantity), 0);
  const totalDelivered = orderLines.reduce((s, l) => s + Number(l.delivered_quantity), 0);
  const orderFulfilmentRate = pct(totalDelivered, totalOrdered);

  // ---- 3. Stock Accuracy (completed inventory counts within period) ----
  const { rows: countLines } = await db.query(
    `SELECT icl.system_quantity, icl.variance
     FROM inventory_count_lines icl
     JOIN inventory_counts ic ON ic.id = icl.count_id
     WHERE ic.company_id = $1 AND ic.status = 'completed' AND ic.completed_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const totalSystemQty = countLines.reduce((s, l) => s + Math.abs(Number(l.system_quantity)), 0);
  const totalVariance = countLines.reduce((s, l) => s + Math.abs(Number(l.variance) || 0), 0);
  const stockAccuracy = countLines.length > 0 ? Math.max(0, 100 - pct(totalVariance, totalSystemQty || 1)) : null;

  // ---- 8. Shrinkage % (damaged goods value in period ÷ current total stock value) ----
  const { rows: damagedRows } = await db.query(
    `SELECT dg.quantity, COALESCE(sm.unit_cost, sl.average_cost, 0) AS unit_cost
     FROM damaged_goods dg
     LEFT JOIN stock_movements sm ON sm.id = dg.movement_id
     LEFT JOIN stock_levels sl ON sl.product_id = dg.product_id AND sl.warehouse_id = dg.warehouse_id
     WHERE dg.company_id = $1 AND dg.created_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const shrinkageValue = damagedRows.reduce((s, r) => s + Number(r.quantity) * Number(r.unit_cost), 0);
  const shrinkagePct = pct(shrinkageValue, totalStockValue);

  res.json({
    from, to,
    totalStockValue,
    kpis: {
      inventoryTurnover: { result: inventoryTurnover, target: 6, unit: 'x' },
      fillRate: { result: fillRate, target: 95, unit: '%' },
      stockAccuracy: { result: stockAccuracy, target: 98, unit: '%' },
      orderFulfilmentRate: { result: orderFulfilmentRate, target: 95, unit: '%' },
      stockOutRate: { result: stockOutRate, target: 5, unit: '%', lowerIsBetter: true },
      overstockRate: { result: overstockRate, target: 10, unit: '%', lowerIsBetter: true },
      deadStockPct: { result: deadStockPct, target: 5, unit: '%', lowerIsBetter: true },
      shrinkagePct: { result: shrinkagePct, target: 1, unit: '%', lowerIsBetter: true },
    },
    charts: {
      valueByCategory,
      movementAnalysis,
      warehouseDistribution: { data: warehouseDistribution, categories: categoryNames },
      aging,
      abcClassification,
      fastMoving,
      slowMoving,
      topItemsByValue,
      turnoverTrend,
    },
  });
});

module.exports = { workspaceDashboard };
