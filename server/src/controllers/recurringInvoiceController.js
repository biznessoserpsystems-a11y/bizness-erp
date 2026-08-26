const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { runTemplate } = require('../services/recurringInvoiceService');

const listTemplates = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT rit.*, c.name AS customer_name,
            (SELECT count(*) FROM sales_invoices WHERE recurring_template_id = rit.id) AS invoices_generated
     FROM recurring_invoice_templates rit JOIN customers c ON c.id = rit.customer_id
     WHERE rit.company_id = $1 ORDER BY rit.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT rit.*, c.name AS customer_name
     FROM recurring_invoice_templates rit JOIN customers c ON c.id = rit.customer_id
     WHERE rit.id = $1 AND rit.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Recurring invoice template not found');

  const lines = await db.query(
    `SELECT ril.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol
     FROM recurring_invoice_lines ril JOIN products p ON p.id = ril.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE ril.template_id = $1`,
    [id]
  );

  const invoices = await db.query(
    `SELECT id, invoice_no, invoice_date, total_amount, status FROM sales_invoices
     WHERE recurring_template_id = $1 ORDER BY invoice_date DESC`,
    [id]
  );

  res.json({ ...header.rows[0], lines: lines.rows, generatedInvoices: invoices.rows });
});

// POST /recurring-invoices { customerId, templateName, frequency, startDate, endDate?, currency?, notes, lines }
const createTemplate = asyncHandler(async (req, res) => {
  const { customerId, templateName, frequency, startDate, endDate, currency, notes, lines } = req.body;
  if (!customerId) throw new ApiError(400, 'customerId is required');
  if (!templateName) throw new ApiError(400, 'templateName is required');
  if (!startDate) throw new ApiError(400, 'startDate is required');
  if (!['weekly', 'monthly', 'quarterly', 'annually'].includes(frequency)) {
    throw new ApiError(400, 'frequency must be one of weekly, monthly, quarterly, annually');
  }
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const customerResult = await client.query('SELECT id FROM customers WHERE id = $1 AND company_id = $2', [customerId, req.user.companyId]);
    if (!customerResult.rows.length) throw new ApiError(404, 'Customer not found');

    const result = await client.query(
      `INSERT INTO recurring_invoice_templates
         (company_id, customer_id, template_name, frequency, start_date, next_run_date, end_date, currency, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.companyId, customerId, templateName, frequency, startDate, endDate || null, currency || null, notes || null, req.user.id]
    );
    const template = result.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO recurring_invoice_lines (template_id, product_id, description, quantity, unit_price, discount_percent, tax_percent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [template.id, line.productId, line.description || null, line.quantity, line.unitPrice, line.discountPercent || 0, line.taxPercent || 0]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(template);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /recurring-invoices/:id/status { status: 'active' | 'paused' | 'ended' }
const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'paused', 'ended'].includes(status)) throw new ApiError(400, 'Invalid status');

  const { rows } = await db.query(
    `UPDATE recurring_invoice_templates SET status = $1, updated_at = NOW()
     WHERE id = $2 AND company_id = $3 RETURNING *`,
    [status, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Recurring invoice template not found');
  res.json(rows[0]);
});

// POST /recurring-invoices/:id/run-now — manual trigger, e.g. to generate this cycle's
// invoice a few days early. Uses the exact same generation path as the scheduler.
const runNow = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT * FROM recurring_invoice_templates WHERE id = $1 AND company_id = $2`,
    [id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Recurring invoice template not found');
  if (rows[0].status !== 'active') throw new ApiError(400, 'Only active templates can be run');

  const invoice = await runTemplate(rows[0]);
  res.status(201).json(invoice);
});

module.exports = { listTemplates, getTemplate, createTemplate, updateStatus, runNow };
