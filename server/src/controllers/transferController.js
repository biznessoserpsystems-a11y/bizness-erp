const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const stockService = require('../services/stockService');
const { recordAudit } = require('../middleware/auditLog');

const listTransfers = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT st.*, wf.name AS from_warehouse_name, wt.name AS to_warehouse_name, u.first_name, u.last_name,
            COALESCE(json_agg(json_build_object(
              'productId', stl.product_id, 'productName', p.name, 'sku', p.sku,
              'quantity', stl.quantity, 'unitCost', stl.unit_cost
            )) FILTER (WHERE stl.id IS NOT NULL), '[]') AS lines
     FROM stock_transfers st
     JOIN warehouses wf ON wf.id = st.from_warehouse_id
     JOIN warehouses wt ON wt.id = st.to_warehouse_id
     LEFT JOIN users u ON u.id = st.created_by
     LEFT JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
     LEFT JOIN products p ON p.id = stl.product_id
     WHERE st.company_id = $1
     GROUP BY st.id, wf.name, wt.name, u.first_name, u.last_name
     ORDER BY st.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /transfers  { fromWarehouseId, toWarehouseId, notes, lines: [{ productId, batchId, quantity }] }
const createTransfer = asyncHandler(async (req, res) => {
  const { fromWarehouseId, toWarehouseId, notes, lines } = req.body;
  if (!fromWarehouseId || !toWarehouseId) throw new ApiError(400, 'fromWarehouseId and toWarehouseId are required');
  if (fromWarehouseId === toWarehouseId) throw new ApiError(400, 'Source and destination warehouse must differ');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const transferNo = `TRF-${Date.now()}`;
    const headerResult = await client.query(
      `INSERT INTO stock_transfers (company_id, transfer_no, from_warehouse_id, to_warehouse_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.companyId, transferNo, fromWarehouseId, toWarehouseId, notes || null, req.user.id]
    );
    const transfer = headerResult.rows[0];

    for (const line of lines) {
      const { productId, batchId, quantity } = line;
      if (!productId || !quantity) throw new ApiError(400, 'Each line requires productId and quantity');

      // Pull stock out of the source warehouse (FIFO if batch-tracked and no batchId given).
      const outMovements = await stockService.issueStock(client, {
        companyId: req.user.companyId, userId: req.user.id, productId, warehouseId: fromWarehouseId,
        quantity: Number(quantity), batchId, movementType: 'transfer_out',
        referenceType: 'transfer', referenceId: transfer.id, reason: `Transfer to warehouse`,
      });

      // Push the same quantity into the destination warehouse at the same cost(s).
      for (const outM of outMovements) {
        let destBatchNo;
        let expiryDate;
        if (outM.batch_id) {
          const batchInfo = await client.query('SELECT batch_no, expiry_date FROM stock_batches WHERE id = $1', [outM.batch_id]);
          destBatchNo = batchInfo.rows[0]?.batch_no;
          expiryDate = batchInfo.rows[0]?.expiry_date;
        }
        await stockService.receiveStock(client, {
          companyId: req.user.companyId, userId: req.user.id, productId, warehouseId: toWarehouseId,
          quantity: Number(outM.quantity), unitCost: Number(outM.unit_cost), batchNo: destBatchNo, expiryDate,
          movementType: 'transfer_in', referenceType: 'transfer', referenceId: transfer.id, reason: `Transfer from warehouse`,
        });

        await client.query(
          `INSERT INTO stock_transfer_lines (transfer_id, product_id, batch_id, quantity, unit_cost)
           VALUES ($1,$2,$3,$4,$5)`,
          [transfer.id, productId, outM.batch_id, outM.quantity, outM.unit_cost]
        );
      }
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'stock_transfer', entityId: transfer.id, newValues: req.body, ip: req.ip });
    res.status(201).json(transfer);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listTransfers, createTransfer };
