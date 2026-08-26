const { receiveStock, issueStock, recalcFromBatches } = require('../stockService');

/**
 * A tiny in-memory fake of the Postgres tables stockService.js touches.
 * Rather than mocking each query's return value in isolation (which would
 * just re-encode my assumptions about the code, not test it), this actually
 * stores rows and answers each exact query the real code issues — so FIFO
 * ordering, weighted-average blending, and the stock_levels/stock_batches
 * aggregation are exercised for real, the same way they would be against
 * Postgres. Query strings are matched by exact text (after whitespace
 * normalization) against what stockService.js actually sends, so a typo'd
 * mock query fails loudly instead of silently matching the wrong branch.
 */
function createMockDb() {
  const state = {
    products: [],
    stockBatches: [],
    stockLevels: [],
    stockMovements: [],
  };
  let batchSeq = 0;
  let levelSeq = 0;
  let movementSeq = 0;
  let receivedDateSeq = 0; // simulates NOW() ordering across sequential inserts

  const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

  const query = jest.fn(async (sql, params = []) => {
    const s = norm(sql);

    if (s === 'SELECT * FROM products WHERE id = $1 AND company_id = $2') {
      const [id, companyId] = params;
      const row = state.products.find((p) => p.id === id && p.company_id === companyId);
      return { rows: row ? [row] : [] };
    }

    if (s === 'SELECT * FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2') {
      const [productId, warehouseId] = params;
      const row = state.stockLevels.find((l) => l.product_id === productId && l.warehouse_id === warehouseId);
      return { rows: row ? [row] : [] };
    }

    if (s === 'INSERT INTO stock_levels (product_id, warehouse_id, quantity, average_cost) VALUES ($1, $2, 0, 0) RETURNING *') {
      const [productId, warehouseId] = params;
      const row = { id: `level-${++levelSeq}`, product_id: productId, warehouse_id: warehouseId, quantity: 0, average_cost: 0 };
      state.stockLevels.push(row);
      return { rows: [row] };
    }

    if (s === 'SELECT COALESCE(SUM(quantity_remaining), 0) AS qty, CASE WHEN COALESCE(SUM(quantity_remaining), 0) = 0 THEN 0 ELSE SUM(quantity_remaining * unit_cost) / SUM(quantity_remaining) END AS avg_cost FROM stock_batches WHERE product_id = $1 AND warehouse_id = $2') {
      const [productId, warehouseId] = params;
      const batches = state.stockBatches.filter((b) => b.product_id === productId && b.warehouse_id === warehouseId);
      const qty = batches.reduce((sum, b) => sum + Number(b.quantity_remaining), 0);
      const avg_cost = qty === 0 ? 0 : batches.reduce((sum, b) => sum + Number(b.quantity_remaining) * Number(b.unit_cost), 0) / qty;
      return { rows: [{ qty, avg_cost }] };
    }

    if (s === 'UPDATE stock_levels SET quantity = $1, average_cost = $2, updated_at = NOW() WHERE product_id = $3 AND warehouse_id = $4') {
      const [qty, avgCost, productId, warehouseId] = params;
      const level = state.stockLevels.find((l) => l.product_id === productId && l.warehouse_id === warehouseId);
      level.quantity = qty;
      level.average_cost = avgCost;
      return { rows: [] };
    }

    if (s === 'INSERT INTO stock_movements (company_id, product_id, warehouse_id, batch_id, movement_type, quantity, unit_cost, total_cost, reference_type, reference_id, reason, notes, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *') {
      const row = {
        id: `mv-${++movementSeq}`,
        company_id: params[0], product_id: params[1], warehouse_id: params[2], batch_id: params[3],
        movement_type: params[4], quantity: params[5], unit_cost: params[6], total_cost: params[7],
        reference_type: params[8], reference_id: params[9], reason: params[10], notes: params[11], performed_by: params[12],
      };
      state.stockMovements.push(row);
      return { rows: [row] };
    }

    if (s === 'SELECT * FROM stock_batches WHERE product_id = $1 AND warehouse_id = $2 AND batch_no = $3') {
      const [productId, warehouseId, batchNo] = params;
      const row = state.stockBatches.find((b) => b.product_id === productId && b.warehouse_id === warehouseId && b.batch_no === batchNo);
      return { rows: row ? [row] : [] };
    }

    if (s === 'UPDATE stock_batches SET quantity_remaining = $1, quantity_received = $2, unit_cost = $3 WHERE id = $4') {
      const [qtyRemaining, qtyReceived, unitCost, id] = params;
      const b = state.stockBatches.find((x) => x.id === id);
      b.quantity_remaining = qtyRemaining;
      b.quantity_received = qtyReceived;
      b.unit_cost = unitCost;
      return { rows: [] };
    }

    if (s === 'INSERT INTO stock_batches (company_id, product_id, warehouse_id, batch_no, expiry_date, unit_cost, quantity_received, quantity_remaining) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id') {
      const [companyId, productId, warehouseId, batchNo, expiryDate, unitCost, quantity] = params;
      const row = {
        id: `batch-${++batchSeq}`,
        company_id: companyId, product_id: productId, warehouse_id: warehouseId,
        batch_no: batchNo, expiry_date: expiryDate, unit_cost: unitCost,
        quantity_received: quantity, quantity_remaining: quantity,
        received_date: ++receivedDateSeq, // monotonically increasing "timestamp"
      };
      state.stockBatches.push(row);
      return { rows: [{ id: row.id }] };
    }

    if (s === 'UPDATE stock_levels SET quantity = $1, average_cost = $2, updated_at = NOW() WHERE id = $3') {
      const [qty, avgCost, id] = params;
      const level = state.stockLevels.find((l) => l.id === id);
      level.quantity = qty;
      level.average_cost = avgCost;
      return { rows: [] };
    }

    if (s === 'SELECT * FROM stock_batches WHERE id = $1 AND product_id = $2 AND warehouse_id = $3 FOR UPDATE') {
      const [id, productId, warehouseId] = params;
      const row = state.stockBatches.find((b) => b.id === id && b.product_id === productId && b.warehouse_id === warehouseId);
      return { rows: row ? [row] : [] };
    }

    if (s === 'SELECT * FROM stock_batches WHERE product_id = $1 AND warehouse_id = $2 AND quantity_remaining > 0 ORDER BY expiry_date ASC NULLS LAST, received_date ASC FOR UPDATE') {
      const [productId, warehouseId] = params;
      const batches = state.stockBatches.filter((b) => b.product_id === productId && b.warehouse_id === warehouseId && Number(b.quantity_remaining) > 0);
      // Mirror "ORDER BY expiry_date ASC NULLS LAST, received_date ASC" exactly.
      batches.sort((a, b) => {
        if (a.expiry_date === null && b.expiry_date === null) return a.received_date - b.received_date;
        if (a.expiry_date === null) return 1;
        if (b.expiry_date === null) return -1;
        const cmp = new Date(a.expiry_date) - new Date(b.expiry_date);
        if (cmp !== 0) return cmp;
        return a.received_date - b.received_date;
      });
      return { rows: batches };
    }

    if (s === 'UPDATE stock_batches SET quantity_remaining = quantity_remaining - $1 WHERE id = $2') {
      const [take, id] = params;
      const b = state.stockBatches.find((x) => x.id === id);
      b.quantity_remaining = Number(b.quantity_remaining) - Number(take);
      return { rows: [] };
    }

    if (s === 'UPDATE stock_levels SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2') {
      const [qty, id] = params;
      const level = state.stockLevels.find((l) => l.id === id);
      level.quantity = Number(level.quantity) - Number(qty);
      return { rows: [] };
    }

    throw new Error(`Unmocked query in test: ${s}`);
  });

  return { query, state };
}

