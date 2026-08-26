'use strict';

const ApiError = require('./utils/ApiError');

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function getProduct(client, companyId, productId) {
  const { rows } = await client.query(
    'SELECT * FROM products WHERE id = $1 AND company_id = $2',
    [productId, companyId]
  );
  if (!rows[0]) {
    throw new ApiError(404, 'Product not found for this company.');
  }
  return rows[0];
}

async function getOrCreateStockLevel(client, productId, warehouseId) {
  const { rows } = await client.query(
    'SELECT * FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
    [productId, warehouseId]
  );
  if (rows[0]) return rows[0];

  const created = await client.query(
    'INSERT INTO stock_levels (product_id, warehouse_id, quantity, average_cost) VALUES ($1, $2, 0, 0) RETURNING *',
    [productId, warehouseId]
  );
  return created.rows[0];
}

/**
 * Recomputes stock_levels.quantity/average_cost for a batch-tracked product
 * by aggregating across all of its stock_batches rows. Called after any
 * receipt or issue that touches a batch, so stock_levels always mirrors
 * the sum of live batches.
 */
async function recalcFromBatches(client, { productId, warehouseId }) {
  await getOrCreateStockLevel(client, productId, warehouseId);

  const { rows } = await client.query(
    `SELECT COALESCE(SUM(quantity_remaining), 0) AS qty,
            CASE WHEN COALESCE(SUM(quantity_remaining), 0) = 0 THEN 0
                 ELSE SUM(quantity_remaining * unit_cost) / SUM(quantity_remaining)
            END AS avg_cost
     FROM stock_batches
     WHERE product_id = $1 AND warehouse_id = $2`,
    [productId, warehouseId]
  );

  const qty = Number(rows[0].qty);
  const avgCost = round2(rows[0].avg_cost);

  await client.query(
    `UPDATE stock_levels
     SET quantity = $1, average_cost = $2, updated_at = NOW()
     WHERE product_id = $3 AND warehouse_id = $4`,
    [qty, avgCost, productId, warehouseId]
  );

  return { quantity: qty, averageCost: avgCost };
}

