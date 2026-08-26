const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const currencyService = require('../services/currencyService');
const { recordAudit } = require('../middleware/auditLog');

const listQuotations = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT q.*, c.name AS customer_name
     FROM quotations q JOIN customers c ON c.id = q.customer_id
     WHERE q.company_id = $1 ORDER BY q.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getQuotation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT q.*, c.name AS customer_name, c.email AS customer_email
     FROM quotations q JOIN customers c ON c.id = q.customer_id
     WHERE q.id = $1 AND q.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Quotation not found');

  const lines = await db.query(
    `SELECT ql.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol
     FROM quotation_lines ql JOIN products p ON p.id = ql.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE ql.quotation_id = $1`,
    [id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

// POST /quotations  { customerId, validUntil, notes, lines: [{ productId, description, quantity, unitPrice, discountPercent, taxPercent }] }
const createQuotation = asyncHandler(async (req, res) => {
  const { customerId, validUntil, notes, lines, currency, exchangeRate } = req.body;
  if (!customerId) throw new ApiError(400, 'customerId is required');
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

    const quotationNo = await salesService.generateDocNo(client, req.user.companyId, 'QUO');
    const headerResult = await client.query(
      `INSERT INTO quotations (company_id, customer_id, quotation_no, valid_until, subtotal, discount_amount, tax_amount, total_amount, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.companyId, customerId, quotationNo, validUntil || null, totals.subtotal, totals.discountAmount, totals.taxAmount, totals.totalAmount, notes || null, req.user.id, docCurrency, rate]
    );
    const quotation = headerResult.rows[0];

    for (const line of lines) {
      const calc = salesService.calcLine(line);
      await client.query(
        `INSERT INTO quotation_lines (quotation_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [quotation.id, line.productId, line.description || null, line.quantity, line.unitPrice, line.discountPercent || 0, line.taxPercent || 0, calc.lineTotal]
      );
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'quotation', entityId: quotation.id, newValues: { quotationNo }, ip: req.ip });
    res.status(201).json(quotation);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /quotations/:id/status  { status: 'sent'|'accepted'|'rejected'|'expired' }
const updateQuotationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['draft', 'sent', 'accepted', 'rejected', 'expired'].includes(status)) {
    throw new ApiError(400, 'Invalid status');
  }

  const { rows } = await db.query(
    `UPDATE quotations SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 AND status != 'converted' RETURNING *`,
    [status, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Quotation not found or already converted to a sales order');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'quotation', entityId: id, newValues: { status }, ip: req.ip });
  res.json(rows[0]);
});

// POST /quotations/:id/convert  { warehouseId } — creates a Sales Order from an accepted quotation
const convertToSalesOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { warehouseId } = req.body;
  if (!warehouseId) throw new ApiError(400, 'warehouseId is required to fulfil the order');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const quotationResult = await client.query(
      `SELECT * FROM quotations WHERE id = $1 AND company_id = $2 AND status != 'converted' FOR UPDATE`,
      [id, req.user.companyId]
    );
    if (!quotationResult.rows.length) throw new ApiError(404, 'Quotation not found or already converted');
    const quotation = quotationResult.rows[0];

    const linesResult = await client.query('SELECT * FROM quotation_lines WHERE quotation_id = $1', [id]);

    const orderNo = await salesService.generateDocNo(client, req.user.companyId, 'SO');
    const orderResult = await client.query(
      `INSERT INTO sales_orders (company_id, customer_id, quotation_id, warehouse_id, order_no, subtotal, discount_amount, tax_amount, total_amount, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.companyId, quotation.customer_id, quotation.id, warehouseId, orderNo, quotation.subtotal, quotation.discount_amount, quotation.tax_amount, quotation.total_amount, quotation.notes, req.user.id, quotation.currency, quotation.exchange_rate]
    );
    const order = orderResult.rows[0];

    for (const line of linesResult.rows) {
      await client.query(
        `INSERT INTO sales_order_lines (sales_order_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, line.product_id, line.description, line.quantity, line.unit_price, line.discount_percent, line.tax_percent, line.line_total]
      );
    }

    await client.query(`UPDATE quotations SET status = 'converted', updated_at = NOW() WHERE id = $1`, [id]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'sales_order', entityId: order.id, newValues: { fromQuotation: id }, ip: req.ip });
    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listQuotations, getQuotation, createQuotation, updateQuotationStatus, convertToSalesOrder };
