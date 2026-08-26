const ApiError = require('../utils/ApiError');
const inventorySettingsService = require('./inventorySettingsService');

/**
 * All functions here expect an active pg client (inside a transaction) as
 * the first argument. Callers are responsible for BEGIN/COMMIT/ROLLBACK.
 *
 * stock_levels is a materialized balance kept in sync here so reports don't
 * need to sum the whole ledger every time. stock_movements is the append-only
 * source of truth; if the two ever disagree, movements win.
 */

async function getProduct(client, companyId, productId) {
  const { rows } = await client.query(
    'SELECT * FROM products WHERE id = $1 AND company_id = $2',
    [productId, companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Product not found');
  return rows[0];
}

async function getOrCreateStockLevel(client, productId, warehouseId) {
  const existing = await client.query(
    'SELECT * FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
    [productId, warehouseId]
  );
  if (existing.rows.length) return existing.rows[0];

  const { rows } = await client.query(
    `INSERT INTO stock_levels (product_id, warehouse_id, quantity, average_cost)
     VALUES ($1, $2, 0, 0) RETURNING *`,
    [productId, warehouseId]
  );
  return rows[0];
}

/**
 * Ensures a bin card exists the first time a product is received into a
 * warehouse — this is the "automatically create a new bin for each new
 * product purchased" behavior. bin_code is derived from the warehouse
 * code + product SKU (e.g. BIN-WH1-RICE25KG); ON CONFLICT makes this safe
 * to call on every receipt without a race against a concurrent first
 * receipt of the same product/warehouse.
 */
async function getOrCreateBin(client, companyId, productId, warehouseId) {
  const existing = await client.query(
    'SELECT * FROM bins WHERE product_id = $1 AND warehouse_id = $2',
    [productId, warehouseId]
  );
  if (existing.rows.length) return existing.rows[0];

  const [{ rows: wRows }, { rows: pRows }] = await Promise.all([
    client.query('SELECT code FROM warehouses WHERE id = $1', [warehouseId]),
    client.query('SELECT sku FROM products WHERE id = $1', [productId]),
  ]);
  const clean = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const whCode = clean(wRows[0]?.code).slice(0, 12) || 'WH';
  const sku = clean(pRows[0]?.sku).slice(0, 25) || 'ITEM';
  const binCode = `BIN-${whCode}-${sku}`.slice(0, 50);

  const { rows } = await client.query(
    `INSERT INTO bins (company_id, warehouse_id, product_id, bin_code)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (warehouse_id, product_id) DO UPDATE SET bin_code = bins.bin_code
     RETURNING *`,
    [companyId, warehouseId, productId, binCode]
  );
  return rows[0];
}

/** Recomputes stock_levels for a batch-tracked product by aggregating its batches. */
async function recalcFromBatches(client, productId, warehouseId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(quantity_remaining), 0) AS qty,
            CASE WHEN COALESCE(SUM(quantity_remaining), 0) = 0 THEN 0
                 ELSE SUM(quantity_remaining * unit_cost) / SUM(quantity_remaining)
            END AS avg_cost
     FROM stock_batches WHERE product_id = $1 AND warehouse_id = $2`,
    [productId, warehouseId]
  );
  const { qty, avg_cost } = rows[0];
  await getOrCreateStockLevel(client, productId, warehouseId);
  await client.query(
    `UPDATE stock_levels SET quantity = $1, average_cost = $2, updated_at = NOW()
     WHERE product_id = $3 AND warehouse_id = $4`,
    [qty, avg_cost, productId, warehouseId]
  );
}

async function insertMovement(client, {
  companyId, productId, warehouseId, batchId, movementType, quantity, unitCost,
  referenceType, referenceId, reason, notes, performedBy,
}) {
  const { rows } = await client.query(
    `INSERT INTO stock_movements
       (company_id, product_id, warehouse_id, batch_id, movement_type, quantity, unit_cost, total_cost,
        reference_type, reference_id, reason, notes, performed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      companyId, productId, warehouseId, batchId || null, movementType, quantity, unitCost,
      Number(quantity) * Number(unitCost), referenceType || 'manual', referenceId || null,
      reason || null, notes || null, performedBy || null,
    ]
  );
  return rows[0];
}

/**
 * Receive stock into a warehouse. Handles batch creation/blending and
 * weighted-average cost recalculation.
 */
