const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const stockService = require('../services/stockService');
const accountingService = require('../services/accountingService');
const currencyService = require('../services/currencyService');
const { recordAudit } = require('../middleware/auditLog');

const listReturns = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sr.*, c.name AS customer_name, w.name AS warehouse_name, si.invoice_no
     FROM sales_returns sr
     JOIN customers c ON c.id = sr.customer_id
     JOIN warehouses w ON w.id = sr.warehouse_id
     LEFT JOIN sales_invoices si ON si.id = sr.sales_invoice_id
     WHERE sr.company_id = $1 ORDER BY sr.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /returns  { customerId, salesInvoiceId?, warehouseId, reason, lines: [{ productId, quantity, unitPrice, taxPercent, batchNo?, expiryDate? }] }
const createReturn = asyncHandler(async (req, res) => {
  const { customerId, salesInvoiceId, warehouseId, reason, lines } = req.body;
  if (!customerId || !warehouseId || !reason) throw new ApiError(400, 'customerId, warehouseId, and reason are required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // A return against a specific invoice must reverse it at EXACTLY that invoice's own
    // rate — this isn't a new cash event, so there's no FX gain/loss to realize here, just
    // an undo. A standalone return (no invoice reference) falls back to the customer's
    // default currency, like other new documents.
    const companyResult = await client.query('SELECT base_currency FROM companies WHERE id = $1', [req.user.companyId]);
    const baseCurrency = companyResult.rows[0]?.base_currency || 'GHS';

    let docCurrency; let rate;
    if (salesInvoiceId) {
      const srcInvoice = await client.query('SELECT currency, exchange_rate FROM sales_invoices WHERE id = $1 AND company_id = $2', [salesInvoiceId, req.user.companyId]);
      if (!srcInvoice.rows.length) throw new ApiError(404, 'Referenced invoice not found');
      docCurrency = srcInvoice.rows[0].currency;
      rate = Number(srcInvoice.rows[0].exchange_rate);
    } else {
      const customerResult = await client.query('SELECT currency FROM customers WHERE id = $1 AND company_id = $2', [customerId, req.user.companyId]);
      docCurrency = customerResult.rows[0]?.currency || baseCurrency;
      rate = docCurrency === baseCurrency ? 1 : await currencyService.getRate(client, req.user.companyId, docCurrency, baseCurrency, new Date().toISOString().slice(0, 10));
    }

    const totals = salesService.calcHeaderTotals(lines.map((l) => ({ ...l, discountPercent: 0 })));
    const returnNo = await salesService.generateDocNo(client, req.user.companyId, 'SR');
    const returnResult = await client.query(
      `INSERT INTO sales_returns (company_id, customer_id, sales_invoice_id, warehouse_id, return_no, reason, subtotal, tax_amount, total_amount, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.companyId, customerId, salesInvoiceId || null, warehouseId, returnNo, reason, totals.subtotal, totals.taxAmount, totals.totalAmount, req.user.id, docCurrency, rate]
    );
    const salesReturn = returnResult.rows[0];
    let cogsReversal = 0;

    for (const line of lines) {
      const calc = salesService.calcLine({ ...line, discountPercent: 0 });
      await client.query(
        `INSERT INTO sales_return_lines (sales_return_id, product_id, quantity, unit_price, tax_percent, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [salesReturn.id, line.productId, line.quantity, line.unitPrice, line.taxPercent || 0, calc.lineTotal]
      );

      // Cost basis for restocking + the COGS reversal: the product's current weighted-average
      // cost, NOT the price the customer was charged. Using the sale price here would corrupt
      // the inventory valuation (a discounted or marked-up sale would permanently skew the
      // average cost) and would leave COGS unreversed since there'd be nothing to tie it to.
      const level = await stockService.getOrCreateStockLevel(client, line.productId, warehouseId);
      const costBasis = Number(level.average_cost) || Number(line.unitPrice);

      await stockService.receiveStock(client, {
        companyId: req.user.companyId, userId: req.user.id, productId: line.productId, warehouseId,
        quantity: Number(line.quantity), unitCost: costBasis, batchNo: line.batchNo, expiryDate: line.expiryDate,
        movementType: 'sales_return', referenceType: 'sales_return', referenceId: salesReturn.id,
        reason: `Sales return ${returnNo}: ${reason}`,
      });
      cogsReversal += Number(line.quantity) * costBasis;
    }

    // Auto-generate a credit note for the full return value.
    const creditNoteNo = await salesService.generateDocNo(client, req.user.companyId, 'CN');
    const creditNoteResult = await client.query(
      `INSERT INTO credit_notes (company_id, customer_id, sales_return_id, sales_invoice_id, credit_note_no, amount, unapplied_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8) RETURNING *`,
      [req.user.companyId, customerId, salesReturn.id, salesInvoiceId || null, creditNoteNo, totals.totalAmount, `Return ${returnNo}`, req.user.id]
    );

    // Auto-post to the General Ledger if the chart of accounts is set up:
    // reverses the original sale — Dr Sales Revenue, Dr VAT Payable, Cr Accounts Receivable.
    // Converted to base currency at the SAME rate the original invoice used (or the current
    // rate for a standalone return), so this is an exact undo, not a new FX event.
    const requiredMappings = totals.taxAmount > 0
      ? ['accounts_receivable', 'sales_revenue', 'vat_payable']
      : ['accounts_receivable', 'sales_revenue'];
    if (await accountingService.hasAllMappings(client, req.user.companyId, requiredMappings)) {
      const arAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'accounts_receivable');
      const revenueAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'sales_revenue');
      const arBase = Math.round(totals.totalAmount * rate * 100) / 100;
      const glLines = [{ accountId: arAccount, debit: 0, credit: arBase, description: `Return ${returnNo}`, customerId }];

      if (totals.taxAmount > 0) {
        const vatAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'vat_payable');
        const revenueBase = Math.round(totals.subtotal * rate * 100) / 100;
        const vatBase = Math.round((arBase - revenueBase) * 100) / 100; // plug, mirrors invoiceController
        glLines.push({ accountId: revenueAccount, debit: revenueBase, credit: 0, description: `Return ${returnNo}`, customerId });
        glLines.push({ accountId: vatAccount, debit: vatBase, credit: 0, description: `VAT reversal on return ${returnNo}`, customerId });
      } else {
        glLines.push({ accountId: revenueAccount, debit: arBase, credit: 0, description: `Return ${returnNo}`, customerId });
      }

      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: salesReturn.return_date,
        referenceType: 'sales_return', referenceId: salesReturn.id, description: `Sales return ${returnNo}`, lines: glLines,
        currency: docCurrency !== baseCurrency ? docCurrency : null, exchangeRate: docCurrency !== baseCurrency ? rate : null,
        foreignTotal: docCurrency !== baseCurrency ? totals.totalAmount : null,
      });
    }

    // Reverses the COGS side of the original sale — Dr Inventory / Cr COGS — at the same
    // cost basis the goods were just restocked at above, so the ledger and physical stock agree.
    if (cogsReversal > 0 && await accountingService.hasAllMappings(client, req.user.companyId, ['cogs', 'inventory_asset'])) {
      const cogsAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'cogs');
      const inventoryAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'inventory_asset');
      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: salesReturn.return_date,
        referenceType: 'sales_return', referenceId: salesReturn.id, description: `COGS reversal for return ${returnNo}`,
        lines: [
          { accountId: inventoryAccount, debit: cogsReversal, credit: 0, description: `COGS reversal ${returnNo}` },
          { accountId: cogsAccount, debit: 0, credit: cogsReversal, description: `COGS reversal ${returnNo}` },
        ],
      });
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'sales_return', entityId: salesReturn.id, newValues: { returnNo }, ip: req.ip });
    res.status(201).json({ ...salesReturn, creditNote: creditNoteResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ---------- Credit notes ----------

const listCreditNotes = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT cn.*, c.name AS customer_name, si.invoice_no
     FROM credit_notes cn
     JOIN customers c ON c.id = cn.customer_id
     LEFT JOIN sales_invoices si ON si.id = cn.sales_invoice_id
     WHERE cn.company_id = $1 ORDER BY cn.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /credit-notes/:id/apply  { salesInvoiceId, amount }
const applyCreditNote = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { salesInvoiceId, amount } = req.body;
  if (!salesInvoiceId || !amount) throw new ApiError(400, 'salesInvoiceId and amount are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const cnResult = await client.query(
      `SELECT cn.*, sr.currency AS return_currency FROM credit_notes cn
       LEFT JOIN sales_returns sr ON sr.id = cn.sales_return_id
       WHERE cn.id = $1 AND cn.company_id = $2 FOR UPDATE`,
      [id, req.user.companyId]
    );
    if (!cnResult.rows.length) throw new ApiError(404, 'Credit note not found');
    const creditNote = cnResult.rows[0];
    if (Number(amount) > Number(creditNote.unapplied_amount) + 0.01) {
      throw new ApiError(400, `Only ${creditNote.return_currency || ''} ${creditNote.unapplied_amount} remains unapplied on this credit note`);
    }

    const invResult = await client.query('SELECT * FROM sales_invoices WHERE id = $1 AND customer_id = $2 FOR UPDATE', [salesInvoiceId, creditNote.customer_id]);
    if (!invResult.rows.length) throw new ApiError(404, 'Invoice not found for this customer');
    const invoice = invResult.rows[0];
    if (creditNote.return_currency && invoice.currency !== creditNote.return_currency) {
      throw new ApiError(400, `This credit note is in ${creditNote.return_currency}; invoice ${invoice.invoice_no} is in ${invoice.currency}.`);
    }
    const balance = Number(invoice.total_amount) - Number(invoice.amount_paid) - Number(invoice.amount_credited);
    if (Number(amount) > balance + 0.01) throw new ApiError(400, `Invoice balance is only ${invoice.currency} ${balance.toFixed(2)}`);

    const newUnapplied = Number(creditNote.unapplied_amount) - Number(amount);
    await client.query(
      'UPDATE credit_notes SET unapplied_amount = $1, status = $2 WHERE id = $3',
      [newUnapplied, newUnapplied <= 0.01 ? 'applied' : 'open', id]
    );
    await client.query('UPDATE sales_invoices SET amount_credited = amount_credited + $1 WHERE id = $2', [amount, salesInvoiceId]);

    const updatedInvoice = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [salesInvoiceId]);
    const inv = updatedInvoice.rows[0];
    const settled = Number(inv.amount_paid) + Number(inv.amount_credited);
    const status = settled >= Number(inv.total_amount) ? 'paid' : settled > 0 ? 'partially_paid' : inv.status;
    await client.query('UPDATE sales_invoices SET status = $1, updated_at = NOW() WHERE id = $2', [status, salesInvoiceId]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'credit_note', entityId: id, newValues: { salesInvoiceId, amount }, ip: req.ip });
    res.json({ message: 'Credit note applied' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listReturns, createReturn, listCreditNotes, applyCreditNote };