async function recordMovement(client, {
  companyId, productId, warehouseId, batchId = null,
  movementType, quantity, unitCost, referenceType = null, referenceId = null,
  reason = null, notes = null, performedBy = null,
}) {
  const { rows } = await client.query(
    `INSERT INTO stock_movements
      (company_id, product_id, warehouse_id, batch_id, movement_type, quantity, unit_cost, total_cost, reference_type, reference_id, reason, notes, performed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      companyId, productId, warehouseId, batchId,
      movementType, quantity, unitCost, round2(quantity * unitCost),
      referenceType, referenceId, reason, notes, performedBy,
    ]
  );
  return rows[0];
}

/**
 * Receives stock into a warehouse. Non-batch products blend into a single
 * weighted-average stock_levels row; batch-tracked products require a
 * batchNo and blend within that specific batch, then stock_levels is
 * recomputed as the sum across all batches.
 */
async function receiveStock(client, {
  companyId, productId, warehouseId, quantity, unitCost,
  batchNo = null, expiryDate = null, performedBy = null,
  referenceType = null, referenceId = null, notes = null,
}) {
  if (!(Number(quantity) > 0)) {
    throw new ApiError(400, 'Quantity must be greater than zero.');
  }

  const product = await getProduct(client, companyId, productId);
  let batchId = null;

  if (product.is_batch_tracked) {
    if (!batchNo) {
      throw new ApiError(400, 'A batchNo is required for batch-tracked products.');
    }

    const existing = await client.query(
      'SELECT * FROM stock_batches WHERE product_id = $1 AND warehouse_id = $2 AND batch_no = $3',
      [productId, warehouseId, batchNo]
    );

    if (existing.rows[0]) {
      const batch = existing.rows[0];
      const newRemaining = Number(batch.quantity_remaining) + Number(quantity);
      const newReceived = Number(batch.quantity_received) + Number(quantity);
      const newUnitCost = round2(
        (Number(batch.quantity_remaining) * Number(batch.unit_cost) + Number(quantity) * Number(unitCost)) / newRemaining
      );

      await client.query(
        'UPDATE stock_batches SET quantity_remaining = $1, quantity_received = $2, unit_cost = $3 WHERE id = $4',
        [newRemaining, newReceived, newUnitCost, batch.id]
      );
      batchId = batch.id;
    } else {
      const inserted = await client.query(
        `INSERT INTO stock_batches
          (company_id, product_id, warehouse_id, batch_no, expiry_date, unit_cost, quantity_received, quantity_remaining)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
         RETURNING id`,
        [companyId, productId, warehouseId, batchNo, expiryDate, unitCost, quantity]
      );
      batchId = inserted.rows[0].id;
    }

    await recalcFromBatches(client, { productId, warehouseId });
  } else {
    const level = await getOrCreateStockLevel(client, productId, warehouseId);
    const currentQty = Number(level.quantity);
    const newQty = currentQty + Number(quantity);
    const newAvgCost = round2(
      (currentQty * Number(level.average_cost) + Number(quantity) * Number(unitCost)) / newQty
    );

    await client.query(
      'UPDATE stock_levels SET quantity = $1, average_cost = $2, updated_at = NOW() WHERE id = $3',
      [newQty, newAvgCost, level.id]
    );
  }

  const movement = await recordMovement(client, {
    companyId, productId, warehouseId, batchId,
    movementType: 'receipt', quantity, unitCost,
    referenceType, referenceId, notes, performedBy,
  });

  return { movement };
}

/**
 * Issues (deducts) stock from a warehouse. Non-batch products deduct
 * directly from stock_levels at the current average cost. Batch-tracked
 * products either consume a specific batchId (bypassing FIFO) or consume
 * eligible batches in FIFO order (soonest expiry first, NULLS LAST, then
 * received-date order), possibly splitting the issue across batches.
 * Returns an array of movement rows — one per batch touched (or a single
 * entry for non-batch products).
 */
async function issueStock(client, {
  companyId, productId, warehouseId, quantity, batchId = null,
  performedBy = null, referenceType = null, referenceId = null,
  reason = null, notes = null,
}) {
  if (!(Number(quantity) > 0)) {
    throw new ApiError(400, 'Quantity must be greater than zero.');
  }

  const product = await getProduct(client, companyId, productId);
  const movements = [];

  if (product.is_batch_tracked) {
    let remainingToIssue = Number(quantity);

    if (batchId) {
      const { rows } = await client.query(
        'SELECT * FROM stock_batches WHERE id = $1 AND product_id = $2 AND warehouse_id = $3 FOR UPDATE',
        [batchId, productId, warehouseId]
      );
      const batch = rows[0];
      if (!batch) {
        throw new ApiError(404, 'Batch not found.');
      }
      if (Number(batch.quantity_remaining) < remainingToIssue) {
        throw new ApiError(400, `Insufficient stock in the selected batch. Requested ${remainingToIssue}, available ${batch.quantity_remaining}.`);
      }

      await client.query(
        'UPDATE stock_batches SET quantity_remaining = quantity_remaining - $1 WHERE id = $2',
        [remainingToIssue, batch.id]
      );

      const movement = await recordMovement(client, {
        companyId, productId, warehouseId, batchId: batch.id,
        movementType: 'issue', quantity: remainingToIssue, unitCost: Number(batch.unit_cost),
        referenceType, referenceId, reason, notes, performedBy,
      });
      movements.push(movement);
    } else {
      const { rows: batches } = await client.query(
        `SELECT * FROM stock_batches
         WHERE product_id = $1 AND warehouse_id = $2 AND quantity_remaining > 0
         ORDER BY expiry_date ASC NULLS LAST, received_date ASC
         FOR UPDATE`,
        [productId, warehouseId]
      );

      const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity_remaining), 0);
      if (totalAvailable < remainingToIssue) {
        throw new ApiError(400, `Insufficient stock. Requested ${remainingToIssue}, available ${totalAvailable}.`);
      }

      for (const batch of batches) {
        if (remainingToIssue <= 0) break;
        const take = Math.min(Number(batch.quantity_remaining), remainingToIssue);
        if (take <= 0) continue;

        await client.query(
          'UPDATE stock_batches SET quantity_remaining = quantity_remaining - $1 WHERE id = $2',
          [take, batch.id]
        );

        const movement = await recordMovement(client, {
          companyId, productId, warehouseId, batchId: batch.id,
          movementType: 'issue', quantity: take, unitCost: Number(batch.unit_cost),
          referenceType, referenceId, reason, notes, performedBy,
        });
        movements.push(movement);

        remainingToIssue -= take;
      }
    }

    await recalcFromBatches(client, { productId, warehouseId });
  } else {
    const { rows } = await client.query(
      'SELECT * FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
      [productId, warehouseId]
    );
    const level = rows[0] || { id: null, quantity: 0, average_cost: 0 };

    if (Number(level.quantity) < Number(quantity)) {
      throw new ApiError(400, `Insufficient stock. Requested ${quantity}, available ${level.quantity}.`);
    }

    await client.query(
      'UPDATE stock_levels SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
      [quantity, level.id]
    );

    const movement = await recordMovement(client, {
      companyId, productId, warehouseId, batchId: null,
      movementType: 'issue', quantity, unitCost: Number(level.average_cost),
      referenceType, referenceId, reason, notes, performedBy,
    });
    movements.push(movement);
  }

  return movements;
}

module.exports = { receiveStock, issueStock, recalcFromBatches };