const COMPANY = 'co-1';
const PRODUCT_NONBATCH = 'prod-nonbatch';
const PRODUCT_BATCH = 'prod-batch';
const WAREHOUSE = 'wh-1';

function seedProducts(db) {
  db.state.products.push(
    { id: PRODUCT_NONBATCH, company_id: COMPANY, is_batch_tracked: false },
    { id: PRODUCT_BATCH, company_id: COMPANY, is_batch_tracked: true }
  );
}

describe('receiveStock — non-batch products', () => {
  test('rejects zero or negative quantity', async () => {
    const db = createMockDb();
    seedProducts(db);
    await expect(
      receiveStock(db, { companyId: COMPANY, productId: PRODUCT_NONBATCH, warehouseId: WAREHOUSE, quantity: 0, unitCost: 10 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('throws if the product does not exist for this company', async () => {
    const db = createMockDb();
    await expect(
      receiveStock(db, { companyId: COMPANY, productId: 'nonexistent', warehouseId: WAREHOUSE, quantity: 10, unitCost: 5 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('first receipt sets quantity and average cost directly', async () => {
    const db = createMockDb();
    seedProducts(db);
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_NONBATCH, warehouseId: WAREHOUSE, quantity: 100, unitCost: 10 });

    const level = db.state.stockLevels.find((l) => l.product_id === PRODUCT_NONBATCH);
    expect(level.quantity).toBe(100);
    expect(level.average_cost).toBe(10);
  });

  test('a second receipt blends the weighted-average cost', async () => {
    const db = createMockDb();
    seedProducts(db);
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_NONBATCH, warehouseId: WAREHOUSE, quantity: 100, unitCost: 10 });
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_NONBATCH, warehouseId: WAREHOUSE, quantity: 50, unitCost: 16 });

    // (100*10 + 50*16) / 150 = 12
    const level = db.state.stockLevels.find((l) => l.product_id === PRODUCT_NONBATCH);
    expect(level.quantity).toBe(150);
    expect(level.average_cost).toBe(12);
  });
});

describe('receiveStock — batch-tracked products', () => {
  test('requires a batchNo', async () => {
    const db = createMockDb();
    seedProducts(db);
    await expect(
      receiveStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 10, unitCost: 5 })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('batchNo') });
  });

  test('creates a new batch on first receipt', async () => {
    const db = createMockDb();
    seedProducts(db);
    await receiveStock(db, {
      companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE,
      quantity: 100, unitCost: 20, batchNo: 'B1', expiryDate: '2027-01-01',
    });

    const batch = db.state.stockBatches.find((b) => b.batch_no === 'B1');
    expect(batch.quantity_remaining).toBe(100);
    expect(batch.quantity_received).toBe(100);
    expect(batch.unit_cost).toBe(20);

    const level = db.state.stockLevels.find((l) => l.product_id === PRODUCT_BATCH);
    expect(level.quantity).toBe(100);
    expect(level.average_cost).toBe(20);
  });

  test('receiving into the same batch_no blends the unit cost of that batch only', async () => {
    const db = createMockDb();
    seedProducts(db);
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 100, unitCost: 20, batchNo: 'B1', expiryDate: '2027-01-01' });
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 50, unitCost: 26, batchNo: 'B1', expiryDate: '2027-01-01' });

    const batch = db.state.stockBatches.find((b) => b.batch_no === 'B1');
    // (100*20 + 50*26) / 150 = 22
    expect(batch.quantity_remaining).toBe(150);
    expect(batch.unit_cost).toBe(22);
  });

  test('recalcFromBatches aggregates quantity and weighted-average cost across multiple batches', async () => {
    const db = createMockDb();
    seedProducts(db);
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 100, unitCost: 20, batchNo: 'B1', expiryDate: '2027-01-01' });
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 50, unitCost: 30, batchNo: 'B2', expiryDate: '2027-06-01' });

    const level = db.state.stockLevels.find((l) => l.product_id === PRODUCT_BATCH);
    // (100*20 + 50*30) / 150 = 23.333...
    expect(level.quantity).toBe(150);
    expect(level.average_cost).toBeCloseTo(23.333, 2);
  });
});

