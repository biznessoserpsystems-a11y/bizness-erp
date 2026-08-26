const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const stockService = require('../services/stockService');
const { recordAudit } = require('../middleware/auditLog');

// POST /stock/in
const stockIn = asyncHandler(async (req, res) => {
  const { productId, warehouseId, quantity, unitCost, batchNo, expiryDate, reason, notes } = req.body;
  if (!productId || !warehouseId || !quantity) throw new ApiError(400, 'productId, warehouseId, and quantity are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const movement = await stockService.receiveStock(client, {
      companyId: req.user.companyId, userId: req.user.id, productId, warehouseId,
      quantity: Number(quantity), unitCost: Number(unitCost) || 0, batchNo, expiryDate,
      movementType: 'stock_in', referenceType: 'manual', reason, notes,
    });
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'stock_movement', entityId: movement.id, newValues: req.body, ip: req.ip });
    res.status(201).json(movement);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /stock/out
const stockOut = asyncHandler(async (req, res) => {
  const { productId, warehouseId, quantity, batchId, reason, notes } = req.body;
  if (!productId || !warehouseId || !quantity) throw new ApiError(400, 'productId, warehouseId, and quantity are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const movements = await stockService.issueStock(client, {
      companyId: req.user.companyId, userId: req.user.id, productId, warehouseId,
      quantity: Number(quantity), batchId, movementType: 'stock_out', referenceType: 'manual', reason, notes,
    });
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'stock_movement', entityId: movements[0]?.id, newValues: req.body, ip: req.ip });
    res.status(201).json(movements);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /stock/adjust  { direction: 'increase' | 'decrease' }
const adjustStock = asyncHandler(async (req, res) => {
  const { productId, warehouseId, quantity, direction, batchId, unitCost, reason } = req.body;
  if (!productId || !warehouseId || !quantity || !direction) {
    throw new ApiError(400, 'productId, warehouseId, quantity, and direction are required');
  }
  if (!reason) throw new ApiError(400, 'A reason is required for stock adjustments');
  if (!['increase', 'decrease'].includes(direction)) throw new ApiError(400, 'direction must be "increase" or "decrease"');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    let result;
    if (direction === 'increase') {
      const product = await stockService.getProduct(client, req.user.companyId, productId);
      result = await stockService.receiveStock(client, {
        companyId: req.user.companyId, userId: req.user.id, productId, warehouseId,
        quantity: Number(quantity), unitCost: Number(unitCost) || 0,
        batchNo: product.is_batch_tracked ? (req.body.batchNo || `ADJ-${Date.now()}`) : undefined,
        movementType: 'adjustment_increase', referenceType: 'adjustment', reason,
      });
    } else {
      result = await stockService.issueStock(client, {
        companyId: req.user.companyId, userId: req.user.id, productId, warehouseId,
        quantity: Number(quantity), batchId, movementType: 'adjustment_decrease', referenceType: 'adjustment', reason,
      });
    }
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'stock_movement', newValues: req.body, ip: req.ip });
    res.status(201).json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /stock/damage
const reportDamage = asyncHandler(async (req, res) => {
  const { productId, warehouseId, quantity, batchId, reason } = req.body;
  if (!productId || !warehouseId || !quantity || !reason) {
    throw new ApiError(400, 'productId, warehouseId, quantity, and reason are required');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const movements = await stockService.issueStock(client, {
      companyId: req.user.companyId, userId: req.user.id, productId, warehouseId,
      quantity: Number(quantity), batchId, movementType: 'damaged', referenceType: 'damage', reason,
    });

    for (const m of movements) {
      await client.query(
        `INSERT INTO damaged_goods (company_id, product_id, warehouse_id, batch_id, quantity, reason, movement_id, reported_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.user.companyId, productId, warehouseId, m.batch_id, m.quantity, reason, m.id, req.user.id]
      );
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'damaged_goods', newValues: req.body, ip: req.ip });
    res.status(201).json(movements);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /stock/damaged-goods?limit=
const listDamagedGoods = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const { rows } = await db.query(
    `SELECT dg.*, p.name AS product_name, p.sku, w.name AS warehouse_name, u.first_name, u.last_name
     FROM damaged_goods dg
     JOIN products p ON p.id = dg.product_id
     JOIN warehouses w ON w.id = dg.warehouse_id
     LEFT JOIN users u ON u.id = dg.reported_by
     WHERE dg.company_id = $1
     ORDER BY dg.created_at DESC
     LIMIT $2`,
    [req.user.companyId, limit]
  );
  res.json(rows);
});

// GET /stock/movements?productId=&warehouseId=&movementType=&limit=&offset=
const listMovements = asyncHandler(async (req, res) => {
  const { productId, warehouseId, movementType, limit = 50, offset = 0 } = req.query;
  const conditions = ['sm.company_id = $1'];
  const params = [req.user.companyId];

  if (productId) { params.push(productId); conditions.push(`sm.product_id = $${params.length}`); }
  if (warehouseId) { params.push(warehouseId); conditions.push(`sm.warehouse_id = $${params.length}`); }
  if (movementType) { params.push(movementType); conditions.push(`sm.movement_type = $${params.length}`); }

  params.push(Math.min(parseInt(limit, 10) || 50, 200));
  const limitIdx = params.length;
  params.push(parseInt(offset, 10) || 0);
  const offsetIdx = params.length;

  const { rows } = await db.query(
    `SELECT sm.*, p.name AS product_name, p.sku, w.name AS warehouse_name,
            u.first_name, u.last_name, sb.batch_no
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     JOIN warehouses w ON w.id = sm.warehouse_id
     LEFT JOIN users u ON u.id = sm.performed_by
     LEFT JOIN stock_batches sb ON sb.id = sm.batch_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sm.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  res.json(rows);
});

module.exports = { stockIn, stockOut, adjustStock, reportDamage, listDamagedGoods, listMovements };
