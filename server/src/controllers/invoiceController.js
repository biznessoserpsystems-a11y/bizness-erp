const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const currencyService = require('../services/currencyService');
const { recordAudit } = require('../middleware/auditLog');

const listInvoices = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT si.*, c.name AS customer_name,
            (si.total_amount - si.amount_paid - si.amount_credited) AS balance_due
     FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
     WHERE si.company_id = $1 ORDER BY si.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT si.*, c.name AS customer_name, c.email AS customer_email, c.address AS customer_address,
            (si.total_amount - si.amount_paid - si.amount_credited) AS balance_due
     FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
     WHERE si.id = $1 AND si.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Invoice not found');

  const lines = await db.query(
    `SELECT sil.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol
     FROM sales_invoice_lines sil JOIN products p ON p.id = sil.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE sil.sales_invoice_id = $1`,
    [id]
  );

  const allocations = await db.query(
    `SELECT pa.*, cp.payment_no, cp.payment_date, cp.payment_method
     FROM payment_allocations pa JOIN customer_payments cp ON cp.id = pa.payment_id
     WHERE pa.sales_invoice_id = $1`,
    [id]
  );

  res.json({ ...header.rows[0], lines: lines.rows, payments: allocations.rows });
});

// POST /invoices  { customerId, salesOrderId?, notes, lines: [...] }
// If salesOrderId is provided, lines should reference salesOrderLineId to track invoiced_quantity.
const createInvoice = asyncHandler(async (req, res) => {
  const { customerId, salesOrderId, notes, lines, currency, exchangeRate } = req.body;
  if (!customerId) throw new ApiError(400, 'customerId is required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await generateInvoice(client, {
      companyId: req.user.companyId, userId: req.user.id,
      customerId, salesOrderId, notes, lines, currency, exchangeRate,
    });
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'sales_invoice', entityId: result.invoice.id, newValues: { invoiceNo: result.invoice.invoice_no }, ip: req.ip });
    res.status(201).json({ ...result.invoice, creditWarning: result.creditWarning });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * Core invoice-generation logic, shared by the manual "create invoice" endpoint
 * and the recurring-invoice generator (recurringInvoiceController.js) so both
 * paths post the exact same GL entries, currency handling, and credit-limit
 * check rather than maintaining two copies that could drift apart. Caller is
 * responsible for the transaction (BEGIN/COMMIT/ROLLBACK) around this.
 */
