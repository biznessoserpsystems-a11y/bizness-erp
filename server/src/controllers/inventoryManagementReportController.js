const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { movementBetween } = require('./financialStatementController');
const { sendExport } = require('../services/exportService');

const INBOUND_TYPES = ['stock_in', 'transfer_in', 'adjustment_increase'];
const OUTBOUND_TYPES = ['stock_out', 'transfer_out', 'adjustment_decrease', 'damaged'];
// Direction for reconciling opening -> closing stock specifically — returns
// need their own entries here since a customer return puts stock BACK in
// (inbound) while a supplier return takes it back OUT (outbound), neither
// of which is implied by the base movement_type alone.
const RECONCILE_INBOUND = new Set([...INBOUND_TYPES, 'sales_return']);
const RECONCILE_OUTBOUND = new Set([...OUTBOUND_TYPES, 'purchase_return']);

function pct(n, d) {
  return d && Math.abs(d) > 0.0001 ? (n / d) * 100 : null;
}
function variancePct(current, previous) {
  if (previous === null || previous === undefined) return null;
  return previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : (current !== 0 ? null : 0);
}

async function currentValuationSnapshot(companyId) {
  const { rows } = await db.query(
    `SELECT p.id AS product_id, p.sku, p.name, COALESCE(pc.name, 'Uncategorized') AS category_name,
            w.id AS warehouse_id, w.name AS warehouse_name,
            sl.quantity, sl.average_cost, (sl.quantity * sl.average_cost) AS stock_value,
            COALESCE(pws.reorder_level, p.reorder_level, 0) AS reorder_level,
            COALESCE(pws.reorder_quantity, p.reorder_quantity, 0) AS reorder_quantity
     FROM stock_levels sl
     JOIN products p ON p.id = sl.product_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     JOIN warehouses w ON w.id = sl.warehouse_id
     LEFT JOIN product_warehouse_settings pws ON pws.product_id = sl.product_id AND pws.warehouse_id = sl.warehouse_id
     WHERE p.company_id = $1 AND sl.quantity > 0`,
    [companyId]
  );
  return rows;
}

async function summaryMetrics(companyId, from, to) {
  const lines = await currentValuationSnapshot(companyId);
  const totalValue = lines.reduce((s, l) => s + Number(l.stock_value), 0);
  const totalQuantity = lines.reduce((s, l) => s + Number(l.quantity), 0);

  const { rows: allActive } = await db.query(
    `SELECT p.id, COALESCE(SUM(sl.quantity), 0) AS total_quantity
     FROM products p LEFT JOIN stock_levels sl ON sl.product_id = p.id
     WHERE p.company_id = $1 AND p.is_active = TRUE GROUP BY p.id`,
    [companyId]
  );
  const outOfStockCount = allActive.filter((p) => Number(p.total_quantity) <= 0).length;
  const overstockCount = lines.filter((l) => Number(l.reorder_level) > 0 && Number(l.quantity) > Number(l.reorder_level) * 3).length;

  const { rows: lastOutbound } = await db.query(
    `SELECT product_id, MAX(created_at) AS last_out FROM stock_movements
     WHERE company_id = $1 AND movement_type = ANY($2::text[]) GROUP BY product_id`,
    [companyId, [...OUTBOUND_TYPES, 'sales_return']]
  );
  const lastOutMap = new Map(lastOutbound.map((r) => [r.product_id, r.last_out]));
  const now = new Date();
  let slowMovingCount = 0;
  let deadStockCount = 0;
  for (const l of lines) {
    const lastOut = lastOutMap.get(l.product_id);
    const daysSince = lastOut ? Math.floor((now - new Date(lastOut)) / 86400000) : Infinity;
    if (daysSince > 90) deadStockCount += 1;
    else if (daysSince > 30) slowMovingCount += 1;
  }

  const cogsRows = await movementBetween(companyId, from, to, ['expense']);
  const cogs = cogsRows.filter((a) => a.account_subtype === 'cogs').reduce((s, a) => s + a.balance, 0);
  const turnover = totalValue > 0 ? cogs / totalValue : null;
  const stockDays = turnover ? 365 / turnover : null;

  return {
    totalInventoryValue: totalValue,
    numberOfItems: lines.length,
    totalQuantityOnHand: totalQuantity,
    inventoryTurnover: turnover,
    stockDays,
    slowMovingItems: slowMovingCount,
    deadStockItems: deadStockCount,
    outOfStockItems: outOfStockCount,
    overstockItems: overstockCount,
  };
}