async function receiveStock(client, {
  companyId, userId, productId, warehouseId, quantity, unitCost,
  batchNo, expiryDate, movementType = 'stock_in', referenceType, referenceId, reason, notes,
}) {
  if (quantity <= 0) throw new ApiError(400, 'Quantity must be greater than zero');
  const product = await getProduct(client, companyId, productId);

  // Every receipt provisions this product's bin in this warehouse if it
  // doesn't already have one — covers purchases (GRN), production receipts,
  // and sales returns alike, since all of them mean "this item now lives
  // in this warehouse" just as much as a purchase does.
  await getOrCreateBin(client, companyId, productId, warehouseId);

  let batchId = null;

  if (product.is_batch_tracked) {
    if (!batchNo) throw new ApiError(400, 'batchNo is required for batch-tracked products');

    const existingBatch = await client.query(
      'SELECT * FROM stock_batches WHERE product_id = $1 AND warehouse_id = $2 AND batch_no = $3',
      [productId, warehouseId, batchNo]
    );

    if (existingBatch.rows.length) {
      const b = existingBatch.rows[0];
      const newQtyRemaining = Number(b.quantity_remaining) + Number(quantity);
      const newQtyReceived = Number(b.quantity_received) + Number(quantity);
      const blendedCost =
        (Number(b.quantity_remaining) * Number(b.unit_cost) + Number(quantity) * Number(unitCost)) /
        (Number(b.quantity_remaining) + Number(quantity) || 1);
      await client.query(
        `UPDATE stock_batches SET quantity_remaining = $1, quantity_received = $2, unit_cost = $3
         WHERE id = $4`,
        [newQtyRemaining, newQtyReceived, blendedCost, b.id]
      );
      batchId = b.id;
    } else {
      const { rows } = await client.query(
        `INSERT INTO stock_batches
           (company_id, product_id, warehouse_id, batch_no, expiry_date, unit_cost, quantity_received, quantity_remaining)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
        [companyId, productId, warehouseId, batchNo, expiryDate || null, unitCost, quantity]
      );
      batchId = rows[0].id;
    }
  }

  const movement = await insertMovement(client, {
    companyId, productId, warehouseId, batchId, movementType, quantity, unitCost,
    referenceType, referenceId, reason, notes, performedBy: userId,
  });

  if (product.is_batch_tracked) {
    await recalcFromBatches(client, productId, warehouseId);
  } else {
    const level = await getOrCreateStockLevel(client, productId, warehouseId);
    const newQty = Number(level.quantity) + Number(quantity);
    const newAvgCost = newQty === 0 ? 0 :
      (Number(level.quantity) * Number(level.average_cost) + Number(quantity) * Number(unitCost)) / newQty;
    await client.query(
      'UPDATE stock_levels SET quantity = $1, average_cost = $2, updated_at = NOW() WHERE id = $3',
      [newQty, newAvgCost, level.id]
    );
  }

  return movement;
}

/**
 * Issue stock out of a warehouse. For batch-tracked products, consumes
 * batches FIFO by expiry date (soonest-expiring first), falling back to
 * received date, unless a specific batchId is provided.
 * Returns the list of movement rows created (may be >1 for FIFO across batches).
 */
async function issueStock(client, {
  companyId, userId, productId, warehouseId, quantity, batchId,
  movementType = 'stock_out', referenceType, referenceId, reason, notes,
}) {
  if (quantity <= 0) throw new ApiError(400, 'Quantity must be greater than zero');
  const product = await getProduct(client, companyId, productId);
  const movements = [];

  // Only relevant to the non-batch-tracked path below — going "negative" on
  // a specific physical batch has no real-world meaning, so batch-tracked
  // issues stay hard-blocked at insufficient stock regardless of this
  // company setting (see 051_inventory_settings.sql's header note).
  const settings = await inventorySettingsService.getSettings(client, companyId);
  const allowNegativeStock = settings.allow_negative_stock;

  if (product.is_batch_tracked) {
    let batches;
    if (batchId) {
      const { rows } = await client.query(
        'SELECT * FROM stock_batches WHERE id = $1 AND product_id = $2 AND warehouse_id = $3 FOR UPDATE',
        [batchId, productId, warehouseId]
      );
      if (!rows.length) throw new ApiError(404, 'Batch not found');
      batches = rows;
    } else {
      const { rows } = await client.query(
        `SELECT * FROM stock_batches
         WHERE product_id = $1 AND warehouse_id = $2 AND quantity_remaining > 0
         ORDER BY expiry_date ASC NULLS LAST, received_date ASC
         FOR UPDATE`,
        [productId, warehouseId]
      );
      batches = rows;
    }

    const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity_remaining), 0);
    if (totalAvailable < quantity) {
      throw new ApiError(400, `Insufficient stock: ${totalAvailable} available, ${quantity} requested`);
    }

    let remaining = Number(quantity);
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.quantity_remaining));
      if (take <= 0) continue;

      await client.query(
        'UPDATE stock_batches SET quantity_remaining = quantity_remaining - $1 WHERE id = $2',
        [take, b.id]
      );
      const movement = await insertMovement(client, {
        companyId, productId, warehouseId, batchId: b.id, movementType, quantity: take, unitCost: b.unit_cost,
        referenceType, referenceId, reason, notes, performedBy: userId,
      });
      movements.push(movement);
      remaining -= take;
    }

    await recalcFromBatches(client, productId, warehouseId);
  } else {
    const level = await getOrCreateStockLevel(client, productId, warehouseId);
    if (Number(level.quantity) < quantity && !allowNegativeStock) {
      throw new ApiError(400, `Insufficient stock: ${level.quantity} available, ${quantity} requested`);
    }
    const movement = await insertMovement(client, {
      companyId, productId, warehouseId, batchId: null, movementType, quantity, unitCost: level.average_cost,
      referenceType, referenceId, reason, notes, performedBy: userId,
    });
    movements.push(movement);
    await client.query(
      'UPDATE stock_levels SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
      [quantity, level.id]
    );
  }

  return movements;
}

module.exports = {
  getProduct,
  getOrCreateStockLevel,
  getOrCreateBin,
  recalcFromBatches,
  receiveStock,
  issueStock,
};
