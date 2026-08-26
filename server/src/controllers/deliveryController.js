const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const stockService = require('../services/stockService');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

const listDeliveryNotes = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT dn.*, c.name AS customer_name, w.name AS warehouse_name, so.order_no,
            COALESCE(json_agg(json_build_object(
              'productId', dnl.product_id, 'productName', p.name, 'sku', p.sku, 'quantity', dnl.quantity
            )) FILTER (WHERE dnl.id IS NOT NULL), '[]') AS lines
     FROM delivery_notes dn
     JOIN customers c ON c.id = dn.customer_id
     JOIN warehouses w ON w.id = dn.warehouse_id
     LEFT JOIN sales_orders so ON so.id = dn.sales_order_id
     LEFT JOIN delivery_note_lines dnl ON dnl.delivery_note_id = dn.id
     LEFT JOIN products p ON p.id = dnl.product_id
     WHERE dn.company_id = $1
     GROUP BY dn.id, c.name, w.name, so.order_no
     ORDER BY dn.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /deliveries  { salesOrderId, notes, lines: [{ salesOrderLineId, productId, quantity, batchId? }] }
const createDeliveryNote = asyncHandler(async (req, res) => {
  const { salesOrderId, notes, lines } = req.body;
  if (!salesOrderId) throw new ApiError(400, 'salesOrderId is required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM sales_orders WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [salesOrderId, req.user.companyId]
    );
    if (!orderResult.rows.length) throw new ApiError(404, 'Sales order not found');
    const order = orderResult.rows[0];
    if (order.status === 'cancelled') throw new ApiError(400, 'Cannot deliver against a cancelled order');

    const deliveryNo = await salesService.generateDocNo(client, req.user.companyId, 'DN');
    const dnResult = await client.query(
      `INSERT INTO delivery_notes (company_id, customer_id, sales_order_id, warehouse_id, delivery_no, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.companyId, order.customer_id, salesOrderId, order.warehouse_id, deliveryNo, notes || null, req.user.id]
    );
    const deliveryNote = dnResult.rows[0];
    let cogsValue = 0;

    for (const line of lines) {
      const solResult = await client.query(
        'SELECT * FROM sales_order_lines WHERE id = $1 AND sales_order_id = $2 FOR UPDATE',
        [line.salesOrderLineId, salesOrderId]
      );
      if (!solResult.rows.length) throw new ApiError(404, 'Sales order line not found');
      const sol = solResult.rows[0];

      const remaining = Number(sol.quantity) - Number(sol.delivered_quantity);
      if (Number(line.quantity) > remaining) {
        throw new ApiError(400, `Cannot deliver ${line.quantity}: only ${remaining} remaining on this order line`);
      }

      const movements = await stockService.issueStock(client, {
        companyId: req.user.companyId, userId: req.user.id, productId: sol.product_id, warehouseId: order.warehouse_id,
        quantity: Number(line.quantity), batchId: line.batchId, movementType: 'stock_out',
        referenceType: 'delivery', referenceId: deliveryNote.id, reason: `Delivery ${deliveryNo}`,
      });

      for (const m of movements) {
        await client.query(
          `INSERT INTO delivery_note_lines (delivery_note_id, sales_order_line_id, product_id, quantity, batch_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [deliveryNote.id, sol.id, sol.product_id, m.quantity, m.batch_id]
        );
        cogsValue += Number(m.total_cost);
      }

      await client.query(
        'UPDATE sales_order_lines SET delivered_quantity = delivered_quantity + $1 WHERE id = $2',
        [line.quantity, sol.id]
      );
    }

    // Recompute order fulfillment status from all lines.
    const allLines = await client.query('SELECT quantity, delivered_quantity FROM sales_order_lines WHERE sales_order_id = $1', [salesOrderId]);
    const fullyDelivered = allLines.rows.every((l) => Number(l.delivered_quantity) >= Number(l.quantity));
    const anyDelivered = allLines.rows.some((l) => Number(l.delivered_quantity) > 0);
    const newStatus = fullyDelivered ? 'delivered' : anyDelivered ? 'partially_delivered' : order.status;
    await client.query('UPDATE sales_orders SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, salesOrderId]);

    // Auto-post to the General Ledger if the chart of accounts is set up.
    // Dr Cost of Goods Sold / Cr Inventory, at the actual FIFO/weighted-average cost the
    // stock ledger just recorded for the goods that physically left the warehouse.
    if (cogsValue > 0 && await accountingService.hasAllMappings(client, req.user.companyId, ['cogs', 'inventory_asset'])) {
      const cogsAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'cogs');
      const inventoryAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'inventory_asset');
      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: deliveryNote.delivery_date,
        referenceType: 'delivery_note', referenceId: deliveryNote.id, description: `COGS for delivery ${deliveryNo}`,
        lines: [
          { accountId: cogsAccount, debit: cogsValue, credit: 0, description: `COGS ${deliveryNo}` },
          { accountId: inventoryAccount, debit: 0, credit: cogsValue, description: `COGS ${deliveryNo}` },
        ],
      });
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'delivery_note', entityId: deliveryNote.id, newValues: { deliveryNo }, ip: req.ip });
    res.status(201).json(deliveryNote);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listDeliveryNotes, createDeliveryNote };
