const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const stockService = require('../services/stockService');
const { recordAudit } = require('../middleware/auditLog');

const listCounts = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ic.*, w.name AS warehouse_name, u.first_name, u.last_name,
            COUNT(icl.id) AS line_count
     FROM inventory_counts ic
     JOIN warehouses w ON w.id = ic.warehouse_id
     LEFT JOIN users u ON u.id = ic.created_by
     LEFT JOIN inventory_count_lines icl ON icl.count_id = ic.id
     WHERE ic.company_id = $1
     GROUP BY ic.id, w.name, u.first_name, u.last_name
     ORDER BY ic.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /inventory-counts/:id  (with lines)
const getCount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT ic.*, w.name AS warehouse_name FROM inventory_counts ic
     JOIN warehouses w ON w.id = ic.warehouse_id
     WHERE ic.id = $1 AND ic.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Inventory count not found');

  const lines = await db.query(
    `SELECT icl.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol, sb.batch_no, sb.expiry_date
     FROM inventory_count_lines icl
     JOIN products p ON p.id = icl.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     LEFT JOIN stock_batches sb ON sb.id = icl.batch_id
     WHERE icl.count_id = $1
     ORDER BY p.name, sb.batch_no NULLS FIRST`,
    [id]
  );

  res.json({ ...header.rows[0], lines: lines.rows });
});

