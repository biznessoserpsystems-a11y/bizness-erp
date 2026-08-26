const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const stockService = require('../services/stockService');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

const listGrns = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT g.*, s.name AS supplier_name, w.name AS warehouse_name, po.order_no,
            COALESCE(json_agg(json_build_object(
              'productId', gl.product_id, 'productName', p.name, 'sku', p.sku, 'quantity', gl.quantity, 'unitCost', gl.unit_cost
            )) FILTER (WHERE gl.id IS NOT NULL), '[]') AS lines
     FROM goods_received_notes g
     JOIN suppliers s ON s.id = g.supplier_id
     JOIN warehouses w ON w.id = g.warehouse_id
     LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id
     LEFT JOIN grn_lines gl ON gl.grn_id = g.id
     LEFT JOIN products p ON p.id = gl.product_id
     WHERE g.company_id = $1
     GROUP BY g.id, s.name, w.name, po.order_no
     ORDER BY g.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /grns  { purchaseOrderId, notes, lines: [{ purchaseOrderLineId, productId, quantity, unitCost, batchNo?, expiryDate? }] }
const createGrn = asyncHandler(async (req, res) => {
  const { purchaseOrderId, notes, lines } = req.body;
  if (!purchaseOrderId) throw new ApiError(400, 'purchaseOrderId is required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [purchaseOrderId, req.user.companyId]
    );
    if (!orderResult.rows.length) throw new ApiError(404, 'Purchase order not found');
    const order = orderResult.rows[0];
    if (order.status === 'cancelled') throw new ApiError(400, 'Cannot receive goods against a cancelled order');

    const grnNo = await salesService.generateDocNo(client, req.user.companyId, 'GRN');
    const grnResult = await client.query(
      `INSERT INTO goods_received_notes (company_id, supplier_id, purchase_order_id, warehouse_id, grn_no, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.companyId, order.supplier_id, purchaseOrderId, order.warehouse_id, grnNo, notes || null, req.user.id, order.currency, order.exchange_rate]
    );
    const grn = grnResult.rows[0];
    let receivedValue = 0;

    for (const line of lines) {
      const polResult = await client.query(
        'SELECT * FROM purchase_order_lines WHERE id = $1 AND purchase_order_id = $2 FOR UPDATE',
        [line.purchaseOrderLineId, purchaseOrderId]
      );
      if (!polResult.rows.length) throw new ApiError(404, 'Purchase order line not found');
      const pol = polResult.rows[0];

      const remaining = Number(pol.quantity) - Number(pol.received_quantity);
      if (Number(line.quantity) > remaining) {
        throw new ApiError(400, `Cannot receive ${line.quantity}: only ${remaining} remaining on this order line`);
      }

      const resolvedUnitCost = Number(line.unitCost ?? pol.unit_price); // in the PO's own currency
      // Inventory valuation (stock_batches/stock_levels.average_cost) is always tracked in
      // the company's BASE currency — it's one shared pool used for COGS and reporting
      // regardless of which currency any given purchase happened in. Convert here, before
      // touching the stock ledger, using the PO's own rate (not today's) since that's the
      // rate this purchase was actually agreed at.
      const baseUnitCost = Math.round(resolvedUnitCost * Number(order.exchange_rate) * 10000) / 10000;
      const movement = await stockService.receiveStock(client, {
        companyId: req.user.companyId, userId: req.user.id, productId: pol.product_id, warehouseId: order.warehouse_id,
        quantity: Number(line.quantity), unitCost: baseUnitCost,
        batchNo: line.batchNo, expiryDate: line.expiryDate, movementType: 'purchase_receipt',
        referenceType: 'grn', referenceId: grn.id, reason: `Goods received ${grnNo}`,
      });
      receivedValue += Number(line.quantity) * baseUnitCost;

      await client.query(
        `INSERT INTO grn_lines (grn_id, purchase_order_line_id, product_id, quantity, unit_cost, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [grn.id, pol.id, pol.product_id, line.quantity, resolvedUnitCost, movement.batch_id]
      );

      await client.query(
        'UPDATE purchase_order_lines SET received_quantity = received_quantity + $1 WHERE id = $2',
        [line.quantity, pol.id]
      );
    }

    const allLines = await client.query('SELECT quantity, received_quantity FROM purchase_order_lines WHERE purchase_order_id = $1', [purchaseOrderId]);
    const fullyReceived = allLines.rows.every((l) => Number(l.received_quantity) >= Number(l.quantity));
    const anyReceived = allLines.rows.some((l) => Number(l.received_quantity) > 0);
    const newStatus = fullyReceived ? 'received' : anyReceived ? 'partially_received' : order.status;
    await client.query('UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, purchaseOrderId]);

    // Auto-post to the General Ledger if the chart of accounts is set up.
    // Dr Inventory / Cr GRNI Clearing — recognizes the goods-received value in the GL
    // immediately, ahead of the supplier invoice arriving. The purchase invoice later
    // clears this same GRNI balance instead of re-debiting Inventory (see purchaseInvoiceController).
    if (receivedValue > 0 && await accountingService.hasAllMappings(client, req.user.companyId, ['inventory_asset', 'grni_clearing'])) {
      const inventoryAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'inventory_asset');
      const grniAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'grni_clearing');
      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: grn.received_date,
        referenceType: 'grn', referenceId: grn.id, description: `Goods received ${grnNo}`,
        lines: [
          { accountId: inventoryAccount, debit: receivedValue, credit: 0, description: `GRN ${grnNo}` },
          { accountId: grniAccount, debit: 0, credit: receivedValue, description: `GRN ${grnNo}` },
        ],
      });
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'grn', entityId: grn.id, newValues: { grnNo }, ip: req.ip });
    res.status(201).json(grn);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listGrns, createGrn };
