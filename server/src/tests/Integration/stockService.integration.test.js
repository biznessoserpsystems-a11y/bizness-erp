const { withRollback, closePool } = require('../../../testUtils/testDb');
const { receiveStock, issueStock, recalcFromBatches } = require('../../stockService');

async function seedCompany(client) {
  const { rows } = await client.query(
    "INSERT INTO companies (name) VALUES ('Integration Test Co') RETURNING id"
  );
  return rows[0].id;
}

async function seedWarehouse(client, companyId) {
  const { rows } = await client.query(
    'INSERT INTO warehouses (company_id, name, code) VALUES ($1, $2, $3) RETURNING id',
    [companyId, 'Main Warehouse', 'MAIN']
  );
  return rows[0].id;
}

async function seedProduct(client, companyId, { isBatchTracked = false, sku }) {
  const { rows } = await client.query(
    `INSERT INTO products (company_id, sku, name, is_batch_tracked)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [companyId, sku, `Test Product ${sku}`, isBatchTracked]
  );
  return rows[0].id;
}

afterAll(async () => {
  await closePool();
});

describe('stockService (integration, real Postgres)', () => {
  test('weighted-average blending on a non-batch product matches real NUMERIC arithmetic', async () => {
    await withRollback(async (client) => {
      const companyId = await seedCompany(client);
      const warehouseId = await seedWarehouse(client, companyId);
      const productId = await seedProduct(client, companyId, { sku: 'NB-1' });

      await receiveStock(client, { companyId, productId, warehouseId, quantity: 100, unitCost: 10 });
      await receiveStock(client, { companyId, productId, warehouseId, quantity: 50, unitCost: 16 });

      const { rows } = await client.query(
        'SELECT quantity, average_cost FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
        [productId, warehouseId]
      );
      expect(Number(rows[0].quantity)).toBe(150);
      expect(Number(rows[0].average_cost)).toBe(12); // (100*10 + 50*16) / 150
    });
  });

  test('rejects issuing more than is in stock, enforced by the service against real committed rows', async () => {
    await withRollback(async (client) => {
      const companyId = await seedCompany(client);
      const warehouseId = await seedWarehouse(client, companyId);
      const productId = await seedProduct(client, companyId, { sku: 'NB-2' });

      await receiveStock(client, { companyId, productId, warehouseId, quantity: 10, unitCost: 5 });

      await expect(
        issueStock(client, { companyId, productId, warehouseId, quantity: 20 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  test('FIFO consumes the soonest-expiring real row first, driven by an actual ORDER BY against Postgres', async () => {
    await withRollback(async (client) => {
      const companyId = await seedCompany(client);
      const warehouseId = await seedWarehouse(client, companyId);
      const productId = await seedProduct(client, companyId, { isBatchTracked: true, sku: 'B-1' });

      // B1 received first but expires later; B2 received second but expires sooner.
      await receiveStock(client, { companyId, productId, warehouseId, quantity: 100, unitCost: 20, batchNo: 'B1', expiryDate: '2027-06-01' });
      await receiveStock(client, { companyId, productId, warehouseId, quantity: 100, unitCost: 30, batchNo: 'B2', expiryDate: '2027-01-01' });

      const movements = await issueStock(client, { companyId, productId, warehouseId, quantity: 30 });
      expect(movements).toHaveLength(1);
      expect(Number(movements[0].unit_cost)).toBe(30); // B2, the sooner-expiring real row
    });
  });

  test('a batch with a real NULL expiry_date sorts after one with a date (NULLS LAST against actual Postgres)', async () => {
    await withRollback(async (client) => {
      const companyId = await seedCompany(client);
      const warehouseId = await seedWarehouse(client, companyId);
      const productId = await seedProduct(client, companyId, { isBatchTracked: true, sku: 'B-2' });

      // B1 has no expiry (real NULL column value); B2 has one.
      await receiveStock(client, { companyId, productId, warehouseId, quantity: 100, unitCost: 20, batchNo: 'B1' });
      await receiveStock(client, { companyId, productId, warehouseId, quantity: 100, unitCost: 30, batchNo: 'B2', expiryDate: '2027-01-01' });

      const movements = await issueStock(client, { companyId, productId, warehouseId, quantity: 10 });
      expect(Number(movements[0].unit_cost)).toBe(30); // B2, despite being received second
    });
  });

  test('splits an issue across real batch rows and leaves correct remaining quantities on disk', async () => {
    await withRollback(async (client) => {
      const companyId = await seedCompany(client);
      const warehouseId = await seedWarehouse(client, companyId);
      const productId = await seedProduct(client, companyId, { isBatchTracked: true, sku: 'B-3' });

      await receiveStock(client, { companyId, productId, warehouseId, quantity: 100, unitCost: 20, batchNo: 'B1', expiryDate: '2027-06-01' });
      await receiveStock(client, { companyId, productId, warehouseId, quantity: 100, unitCost: 30, batchNo: 'B2', expiryDate: '2027-01-01' });

      await issueStock(client, { companyId, productId, warehouseId, quantity: 120 }); // all of B2 + 20 of B1

      const { rows } = await client.query(
        'SELECT batch_no, quantity_remaining FROM stock_batches WHERE product_id = $1 ORDER BY batch_no',
        [productId]
      );
      const b1 = rows.find((r) => r.batch_no === 'B1');
      const b2 = rows.find((r) => r.batch_no === 'B2');
      expect(Number(b1.quantity_remaining)).toBe(80);
      expect(Number(b2.quantity_remaining)).toBe(0);

      const level = await client.query(
        'SELECT quantity, average_cost FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
        [productId, warehouseId]
      );
      expect(Number(level.rows[0].quantity)).toBe(80);
      expect(Number(level.rows[0].average_cost)).toBe(20);
    });
  });

  test('the unique (product_id, warehouse_id, batch_no) constraint is real — blending into the same batch never creates a duplicate row', async () => {
    await withRollback(async (client) => {
      const companyId = await seedCompany(client);
      const warehouseId = await seedWarehouse(client, companyId);
      const productId = await seedProduct(client, companyId, { isBatchTracked: true, sku: 'B-4' });

      await receiveStock(client, { companyId, productId, warehouseId, quantity: 100, unitCost: 20, batchNo: 'B1', expiryDate: '2027-01-01' });
      await receiveStock(client, { companyId, productId, warehouseId, quantity: 50, unitCost: 26, batchNo: 'B1', expiryDate: '2027-01-01' });

      const { rows } = await client.query(
        'SELECT quantity_remaining, unit_cost FROM stock_batches WHERE product_id = $1 AND batch_no = $2',
        [productId, 'B1']
      );
      expect(rows).toHaveLength(1); // still one row, not two
      expect(Number(rows[0].quantity_remaining)).toBe(150);
      expect(Number(rows[0].unit_cost)).toBe(22); // (100*20 + 50*26) / 150
    });
  });
});