describe('issueStock — non-batch products', () => {
  test('rejects insufficient stock', async () => {
    const db = createMockDb();
    seedProducts(db);
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_NONBATCH, warehouseId: WAREHOUSE, quantity: 10, unitCost: 5 });

    await expect(
      issueStock(db, { companyId: COMPANY, productId: PRODUCT_NONBATCH, warehouseId: WAREHOUSE, quantity: 20 })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Insufficient stock') });
  });

  test('deducts quantity at the current average cost', async () => {
    const db = createMockDb();
    seedProducts(db);
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_NONBATCH, warehouseId: WAREHOUSE, quantity: 100, unitCost: 10 });
    const [movement] = await issueStock(db, { companyId: COMPANY, productId: PRODUCT_NONBATCH, warehouseId: WAREHOUSE, quantity: 40 });

    expect(movement.unit_cost).toBe(10);
    const level = db.state.stockLevels.find((l) => l.product_id === PRODUCT_NONBATCH);
    expect(level.quantity).toBe(60);
  });
});

describe('issueStock — batch-tracked products (FIFO)', () => {
  async function seedTwoBatches(db, { expiryA, expiryB } = {}) {
    // B1 received first, B2 received second — but FIFO is by expiry date,
    // not receipt order, so tests can set expiries to prove that.
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 100, unitCost: 20, batchNo: 'B1', expiryDate: expiryA });
    await receiveStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 100, unitCost: 30, batchNo: 'B2', expiryDate: expiryB });
  }

  test('consumes the soonest-expiring batch first, even if it was received second', async () => {
    const db = createMockDb();
    seedProducts(db);
    // B1 expires later, B2 expires sooner — B2 should be consumed first.
    await seedTwoBatches(db, { expiryA: '2027-06-01', expiryB: '2027-01-01' });

    const movements = await issueStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 30 });

    expect(movements).toHaveLength(1);
    expect(movements[0].unit_cost).toBe(30); // B2's cost, proving B2 (sooner expiry) was picked
  });

  test('splits an issue across batches in expiry order when one batch is not enough', async () => {
    const db = createMockDb();
    seedProducts(db);
    await seedTwoBatches(db, { expiryA: '2027-06-01', expiryB: '2027-01-01' }); // B2 expires first

    const movements = await issueStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 150 });

    expect(movements).toHaveLength(2);
    expect(movements[0].quantity).toBe(100); // all of B2 (expires first) consumed first
    expect(movements[0].unit_cost).toBe(30);
    expect(movements[1].quantity).toBe(50);  // remainder from B1
    expect(movements[1].unit_cost).toBe(20);
  });

  test('batches with no expiry date sort after batches that have one (NULLS LAST)', async () => {
    const db = createMockDb();
    seedProducts(db);
    // B1 has no expiry; B2 does — B2 should still be consumed first despite
    // being received second, because a real expiry beats no expiry.
    await seedTwoBatches(db, { expiryA: undefined, expiryB: '2027-01-01' });

    const movements = await issueStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 30 });
    expect(movements[0].unit_cost).toBe(30); // B2, the one with a real expiry date
  });

  test('among batches with no expiry date, falls back to received-date order', async () => {
    const db = createMockDb();
    seedProducts(db);
    await seedTwoBatches(db); // neither batch given an expiry; B1 received first

    const movements = await issueStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 30 });
    expect(movements[0].unit_cost).toBe(20); // B1, received first
  });

  test('a specific batchId bypasses FIFO even if it is not the soonest to expire', async () => {
    const db = createMockDb();
    seedProducts(db);
    await seedTwoBatches(db, { expiryA: '2027-01-01', expiryB: '2027-06-01' }); // B1 would normally win FIFO

    const b2 = db.state.stockBatches.find((b) => b.batch_no === 'B2');
    const movements = await issueStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 10, batchId: b2.id });

    expect(movements).toHaveLength(1);
    expect(movements[0].unit_cost).toBe(30); // forced to B2 despite B1 expiring sooner
  });

  test('rejects an issue larger than total available stock across eligible batches', async () => {
    const db = createMockDb();
    seedProducts(db);
    await seedTwoBatches(db, { expiryA: '2027-01-01', expiryB: '2027-06-01' }); // 200 total

    await expect(
      issueStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 300 })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Insufficient stock') });
  });

  test('stock_levels reflects correct remaining quantity and weighted-average cost after a partial FIFO issue', async () => {
    const db = createMockDb();
    seedProducts(db);
    await seedTwoBatches(db, { expiryA: '2027-06-01', expiryB: '2027-01-01' }); // B2 (cost 30) consumed first

    await issueStock(db, { companyId: COMPANY, productId: PRODUCT_BATCH, warehouseId: WAREHOUSE, quantity: 120 }); // all 100 of B2 + 20 of B1

    const level = db.state.stockLevels.find((l) => l.product_id === PRODUCT_BATCH);
    // Remaining: B1 has 80 left at cost 20, B2 has 0 left.
    expect(level.quantity).toBe(80);
    expect(level.average_cost).toBe(20);
  });
});