async function generateInvoice(client, { companyId, userId, customerId, salesOrderId, notes, lines, currency, exchangeRate }) {
    const customerResult = await client.query('SELECT * FROM customers WHERE id = $1 AND company_id = $2', [customerId, companyId]);
    if (!customerResult.rows.length) throw new ApiError(404, 'Customer not found');
    const customer = customerResult.rows[0];

    const companyResult = await client.query('SELECT base_currency FROM companies WHERE id = $1', [companyId]);
    const baseCurrency = companyResult.rows[0]?.base_currency || 'GHS';

    const totals = salesService.calcHeaderTotals(lines);
    const invoiceNo = await salesService.generateDocNo(client, companyId, 'INV');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (customer.payment_terms_days || 0));
    const invoiceDate = new Date().toISOString().slice(0, 10);

    // Currency defaults to the customer's own default, then the company's base currency —
    // unless this invoice is against a confirmed sales order, in which case it inherits
    // that order's exact currency and rate rather than re-resolving against today's rate.
    let docCurrency; let rate;
    if (salesOrderId) {
      const orderResult = await client.query('SELECT currency, exchange_rate FROM sales_orders WHERE id = $1 AND company_id = $2', [salesOrderId, companyId]);
      if (!orderResult.rows.length) throw new ApiError(404, 'Referenced sales order not found');
      docCurrency = orderResult.rows[0].currency;
      rate = Number(orderResult.rows[0].exchange_rate);
    } else {
      docCurrency = currency || customer.currency || baseCurrency;
      rate = docCurrency === baseCurrency
        ? 1
        : Number(exchangeRate) || await currencyService.getRate(client, companyId, docCurrency, baseCurrency, invoiceDate);
    }

    const invoiceResult = await client.query(
      `INSERT INTO sales_invoices (company_id, customer_id, sales_order_id, invoice_no, due_date, subtotal, discount_amount, tax_amount, total_amount, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [companyId, customerId, salesOrderId || null, invoiceNo, dueDate, totals.subtotal, totals.discountAmount, totals.taxAmount, totals.totalAmount, notes || null, userId, docCurrency, rate]
    );
    const invoice = invoiceResult.rows[0];

    for (const line of lines) {
      const calc = salesService.calcLine(line);
      await client.query(
        `INSERT INTO sales_invoice_lines (sales_invoice_id, sales_order_line_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [invoice.id, line.salesOrderLineId || null, line.productId, line.description || null, line.quantity, line.unitPrice, line.discountPercent || 0, line.taxPercent || 0, calc.lineTotal]
      );

      if (line.salesOrderLineId) {
        await client.query(
          'UPDATE sales_order_lines SET invoiced_quantity = invoiced_quantity + $1 WHERE id = $2',
          [line.quantity, line.salesOrderLineId]
        );
      }
    }

    if (salesOrderId) {
      const allLines = await client.query('SELECT quantity, invoiced_quantity FROM sales_order_lines WHERE sales_order_id = $1', [salesOrderId]);
      const fullyInvoiced = allLines.rows.every((l) => Number(l.invoiced_quantity) >= Number(l.quantity));
      if (fullyInvoiced) {
        await client.query(`UPDATE sales_orders SET status = 'invoiced', updated_at = NOW() WHERE id = $1`, [salesOrderId]);
      }
    }

    // Soft credit-limit check: informational only, doesn't block the invoice.
    const outstandingResult = await client.query(
      `SELECT COALESCE(SUM(total_amount - amount_paid - amount_credited), 0) AS outstanding
       FROM sales_invoices WHERE customer_id = $1 AND status NOT IN ('paid', 'void')`,
      [customerId]
    );
    const outstanding = Number(outstandingResult.rows[0].outstanding);
    const overLimit = customer.credit_limit > 0 && outstanding > Number(customer.credit_limit);

    // Auto-post to the General Ledger if the chart of accounts is set up.
    // Dr Accounts Receivable (total) / Cr Sales Revenue (net of discount) / Cr VAT Payable (tax).
    // All three GL amounts are in the company's BASE currency — converted using this
    // invoice's exchange_rate — even though the invoice itself is denominated in docCurrency.
    // The VAT (or revenue, if no VAT) line is a plug: computed as whatever's left after AR
    // and the other line, so the entry balances exactly regardless of rounding in the
    // rate conversion rather than three independently-rounded amounts drifting apart.
    const requiredMappings = totals.taxAmount > 0
      ? ['accounts_receivable', 'sales_revenue', 'vat_payable']
      : ['accounts_receivable', 'sales_revenue'];
    if (await accountingService.hasAllMappings(client, companyId, requiredMappings)) {
      const arAccount = await accountingService.getMappedAccountId(client, companyId, 'accounts_receivable');
      const revenueAccount = await accountingService.getMappedAccountId(client, companyId, 'sales_revenue');
      const arBase = Math.round(totals.totalAmount * rate * 100) / 100;
      const glLines = [{ accountId: arAccount, debit: arBase, credit: 0, description: `Invoice ${invoiceNo}`, customerId }];

      if (totals.taxAmount > 0) {
        const vatAccount = await accountingService.getMappedAccountId(client, companyId, 'vat_payable');
        const revenueBase = Math.round((totals.subtotal - totals.discountAmount) * rate * 100) / 100;
        const vatBase = Math.round((arBase - revenueBase) * 100) / 100; // plug
        glLines.push({ accountId: revenueAccount, debit: 0, credit: revenueBase, description: `Invoice ${invoiceNo}`, customerId });
        glLines.push({ accountId: vatAccount, debit: 0, credit: vatBase, description: `VAT on invoice ${invoiceNo}`, customerId });
      } else {
        glLines.push({ accountId: revenueAccount, debit: 0, credit: arBase, description: `Invoice ${invoiceNo}`, customerId });
      }

      await accountingService.postJournalEntry(client, {
        companyId, userId, entryDate: invoice.invoice_date,
        referenceType: 'sales_invoice', referenceId: invoice.id, description: `Sales invoice ${invoiceNo}`, lines: glLines,
        currency: docCurrency !== baseCurrency ? docCurrency : null, exchangeRate: docCurrency !== baseCurrency ? rate : null,
        foreignTotal: docCurrency !== baseCurrency ? totals.totalAmount : null,
      });
    }

  return {
    invoice,
    creditWarning: overLimit ? `Customer is now ${baseCurrency} ${(outstanding - customer.credit_limit).toFixed(2)} over their credit limit` : null,
  };
}

// PATCH /invoices/:id/void
const voidInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `UPDATE sales_invoices SET status = 'void', updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND amount_paid = 0 RETURNING *`,
    [id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(400, 'Invoice not found, or it has payments applied and cannot be voided directly');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'sales_invoice', entityId: id, newValues: { status: 'void' }, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listInvoices, getInvoice, createInvoice, voidInvoice, generateInvoice };