// POST /inventory-counts  { warehouseId, notes, categoryId? } — snapshots current stock as the count sheet
const createCount = asyncHandler(async (req, res) => {
  const { warehouseId, notes, categoryId } = req.body;
  if (!warehouseId) throw new ApiError(400, 'warehouseId is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const countNo = `CNT-${Date.now()}`;
    const headerResult = await client.query(
      `INSERT INTO inventory_counts (company_id, warehouse_id, count_no, notes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.companyId, warehouseId, countNo, notes || null, req.user.id]
    );
    const count = headerResult.rows[0];

    const categoryFilter = categoryId ? 'AND p.category_id = $3' : '';
    const params = categoryId ? [warehouseId, req.user.companyId, categoryId] : [warehouseId, req.user.companyId];

    // Non-batch products: one count line at the aggregate stock_levels quantity, as before.
    const nonBatchRows = await client.query(
      `SELECT sl.product_id, sl.quantity AS system_quantity
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
       WHERE sl.warehouse_id = $1 AND p.company_id = $2 AND p.is_active = TRUE AND p.is_batch_tracked = FALSE ${categoryFilter}`,
      params
    );

    // Batch-tracked products: one count line PER BATCH, so a completed count can reconcile
    // individual batch quantities rather than only the product's total. (Batches fully
    // consumed already — quantity_remaining = 0 — have nothing physical to count.)
    const batchRows = await client.query(
      `SELECT sb.product_id, sb.quantity_remaining AS system_quantity, sb.id AS batch_id
       FROM stock_batches sb
       JOIN products p ON p.id = sb.product_id
       WHERE sb.warehouse_id = $1 AND p.company_id = $2 AND p.is_active = TRUE AND p.is_batch_tracked = TRUE
             AND sb.quantity_remaining > 0 ${categoryFilter}`,
      params
    );

    for (const row of nonBatchRows.rows) {
      await client.query(
        `INSERT INTO inventory_count_lines (count_id, product_id, system_quantity)
         VALUES ($1, $2, $3)`,
        [count.id, row.product_id, row.system_quantity]
      );
    }
    for (const row of batchRows.rows) {
      await client.query(
        `INSERT INTO inventory_count_lines (count_id, product_id, batch_id, system_quantity)
         VALUES ($1, $2, $3, $4)`,
        [count.id, row.product_id, row.batch_id, row.system_quantity]
      );
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'inventory_count', entityId: count.id, newValues: req.body, ip: req.ip });
    res.status(201).json(count);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /inventory-counts/:id/lines/:lineId  { countedQuantity, notes }
const updateCountLine = asyncHandler(async (req, res) => {
  const { id, lineId } = req.params;
  const { countedQuantity, notes } = req.body;
  if (countedQuantity === undefined) throw new ApiError(400, 'countedQuantity is required');

  const lineResult = await db.query(
    `SELECT icl.* FROM inventory_count_lines icl
     JOIN inventory_counts ic ON ic.id = icl.count_id
     WHERE icl.id = $1 AND icl.count_id = $2 AND ic.company_id = $3 AND ic.status = 'draft'`,
    [lineId, id, req.user.companyId]
  );
  if (!lineResult.rows.length) throw new ApiError(404, 'Count line not found or count already completed');

  const variance = Number(countedQuantity) - Number(lineResult.rows[0].system_quantity);
  const { rows } = await db.query(
    `UPDATE inventory_count_lines SET counted_quantity = $1, variance = $2, notes = $3 WHERE id = $4 RETURNING *`,
    [countedQuantity, variance, notes || null, lineId]
  );
  res.json(rows[0]);
});

// POST /inventory-counts/:id/complete — applies variances as stock adjustments
const completeCount = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const countResult = await client.query(
      `SELECT * FROM inventory_counts WHERE id = $1 AND company_id = $2 AND status = 'draft' FOR UPDATE`,
      [id, req.user.companyId]
    );
    if (!countResult.rows.length) throw new ApiError(404, 'Inventory count not found or already completed');
    const count = countResult.rows[0];

    const linesResult = await client.query(
      `SELECT * FROM inventory_count_lines WHERE count_id = $1 AND counted_quantity IS NOT NULL AND variance != 0`,
      [id]
    );

    for (const line of linesResult.rows) {
      if (line.batch_id) {
        // Batch-tracked: adjust the specific batch's remaining quantity, then let
        // stockService recompute the aggregate stock_levels row from all of the
        // product's batches — this is what keeps the two in sync going forward,
        // since any later receipt/issue also recalculates stock_levels this same way.
        const batchResult = await client.query(
          'SELECT * FROM stock_batches WHERE id = $1 AND product_id = $2 AND warehouse_id = $3 FOR UPDATE',
          [line.batch_id, line.product_id, count.warehouse_id]
        );
        if (!batchResult.rows.length) continue; // batch no longer exists — nothing to reconcile
        const batch = batchResult.rows[0];
        const unitCost = Number(batch.unit_cost) || 0;

        await client.query(
          `INSERT INTO stock_movements
             (company_id, product_id, warehouse_id, batch_id, movement_type, quantity, unit_cost, total_cost,
              reference_type, reference_id, reason, performed_by)
           VALUES ($1,$2,$3,$4,'count_adjustment',$5,$6,$7,'count',$8,'Physical count variance',$9)`,
          [
            req.user.companyId, line.product_id, count.warehouse_id, line.batch_id, Math.abs(line.variance),
            unitCost, Math.abs(line.variance) * unitCost, id, req.user.id,
          ]
        );

        await client.query(
          'UPDATE stock_batches SET quantity_remaining = $1 WHERE id = $2',
          [line.counted_quantity, line.batch_id]
        );
        await stockService.recalcFromBatches(client, line.product_id, count.warehouse_id);
      } else {
        const level = await client.query(
          'SELECT * FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
          [line.product_id, count.warehouse_id]
        );
        const unitCost = level.rows[0]?.average_cost || 0;

        await client.query(
          `INSERT INTO stock_movements
             (company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, total_cost,
              reference_type, reference_id, reason, performed_by)
           VALUES ($1,$2,$3,'count_adjustment',$4,$5,$6,'count',$7,'Physical count variance',$8)`,
          [
            req.user.companyId, line.product_id, count.warehouse_id, Math.abs(line.variance),
            unitCost, Math.abs(line.variance) * unitCost, id, req.user.id,
          ]
        );

        await client.query(
          `UPDATE stock_levels SET quantity = $1, updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3`,
          [line.counted_quantity, line.product_id, count.warehouse_id]
        );
      }
    }

    await client.query(
      `UPDATE inventory_counts SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'inventory_count', entityId: id, newValues: { status: 'completed' }, ip: req.ip });
    res.json({ message: 'Count completed and variances applied', linesAdjusted: linesResult.rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listCounts, getCount, createCount, updateCountLine, completeCount };
