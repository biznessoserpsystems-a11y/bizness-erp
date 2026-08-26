const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendExport } = require('../services/exportService');

// Mirrors the split already implicit in the codebase: every type here is
// recorded via stockService.receiveStock (adds to the bin) or
// stockService.issueStock (removes from the bin) — see grnController,
// deliveryController, transferController, manufacturingController,
// purchaseReturnController and returnController for where each is used.
const IN_TYPES = new Set(['stock_in', 'purchase_receipt', 'transfer_in', 'adjustment_increase', 'production_receipt', 'sales_return']);
const OUT_TYPES = new Set(['stock_out', 'purchase_return', 'transfer_out', 'adjustment_decrease', 'damaged', 'production_issue']);

const MOVEMENT_LABELS = {
  stock_in: 'Stock In (Manual)', stock_out: 'Stock Out (Manual)',
  purchase_receipt: 'Purchase Receipt', purchase_return: 'Purchase Return',
  transfer_in: 'Transfer In', transfer_out: 'Transfer Out',
  adjustment_increase: 'Adjustment (Increase)', adjustment_decrease: 'Adjustment (Decrease)',
  production_receipt: 'Production Receipt', production_issue: 'Production Issue',
  sales_return: 'Sales Return', damaged: 'Damaged / Written Off',
};

// GET /inventory-reports/bins — every bin, for the report's bin picker.
const listBins = asyncHandler(async (req, res) => {
  const { warehouseId } = req.query;
  const params = [req.user.companyId];
  let filter = '';
  if (warehouseId) { params.push(warehouseId); filter = `AND b.warehouse_id = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT b.id, b.bin_code, b.created_at,
            p.id AS product_id, p.sku, p.name AS product_name,
            w.id AS warehouse_id, w.name AS warehouse_name,
            COALESCE(sl.quantity, 0) AS current_quantity,
            COALESCE(sl.average_cost, 0) AS average_cost,
            u.symbol AS uom_symbol
     FROM bins b
     JOIN products p ON p.id = b.product_id
     JOIN warehouses w ON w.id = b.warehouse_id
     LEFT JOIN stock_levels sl ON sl.product_id = b.product_id AND sl.warehouse_id = b.warehouse_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE b.company_id = $1 ${filter}
     ORDER BY p.name, w.name`,
    params
  );
  res.json(rows);
});

// GET /inventory-reports/bin-card?binId=  (or ?productId=&warehouseId=)
const binCardReport = asyncHandler(async (req, res) => {
  const { binId } = req.query;
  let { productId, warehouseId } = req.query;

  if (binId) {
    const { rows } = await db.query('SELECT * FROM bins WHERE id = $1 AND company_id = $2', [binId, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Bin not found');
    productId = rows[0].product_id;
    warehouseId = rows[0].warehouse_id;
  }
  if (!productId || !warehouseId) throw new ApiError(400, 'binId (or productId + warehouseId) is required');

  const binResult = await db.query(
    `SELECT b.*, p.sku, p.name AS product_name, w.name AS warehouse_name, u.symbol AS uom_symbol,
            COALESCE(sl.quantity, 0) AS current_quantity, COALESCE(sl.average_cost, 0) AS average_cost
     FROM bins b
     JOIN products p ON p.id = b.product_id
     JOIN warehouses w ON w.id = b.warehouse_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     LEFT JOIN stock_levels sl ON sl.product_id = b.product_id AND sl.warehouse_id = b.warehouse_id
     WHERE b.product_id = $1 AND b.warehouse_id = $2 AND b.company_id = $3`,
    [productId, warehouseId, req.user.companyId]
  );
  if (!binResult.rows.length) throw new ApiError(404, 'This product has no bin in that warehouse yet — one is created automatically the first time stock is received');
  const bin = binResult.rows[0];

  const { rows: movements } = await db.query(
    `SELECT sm.id, sm.movement_type, sm.quantity, sm.unit_cost, sm.total_cost, sm.reference_type,
            sm.reference_id, sm.reason, sm.notes, sm.created_at,
            u.first_name AS performed_by_first_name, u.last_name AS performed_by_last_name
     FROM stock_movements sm
     LEFT JOIN users u ON u.id = sm.performed_by
     WHERE sm.product_id = $1 AND sm.warehouse_id = $2 AND sm.company_id = $3
     ORDER BY sm.created_at ASC, sm.id ASC`,
    [productId, warehouseId, req.user.companyId]
  );

  // Running balance, oldest to newest — the classic bin-card layout.
  let balance = 0;
  let totalIn = 0;
  let totalOut = 0;
  const monthly = new Map(); // 'YYYY-MM' -> { in, out }
  const byType = new Map(); // movement_type -> qty

  const ledger = movements.map((m) => {
    const isIn = IN_TYPES.has(m.movement_type);
    const qty = Number(m.quantity);
    const qtyIn = isIn ? qty : 0;
    const qtyOut = isIn ? 0 : qty;
    balance += qtyIn - qtyOut;
    totalIn += qtyIn;
    totalOut += qtyOut;

    const monthKey = m.created_at.toISOString().slice(0, 7);
    const bucket = monthly.get(monthKey) || { month: monthKey, in: 0, out: 0 };
    bucket.in += qtyIn;
    bucket.out += qtyOut;
    monthly.set(monthKey, bucket);

    byType.set(m.movement_type, (byType.get(m.movement_type) || 0) + qty);

    return {
      id: m.id, date: m.created_at, movementType: m.movement_type,
      movementLabel: MOVEMENT_LABELS[m.movement_type] || m.movement_type,
      referenceType: m.reference_type, referenceId: m.reference_id,
      reason: m.reason, notes: m.notes,
      performedBy: m.performed_by_first_name ? `${m.performed_by_first_name} ${m.performed_by_last_name}` : null,
      qtyIn, qtyOut, unitCost: Number(m.unit_cost), totalCost: Number(m.total_cost), balance,
    };
  });

  if (req.query.format) {
    return sendExport(res, req.query.format, 'bin-card', {
      title: `Bin Card — ${bin.sku} (${bin.product_name})`,
      subtitle: `${bin.warehouse_name} · Bin ${bin.bin_code} · Balance: ${balance.toLocaleString()}`,
      columns: [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'movementLabel', label: 'Movement' },
        { key: 'qtyIn', label: 'Qty In', format: 'number', align: 'right' },
        { key: 'qtyOut', label: 'Qty Out', format: 'number', align: 'right' },
        { key: 'balance', label: 'Balance', format: 'number', align: 'right' },
        { key: 'unitCost', label: 'Unit Cost', format: 'currency', align: 'right' },
      ],
      rows: ledger,
    });
  }

  res.json({
    bin: {
      id: bin.id, binCode: bin.bin_code, createdAt: bin.created_at,
      productId: bin.product_id, sku: bin.sku, productName: bin.product_name,
      warehouseId: bin.warehouse_id, warehouseName: bin.warehouse_name, uomSymbol: bin.uom_symbol,
      currentQuantity: Number(bin.current_quantity), averageCost: Number(bin.average_cost),
    },
    ledger,
    totals: { totalIn, totalOut, currentBalance: balance, movementCount: ledger.length },
    charts: {
      balanceTrend: ledger.map((l) => ({ date: l.date, balance: l.balance })),
      monthlyInOut: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
      movementTypeBreakdown: [...byType.entries()].map(([type, qty]) => ({ name: MOVEMENT_LABELS[type] || type, value: qty })),
    },
  });
});

module.exports = { listBins, binCardReport };
