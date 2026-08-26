const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const currencyService = require('../services/currencyService');
const { recordAudit } = require('../middleware/auditLog');

const listSalesOrders = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT so.*, c.name AS customer_name, w.name AS warehouse_name
     FROM sales_orders so
     JOIN customers c ON c.id = so.customer_id
     JOIN warehouses w ON w.id = so.warehouse_id
     WHERE so.company_id = $1 ORDER BY so.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getSalesOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT so.*, c.name AS customer_name, c.credit_limit, w.name AS warehouse_name
     FROM sales_orders so
     JOIN customers c ON c.id = so.customer_id
     JOIN warehouses w ON w.id = so.warehouse_id
     WHERE so.id = $1 AND so.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Sales order not found');

  const lines = await db.query(
    `SELECT sol.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol, p.is_batch_tracked
     FROM sales_order_lines sol JOIN products p ON p.id = sol.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE sol.sales_order_id = $1`,
    [id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

// POST /sales-orders  (standalone, not from a quotation)
const createSalesOrder = asyncHandler(async (req, res) => {
  const { customerId, warehouseId, notes, lines, currency, exchangeRate } = req.body;
  if (!customerId || !warehouseId) throw new ApiError(400, 'customerId and warehouseId are required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const totals = salesService.calcHeaderTotals(lines);
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const companyResult = await client.query('SELECT base_currency FROM companies WHERE id = $1', [req.user.companyId]);
    const baseCurrency = companyResult.rows[0]?.base_currency || 'GHS';
    const customerResult = await client.query('SELECT currency FROM customers WHERE id = $1 AND company_id = $2', [customerId, req.user.companyId]);
    if (!customerResult.rows.length) throw new ApiError(404, 'Customer not found');

    const docCurrency = currency || customerResult.rows[0].currency || baseCurrency;
    const rate = docCurrency === baseCurrency
      ? 1
      : Number(exchangeRate) || await currencyService.getRate(client, req.user.companyId, docCurrency, baseCurrency, new Date().toISOString().slice(0, 10));

    const orderNo = await salesService.generateDocNo(client, req.user.companyId, 'SO');
    const orderResult = await client.query(
      `INSERT INTO sales_orders (company_id, customer_id, warehouse_id, order_no, subtotal, discount_amount, tax_amount, total_amount, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.companyId, customerId, warehouseId, orderNo, totals.subtotal, totals.discountAmount, totals.taxAmount, totals.totalAmount, notes || null, req.user.id, docCurrency, rate]
    );
    const order = orderResult.rows[0];

    for (const line of lines) {
      const calc = salesService.calcLine(line);
      await client.query(
        `INSERT INTO sales_order_lines (sales_order_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, line.productId, line.description || null, line.quantity, line.unitPrice, line.discountPercent || 0, line.taxPercent || 0, calc.lineTotal]
      );
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'sales_order', entityId: order.id, newValues: { orderNo }, ip: req.ip });
    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /sales-orders/:id/status  { status: 'confirmed'|'cancelled' }
const updateSalesOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['confirmed', 'cancelled'].includes(status)) throw new ApiError(400, 'status must be "confirmed" or "cancelled"');

  const { rows } = await db.query(
    `UPDATE sales_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING *`,
    [status, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Sales order not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'sales_order', entityId: id, newValues: { status }, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listSalesOrders, getSalesOrder, createSalesOrder, updateSalesOrderStatus };
