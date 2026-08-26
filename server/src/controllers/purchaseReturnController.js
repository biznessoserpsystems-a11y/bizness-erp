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
    `SELECT pr.*, s.name AS supplier_name, w.name AS warehouse_name, pi.invoice_no
     FROM purchase_returns pr
     JOIN suppliers s ON s.id = pr.supplier_id
     JOIN warehouses w ON w.id = pr.warehouse_id
     LEFT JOIN purchase_invoices pi ON pi.id = pr.purchase_invoice_id
     WHERE pr.company_id = $1 ORDER BY pr.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /purchase-returns  { supplierId, purchaseInvoiceId?, warehouseId, reason, lines: [{ productId, quantity, unitPrice, taxPercent, batchId? }] }
const createReturn = asyncHandler(async (req, res) => {
  const { supplierId, purchaseInvoiceId, warehouseId, reason, lines } = req.body;
  if (!supplierId || !warehouseId || !reason) throw new ApiError(400, 'supplierId, warehouseId, and reason are required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // A return against a specific invoice must reverse it at EXACTLY that invoice's own
    // rate — this isn't a new cash event, just an undo. A standalone return (no invoice
    // reference) falls back to the supplier's default currency, like other new documents.
    const companyResult = await client.query('SELECT base_currency FROM companies WHERE id = $1', [req.user.companyId]);
    const baseCurrency = companyResult.rows[0]?.base_currency || 'GHS';

    let docCurrency; let rate;
    if (purchaseInvoiceId) {
      const srcInvoice = await client.query('SELECT currency, exchange_rate FROM purchase_invoices WHERE id = $1 AND company_id = $2', [purchaseInvoiceId, req.user.companyId]);
      if (!srcInvoice.rows.length) throw new ApiError(404, 'Referenced invoice not found');
      docCurrency = srcInvoice.rows[0].currency;
      rate = Number(srcInvoice.rows[0].exchange_rate);
    } else {
      const supplierResult = await client.query('SELECT currency FROM suppliers WHERE id = $1 AND company_id = $2', [supplierId, req.user.companyId]);
      docCurrency = supplierResult.rows[0]?.currency || baseCurrency;
      rate = docCurrency === baseCurrency ? 1 : await currencyService.getRate(client, req.user.companyId, docCurrency, baseCurrency, new Date().toISOString().slice(0, 10));
    }

    const totals = salesService.calcHeaderTotals(lines.map((l) => ({ ...l, discountPercent: 0 })));
    const returnNo = await salesService.generateDocNo(client, req.user.companyId, 'PR-RET');
    const returnResult = await client.query(
      `INSERT INTO purchase_returns (company_id, supplier_id, purchase_invoice_id, warehouse_id, return_no, reason, subtotal, tax_amount, total_amount, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.companyId, supplierId, purchaseInvoiceId || null, warehouseId, returnNo, reason, totals.subtotal, totals.taxAmount, totals.totalAmount, req.user.id, docCurrency, rate]
    );
    const purchaseReturn = returnResult.rows[0];

    for (const line of lines) {
      const calc = salesService.calcLine({ ...line, discountPercent: 0 });
      await client.query(
        `INSERT INTO purchase_return_lines (purchase_return_id, product_id, quantity, unit_price, tax_percent, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [purchaseReturn.id, line.productId, line.quantity, line.unitPrice, line.taxPercent || 0, calc.lineTotal]
      );

      await stockService.issueStock(client, {
        companyId: req.user.companyId, userId: req.user.id, productId: line.productId, warehouseId,
        quantity: Number(line.quantity), batchId: line.batchId, movementType: 'purchase_return',
        referenceType: 'purchase_return', referenceId: purchaseReturn.id, reason: `Return to supplier ${returnNo}: ${reason}`,
      });
    }

    const debitNoteNo = await salesService.generateDocNo(client, req.user.companyId, 'DBN');
    const debitNoteResult = await client.query(
      `INSERT INTO debit_notes (company_id, supplier_id, purchase_return_id, purchase_invoice_id, debit_note_no, amount, unapplied_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8) RETURNING *`,
      [req.user.companyId, supplierId, purchaseReturn.id, purchaseInvoiceId || null, debitNoteNo, totals.totalAmount, `Return ${returnNo}`, req.user.id]
    );

    // Auto-post to the General Ledger if the chart of accounts is set up.
    // Reverses the original purchase — Dr Accounts Payable, Cr Inventory, Cr Input VAT (if any).
    // Converted to base currency at the SAME rate the original invoice used (or the current
    // rate for a standalone return), so this is an exact undo, not a new FX event.
    // The debit note above tracks the AP-side reduction (in document currency); this is its GL counterpart.
    const requiredMappings = totals.taxAmount > 0
      ? ['accounts_payable', 'inventory_asset', 'vat_input']
      : ['accounts_payable', 'inventory_asset'];
    if (await accountingService.hasAllMappings(client, req.user.companyId, requiredMappings)) {
      const apAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'accounts_payable');
      const inventoryAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'inventory_asset');
      const apBase = Math.round(totals.totalAmount * rate * 100) / 100;
      const glLines = [{ accountId: apAccount, debit: apBase, credit: 0, description: `Return ${returnNo}` }];

      if (totals.taxAmount > 0) {
        const vatInputAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'vat_input');
        const inventoryBase = Math.round(totals.subtotal * rate * 100) / 100;
        const vatBase = Math.round((apBase - inventoryBase) * 100) / 100; // plug, mirrors invoiceController
        glLines.push({ accountId: inventoryAccount, debit: 0, credit: inventoryBase, description: `Return ${returnNo}` });
        glLines.push({ accountId: vatInputAccount, debit: 0, credit: vatBase, description: `Input VAT reversal on return ${returnNo}` });
      } else {
        glLines.push({ accountId: inventoryAccount, debit: 0, credit: apBase, description: `Return ${returnNo}` });
      }

      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: purchaseReturn.return_date,
        referenceType: 'purchase_return', referenceId: purchaseReturn.id, description: `Purchase return ${returnNo}`, lines: glLines,
        currency: docCurrency !== baseCurrency ? docCurrency : null, exchangeRate: docCurrency !== baseCurrency ? rate : null,
        foreignTotal: docCurrency !== baseCurrency ? totals.totalAmount : null,
      });
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'purchase_return', entityId: purchaseReturn.id, newValues: { returnNo }, ip: req.ip });
    res.status(201).json({ ...purchaseReturn, debitNote: debitNoteResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const listDebitNotes = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT dn.*, s.name AS supplier_name, pi.invoice_no
     FROM debit_notes dn
     JOIN suppliers s ON s.id = dn.supplier_id
     LEFT JOIN purchase_invoices pi ON pi.id = dn.purchase_invoice_id
     WHERE dn.company_id = $1 ORDER BY dn.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /debit-notes/:id/apply  { purchaseInvoiceId, amount }
const applyDebitNote = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { purchaseInvoiceId, amount } = req.body;
  if (!purchaseInvoiceId || !amount) throw new ApiError(400, 'purchaseInvoiceId and amount are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const dnResult = await client.query(
      `SELECT dn.*, pr.currency AS return_currency FROM debit_notes dn
       LEFT JOIN purchase_returns pr ON pr.id = dn.purchase_return_id
       WHERE dn.id = $1 AND dn.company_id = $2 FOR UPDATE`,
      [id, req.user.companyId]
    );
    if (!dnResult.rows.length) throw new ApiError(404, 'Debit note not found');
    const debitNote = dnResult.rows[0];
    if (Number(amount) > Number(debitNote.unapplied_amount) + 0.01) {
      throw new ApiError(400, `Only ${debitNote.return_currency || ''} ${debitNote.unapplied_amount} remains unapplied on this debit note`);
    }

    const invResult = await client.query('SELECT * FROM purchase_invoices WHERE id = $1 AND supplier_id = $2 FOR UPDATE', [purchaseInvoiceId, debitNote.supplier_id]);
    if (!invResult.rows.length) throw new ApiError(404, 'Invoice not found for this supplier');
    const invoice = invResult.rows[0];
    if (debitNote.return_currency && invoice.currency !== debitNote.return_currency) {
      throw new ApiError(400, `This debit note is in ${debitNote.return_currency}; invoice ${invoice.invoice_no} is in ${invoice.currency}.`);
    }
    const balance = Number(invoice.total_amount) - Number(invoice.amount_paid) - Number(invoice.amount_credited);
    if (Number(amount) > balance + 0.01) throw new ApiError(400, `Invoice balance is only ${invoice.currency} ${balance.toFixed(2)}`);

    const newUnapplied = Number(debitNote.unapplied_amount) - Number(amount);
    await client.query(
      'UPDATE debit_notes SET unapplied_amount = $1, status = $2 WHERE id = $3',
      [newUnapplied, newUnapplied <= 0.01 ? 'applied' : 'open', id]
    );
    await client.query('UPDATE purchase_invoices SET amount_credited = amount_credited + $1 WHERE id = $2', [amount, purchaseInvoiceId]);

    const updatedInvoice = await client.query('SELECT * FROM purchase_invoices WHERE id = $1', [purchaseInvoiceId]);
    const inv = updatedInvoice.rows[0];
    const settled = Number(inv.amount_paid) + Number(inv.amount_credited);
    const status = settled >= Number(inv.total_amount) ? 'paid' : settled > 0 ? 'partially_paid' : inv.status;
    await client.query('UPDATE purchase_invoices SET status = $1, updated_at = NOW() WHERE id = $2', [status, purchaseInvoiceId]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'debit_note', entityId: id, newValues: { purchaseInvoiceId, amount }, ip: req.ip });
    res.json({ message: 'Debit note applied' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listReturns, createReturn, listDebitNotes, applyDebitNote };