/**
 * GET /inventory-reports/management-report?from=&to=&warehouseId=
 * A single consolidated endpoint backing the full 17-section Inventory
 * Management Report. "Previous Period" is the immediately preceding period
 * of the same length as the one selected (not "same period last year" —
 * this report's own template just says "Previous Period"), so a 3-month
 * selection compares against the 3 months right before it.
 *
 * Two things this system genuinely can't reconstruct, handled honestly
 * rather than faked:
 *   - Opening/Closing Stock only reconcile correctly when `to` is today —
 *     stock_levels is a live snapshot, not a history, so "closing stock as
 *     of a past date" isn't recoverable; Closing is always read as today's
 *     current total, and Opening is derived by working backward through
 *     the period's movements.
 *   - stock_batches has no manufacturing date, only received_date and
 *     expiry_date — the Batch & Serial Tracking section uses received_date
 *     in that column, labeled accordingly rather than silently mislabeled.
 */
const managementReport = asyncHandler(async (req, res) => {
  const { from, to, warehouseId } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const companyId = req.user.companyId;

  const periodDays = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
  const prevTo = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(new Date(from).getTime() - periodDays * 86400000).toISOString().slice(0, 10);

  const [current, previous] = await Promise.all([
    summaryMetrics(companyId, from, to),
    summaryMetrics(companyId, prevFrom, prevTo),
  ]);
  const executiveSummary = Object.keys(current).map((key) => ({
    key,
    current: current[key],
    previous: previous[key],
    variancePct: variancePct(current[key] ?? 0, previous[key]),
  }));

  const valuationLines = await currentValuationSnapshot(companyId);
  const totalValue = valuationLines.reduce((s, l) => s + Number(l.stock_value), 0);

  // ---- 2. Inventory Valuation by category ----
  const byCategory = Object.values(
    valuationLines.reduce((acc, l) => {
      acc[l.category_name] = acc[l.category_name] || { category: l.category_name, qty: 0, value: 0 };
      acc[l.category_name].qty += Number(l.quantity);
      acc[l.category_name].value += Number(l.stock_value);
      return acc;
    }, {})
  ).map((c) => ({ ...c, pctOfTotal: pct(c.value, totalValue) }));

  // ---- 3. Inventory by Warehouse ----
  const byWarehouse = Object.values(
    valuationLines.reduce((acc, l) => {
      acc[l.warehouse_name] = acc[l.warehouse_name] || { warehouse: l.warehouse_name, items: 0, quantity: 0, value: 0 };
      acc[l.warehouse_name].items += 1;
      acc[l.warehouse_name].quantity += Number(l.quantity);
      acc[l.warehouse_name].value += Number(l.stock_value);
      return acc;
    }, {})
  );

  // ---- 4. Stock Movement Summary ----
  const { rows: periodMovements } = await db.query(
    `SELECT sm.product_id, sm.movement_type, sm.reference_type, sm.quantity, sm.total_cost, sm.created_at, p.name AS product_name
     FROM stock_movements sm JOIN products p ON p.id = sm.product_id
     WHERE sm.company_id = $1 AND sm.created_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const sumBy = (pred) => periodMovements.filter(pred).reduce((acc, m) => ({ qty: acc.qty + Number(m.quantity), value: acc.value + Number(m.total_cost) }), { qty: 0, value: 0 });
  const purchases = sumBy((m) => m.reference_type === 'grn');
  const sales = sumBy((m) => m.reference_type === 'delivery');
  const customerReturns = sumBy((m) => m.reference_type === 'sales_return');
  const supplierReturns = sumBy((m) => m.reference_type === 'purchase_return');
  const transfersIn = sumBy((m) => m.movement_type === 'transfer_in');
  const transfersOut = sumBy((m) => m.movement_type === 'transfer_out');
  const adjustments = sumBy((m) => m.reference_type === 'adjustment');
  const netPeriodValue = periodMovements.reduce((s, m) => {
    const signed = RECONCILE_INBOUND.has(m.movement_type) ? Number(m.total_cost) : RECONCILE_OUTBOUND.has(m.movement_type) ? -Number(m.total_cost) : 0;
    return s + signed;
  }, 0);
  const closingStock = { qty: valuationLines.reduce((s, l) => s + Number(l.quantity), 0), value: totalValue };
  const openingStock = { qty: null, value: closingStock.value - netPeriodValue };
  const movementSummary = { openingStock, purchases, sales, customerReturns, supplierReturns, transfersIn, transfersOut, adjustments, closingStock };

  // ---- 5/6/7. Fast Moving / Slow Moving / Dead Stock ----
  const outboundByProduct = {};
  for (const m of periodMovements) {
    if (!OUTBOUND_TYPES.includes(m.movement_type) && m.reference_type !== 'sales_return') continue;
    if (m.reference_type === 'sales_return') continue; // returns aren't "sold", exclude from velocity ranking
    outboundByProduct[m.product_id] = outboundByProduct[m.product_id] || { qtySold: 0 };
    outboundByProduct[m.product_id].qtySold += Number(m.quantity);
  }
  const { rows: revenueByProduct } = await db.query(
    `SELECT sil.product_id, SUM(sil.line_total) AS revenue
     FROM sales_invoice_lines sil JOIN sales_invoices si ON si.id = sil.sales_invoice_id
     WHERE si.company_id = $1 AND si.status != 'void' AND si.invoice_date BETWEEN $2 AND $3
     GROUP BY sil.product_id`,
    [companyId, from, to]
  );
  const revenueMap = new Map(revenueByProduct.map((r) => [r.product_id, Number(r.revenue)]));
  const lineByProduct = new Map(valuationLines.map((l) => [l.product_id, l]));

  const { rows: lastSoldRows } = await db.query(
    `SELECT product_id, MAX(created_at) AS last_out FROM stock_movements
     WHERE company_id = $1 AND movement_type = ANY($2::text[]) GROUP BY product_id`,
    [companyId, OUTBOUND_TYPES]
  );
  const lastSoldMap = new Map(lastSoldRows.map((r) => [r.product_id, r.last_out]));
  const now = new Date();

  const movedRanked = Object.entries(outboundByProduct)
    .map(([productId, m]) => {
      const line = lineByProduct.get(productId);
      return {
        itemCode: line?.sku || '', description: line?.name || '(no current stock)', qtySold: m.qtySold,
        revenue: revenueMap.get(productId) || 0, closingStock: line ? Number(line.quantity) : 0,
      };
    })
    .sort((a, b) => b.qtySold - a.qtySold);
  const fastMoving = movedRanked.slice(0, 10);

  const slowMoving = valuationLines
    .map((l) => {
      const lastOut = lastSoldMap.get(l.product_id);
      const daysInStock = lastOut ? Math.floor((now - new Date(lastOut)) / 86400000) : null;
      return { item: l.name, quantity: Number(l.quantity), value: Number(l.stock_value), lastSold: lastOut, daysInStock };
    })
    .filter((l) => l.daysInStock !== null && l.daysInStock > 30 && l.daysInStock <= 90)
    .sort((a, b) => b.daysInStock - a.daysInStock)
    .slice(0, 15);

  const deadStock = valuationLines
    .map((l) => {
      const lastOut = lastSoldMap.get(l.product_id);
      const daysWithoutMovement = lastOut ? Math.floor((now - new Date(lastOut)) / 86400000) : null;
      return { item: l.name, quantity: Number(l.quantity), value: Number(l.stock_value), daysWithoutMovement };
    })
    .filter((l) => l.daysWithoutMovement === null || l.daysWithoutMovement > 90)
    .sort((a, b) => (b.daysWithoutMovement ?? 99999) - (a.daysWithoutMovement ?? 99999));

  // ---- 8. Reorder Level Report ----
  const reorderLevel = valuationLines
    .filter((l) => Number(l.quantity) <= Number(l.reorder_level))
    .map((l) => ({
      item: l.name, currentStock: Number(l.quantity), reorderLevel: Number(l.reorder_level),
      recommendedPurchase: Number(l.reorder_quantity) > 0 ? Number(l.reorder_quantity) : Math.max(0, Number(l.reorder_level) * 2 - Number(l.quantity)),
    }));

  // ---- 9. Overstock Report (3x reorder level heuristic, documented) ----
  const overstock = valuationLines
    .filter((l) => Number(l.reorder_level) > 0 && Number(l.quantity) > Number(l.reorder_level) * 3)
    .map((l) => ({
      item: l.name, quantity: Number(l.quantity), maximumLevel: Number(l.reorder_level) * 3,
      excessQuantity: Number(l.quantity) - Number(l.reorder_level) * 3, value: Number(l.stock_value),
    }));

  // ---- 10. Stock Ageing Analysis (finer 6-bucket breakdown than the Workspace Dashboard's 4) ----
  const { rows: lastInboundRows } = await db.query(
    `SELECT product_id, MAX(created_at) AS last_in FROM stock_movements
     WHERE company_id = $1 AND movement_type = ANY($2::text[]) GROUP BY product_id`,
    [companyId, INBOUND_TYPES]
  );
  const lastInMap = new Map(lastInboundRows.map((r) => [r.product_id, r.last_in]));
  const ageBuckets = { '0-30 Days': { qty: 0, value: 0 }, '31-60 Days': { qty: 0, value: 0 }, '61-90 Days': { qty: 0, value: 0 }, '91-180 Days': { qty: 0, value: 0 }, '181-365 Days': { qty: 0, value: 0 }, 'Over 365 Days': { qty: 0, value: 0 } };
  for (const l of valuationLines) {
    const lastIn = lastInMap.get(l.product_id);
    const days = lastIn ? Math.floor((now - new Date(lastIn)) / 86400000) : 9999;
    const bucket = days <= 30 ? '0-30 Days' : days <= 60 ? '31-60 Days' : days <= 90 ? '61-90 Days' : days <= 180 ? '91-180 Days' : days <= 365 ? '181-365 Days' : 'Over 365 Days';
    ageBuckets[bucket].qty += Number(l.quantity);
    ageBuckets[bucket].value += Number(l.stock_value);
  }
  const stockAgeing = Object.entries(ageBuckets).map(([age, v]) => ({ age, ...v }));

  // ---- 11. Inventory Turnover Analysis, by category ----
  const expenseRows = await movementBetween(companyId, from, to, ['expense']);
  const totalCogs = expenseRows.filter((a) => a.account_subtype === 'cogs').reduce((s, a) => s + a.balance, 0);
  const turnoverByCategory = byCategory.map((c) => {
    const cogsShare = totalValue > 0 ? totalCogs * (c.value / totalValue) : 0; // apportioned by value share — this system doesn't track COGS per category directly
    return { category: c.category, averageInventory: c.value, costOfGoodsSold: cogsShare, turnoverRatio: c.value > 0 ? cogsShare / c.value : null };
  });

  // ---- 12. Stock Adjustment Report ----
  const stockAdjustments = periodMovements
    .filter((m) => m.reference_type === 'adjustment')
    .map((m) => ({
      date: m.created_at, item: m.product_name,
      adjustmentType: m.movement_type === 'adjustment_increase' ? 'Increase' : 'Decrease',
      quantity: Number(m.quantity), value: Number(m.total_cost),
    }));

  // ---- 13. Damaged & Expired Stock ----
  const { rows: damagedRows } = await db.query(
    `SELECT dg.quantity, dg.created_at, p.name AS product_name, COALESCE(sm.unit_cost, sl.average_cost, 0) AS unit_cost
     FROM damaged_goods dg
     JOIN products p ON p.id = dg.product_id
     LEFT JOIN stock_movements sm ON sm.id = dg.movement_id
     LEFT JOIN stock_levels sl ON sl.product_id = dg.product_id AND sl.warehouse_id = dg.warehouse_id
     WHERE dg.company_id = $1 AND dg.created_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const { rows: expiredBatches } = await db.query(
    `SELECT sb.quantity_remaining, sb.expiry_date, sb.unit_cost, p.name AS product_name
     FROM stock_batches sb JOIN products p ON p.id = sb.product_id
     WHERE p.company_id = $1 AND sb.quantity_remaining > 0 AND sb.expiry_date IS NOT NULL AND sb.expiry_date <= $2`,
    [companyId, to]
  );
  const damagedExpired = [
    ...damagedRows.map((r) => ({ item: r.product_name, quantity: Number(r.quantity), value: Number(r.quantity) * Number(r.unit_cost), expiryDate: null, actionRequired: 'Write off (damaged)' })),
    ...expiredBatches.map((r) => ({ item: r.product_name, quantity: Number(r.quantity_remaining), value: Number(r.quantity_remaining) * Number(r.unit_cost), expiryDate: r.expiry_date, actionRequired: 'Write off (expired)' })),
  ];

  // ---- 14. Batch & Serial Number Tracking ----
  // No manufacturing_date field exists in this schema — received_date is
  // used in its place and labeled as such on the frontend, not silently
  // relabeled as "manufacturing date".
  const { rows: batchTracking } = await db.query(
    `SELECT sb.batch_no, p.name AS product_name, sb.quantity_remaining, sb.received_date, sb.expiry_date, w.name AS warehouse_name
     FROM stock_batches sb
     JOIN products p ON p.id = sb.product_id
     JOIN warehouses w ON w.id = sb.warehouse_id
     WHERE p.company_id = $1 AND sb.quantity_remaining > 0
     ORDER BY sb.received_date DESC LIMIT 100`,
    [companyId]
  );

  // ---- 15. Inventory Variance Report ----
  const { rows: varianceRows } = await db.query(
    `SELECT icl.system_quantity, icl.counted_quantity, icl.variance, p.name AS product_name,
            COALESCE(sl.average_cost, 0) AS unit_cost
     FROM inventory_count_lines icl
     JOIN inventory_counts ic ON ic.id = icl.count_id
     JOIN products p ON p.id = icl.product_id
     LEFT JOIN stock_levels sl ON sl.product_id = icl.product_id
     WHERE ic.company_id = $1 AND ic.status = 'completed' AND ic.completed_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const varianceReport = varianceRows.map((r) => ({
    item: r.product_name, systemQty: Number(r.system_quantity), physicalCount: Number(r.counted_quantity),
    variance: Number(r.variance) || 0, valueDifference: (Number(r.variance) || 0) * Number(r.unit_cost),
  }));

  // ---- 16. ABC Classification ----
  const sortedByValue = [...valuationLines].sort((a, b) => Number(b.stock_value) - Number(a.stock_value));
  let cumulative = 0;
  const abc = { A: { count: 0, value: 0 }, B: { count: 0, value: 0 }, C: { count: 0, value: 0 } };
  for (const l of sortedByValue) {
    cumulative += Number(l.stock_value);
    const cumPct = totalValue > 0 ? cumulative / totalValue : 0;
    const cls = cumPct <= 0.8 ? 'A' : cumPct <= 0.95 ? 'B' : 'C';
    abc[cls].count += 1;
    abc[cls].value += Number(l.stock_value);
  }
  const abcClassification = ['A', 'B', 'C'].map((k) => ({ category: k, numberOfItems: abc[k].count, inventoryValue: abc[k].value, pctOfTotal: pct(abc[k].value, totalValue) }));

  // ---- 17. Top 20 Most Valuable Items ----
  const top20ByValue = sortedByValue.slice(0, 20).map((l, i) => ({
    rank: i + 1, item: l.name, quantity: Number(l.quantity), unitCost: Number(l.average_cost), totalValue: Number(l.stock_value),
  }));

  if (req.query.format) {
    const SUMMARY_LABELS = {
      totalInventoryValue: 'Total Inventory Value', numberOfItems: 'Number of Items', totalQuantityOnHand: 'Total Quantity on Hand',
      inventoryTurnover: 'Inventory Turnover', stockDays: 'Stock Days', slowMovingItems: 'Slow Moving Items',
      deadStockItems: 'Dead Stock Items', outOfStockItems: 'Out of Stock Items', overstockItems: 'Overstock Items',
    };
    const movementRows = [
      { movement: 'Opening Stock', quantity: null, value: movementSummary.openingStock.value },
      { movement: 'Purchases', quantity: movementSummary.purchases.qty, value: movementSummary.purchases.value },
      { movement: 'Sales', quantity: movementSummary.sales.qty, value: movementSummary.sales.value },
      { movement: 'Customer Returns', quantity: movementSummary.customerReturns.qty, value: movementSummary.customerReturns.value },
      { movement: 'Supplier Returns', quantity: movementSummary.supplierReturns.qty, value: movementSummary.supplierReturns.value },
      { movement: 'Stock Transfers In', quantity: movementSummary.transfersIn.qty, value: movementSummary.transfersIn.value },
      { movement: 'Stock Transfers Out', quantity: movementSummary.transfersOut.qty, value: movementSummary.transfersOut.value },
      { movement: 'Stock Adjustments', quantity: movementSummary.adjustments.qty, value: movementSummary.adjustments.value },
      { movement: 'Closing Stock', quantity: movementSummary.closingStock.qty, value: movementSummary.closingStock.value },
    ];

    return sendExport(res, req.query.format, `inventory-management-report-${from}-to-${to}`, {
      title: 'Inventory Management Report',
      subtitle: `${from} to ${to} (Previous Period: ${prevFrom} to ${prevTo})`,
      tables: [
        {
          heading: '1. Executive Summary', rows: executiveSummary.map((r) => ({ ...r, kpi: SUMMARY_LABELS[r.key] })),
          columns: [
            { key: 'kpi', label: 'KPI', width: 2 },
            { key: 'current', label: 'Current Period', align: 'right', format: 'number' },
            { key: 'previous', label: 'Previous Period', align: 'right', format: 'number' },
            { key: 'variancePct', label: 'Variance %', align: 'right', format: 'number' },
          ],
        },
        {
          heading: '2. Inventory Valuation by Category', rows: byCategory,
          columns: [{ key: 'category', label: 'Category', width: 2 }, { key: 'qty', label: 'Qty', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }, { key: 'pctOfTotal', label: '% of Total', align: 'right', format: 'number' }],
        },
        {
          heading: '3. Inventory by Warehouse', rows: byWarehouse,
          columns: [{ key: 'warehouse', label: 'Warehouse', width: 2 }, { key: 'items', label: 'Items', align: 'right', format: 'number' }, { key: 'quantity', label: 'Quantity', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }],
        },
        {
          heading: '4. Stock Movement Summary', rows: movementRows,
          columns: [{ key: 'movement', label: 'Movement', width: 2 }, { key: 'quantity', label: 'Quantity', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }],
        },
        {
          heading: '5. Fast Moving Items', rows: fastMoving,
          columns: [{ key: 'itemCode', label: 'Item Code' }, { key: 'description', label: 'Description', width: 2 }, { key: 'qtySold', label: 'Qty Sold', align: 'right', format: 'number' }, { key: 'revenue', label: 'Revenue', align: 'right', format: 'currency' }, { key: 'closingStock', label: 'Closing Stock', align: 'right', format: 'number' }],
        },
        {
          heading: '6. Slow Moving Inventory (31-90 days since last sold)', rows: slowMoving,
          columns: [{ key: 'item', label: 'Item', width: 2 }, { key: 'quantity', label: 'Quantity', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }, { key: 'lastSold', label: 'Last Sold', format: 'date' }, { key: 'daysInStock', label: 'Days in Stock', align: 'right', format: 'number' }],
        },
        {
          heading: '7. Dead Stock Report (over 90 days without movement)', rows: deadStock,
          columns: [{ key: 'item', label: 'Item', width: 2 }, { key: 'quantity', label: 'Quantity', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }, { key: 'daysWithoutMovement', label: 'Days Without Movement', align: 'right', format: 'number' }],
        },
        {
          heading: '8. Reorder Level Report', rows: reorderLevel,
          columns: [{ key: 'item', label: 'Item', width: 2 }, { key: 'currentStock', label: 'Current Stock', align: 'right', format: 'number' }, { key: 'reorderLevel', label: 'Reorder Level', align: 'right', format: 'number' }, { key: 'recommendedPurchase', label: 'Recommended Purchase', align: 'right', format: 'number' }],
        },
        {
          heading: '9. Overstock Report (maximum level = 3x reorder level)', rows: overstock,
          columns: [{ key: 'item', label: 'Item', width: 2 }, { key: 'quantity', label: 'Quantity', align: 'right', format: 'number' }, { key: 'maximumLevel', label: 'Maximum Level', align: 'right', format: 'number' }, { key: 'excessQuantity', label: 'Excess Quantity', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }],
        },
        {
          heading: '10. Stock Ageing Analysis', rows: stockAgeing,
          columns: [{ key: 'age', label: 'Age', width: 2 }, { key: 'qty', label: 'Quantity', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }],
        },
        {
          heading: '11. Inventory Turnover Analysis', rows: turnoverByCategory,
          columns: [{ key: 'category', label: 'Category', width: 2 }, { key: 'averageInventory', label: 'Average Inventory', align: 'right', format: 'currency' }, { key: 'costOfGoodsSold', label: 'Cost of Goods Sold', align: 'right', format: 'currency' }, { key: 'turnoverRatio', label: 'Turnover Ratio', align: 'right', format: 'number' }],
        },
        {
          heading: '12. Stock Adjustment Report', rows: stockAdjustments,
          columns: [{ key: 'date', label: 'Date', format: 'date' }, { key: 'item', label: 'Item', width: 2 }, { key: 'adjustmentType', label: 'Type' }, { key: 'quantity', label: 'Quantity', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }],
        },
        {
          heading: '13. Damaged & Expired Stock', rows: damagedExpired,
          columns: [{ key: 'item', label: 'Item', width: 2 }, { key: 'quantity', label: 'Quantity', align: 'right', format: 'number' }, { key: 'value', label: 'Value', align: 'right', format: 'currency' }, { key: 'expiryDate', label: 'Expiry Date', format: 'date' }, { key: 'actionRequired', label: 'Action Required', width: 1.5 }],
        },
        {
          heading: '14. Batch & Serial Number Tracking (Received Date shown — no separate manufacturing date in this system)',
          rows: batchTracking.map((b) => ({ batchNo: b.batch_no, item: b.product_name, qty: b.quantity_remaining, receivedDate: b.received_date, expiryDate: b.expiry_date, warehouse: b.warehouse_name })),
          columns: [{ key: 'batchNo', label: 'Batch/Serial' }, { key: 'item', label: 'Item', width: 2 }, { key: 'qty', label: 'Qty', align: 'right', format: 'number' }, { key: 'receivedDate', label: 'Received Date', format: 'date' }, { key: 'expiryDate', label: 'Expiry Date', format: 'date' }, { key: 'warehouse', label: 'Warehouse' }],
        },
        {
          heading: '15. Inventory Variance Report (completed counts in this period)', rows: varianceReport,
          columns: [{ key: 'item', label: 'Item', width: 2 }, { key: 'systemQty', label: 'System Qty', align: 'right', format: 'number' }, { key: 'physicalCount', label: 'Physical Count', align: 'right', format: 'number' }, { key: 'variance', label: 'Variance', align: 'right', format: 'number' }, { key: 'valueDifference', label: 'Value Difference', align: 'right', format: 'currency' }],
        },
        {
          heading: '16. ABC Inventory Classification',
          rows: abcClassification.map((a) => ({ category: `Class ${a.category}`, numberOfItems: a.numberOfItems, inventoryValue: a.inventoryValue, pctOfTotal: a.pctOfTotal })),
          columns: [{ key: 'category', label: 'Category' }, { key: 'numberOfItems', label: 'Number of Items', align: 'right', format: 'number' }, { key: 'inventoryValue', label: 'Inventory Value', align: 'right', format: 'currency' }, { key: 'pctOfTotal', label: '% of Total', align: 'right', format: 'number' }],
        },
        {
          heading: '17. Top 20 Most Valuable Items', rows: top20ByValue,
          columns: [{ key: 'rank', label: 'Rank', align: 'right', format: 'number' }, { key: 'item', label: 'Item', width: 2 }, { key: 'quantity', label: 'Quantity', align: 'right', format: 'number' }, { key: 'unitCost', label: 'Unit Cost', align: 'right', format: 'currency' }, { key: 'totalValue', label: 'Total Value', align: 'right', format: 'currency' }],
        },
      ],
    });
  }

  res.json({
    from, to, prevFrom, prevTo,
    executiveSummary,
    valuationByCategory: byCategory,
    byWarehouse,
    movementSummary,
    fastMoving,
    slowMoving,
    deadStock,
    reorderLevel,
    overstock,
    stockAgeing,
    turnoverByCategory,
    stockAdjustments,
    damagedExpired,
    batchTracking,
    varianceReport,
    abcClassification,
    top20ByValue,
  });
});

module.exports = { managementReport };
