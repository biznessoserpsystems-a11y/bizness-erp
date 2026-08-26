const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const currencyService = require('../services/currencyService');
const { recordAudit } = require('../middleware/auditLog');

const listInvoices = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT pi.*, s.name AS supplier_name,
            (pi.total_amount - pi.amount_paid - pi.amount_credited) AS balance_due
     FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.company_id = $1 ORDER BY pi.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT pi.*, s.name AS supplier_name,
            (pi.total_amount - pi.amount_paid - pi.amount_credited) AS balance_due
     FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.id = $1 AND pi.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Invoice not found');

  const lines = await db.query(
    `SELECT pil.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol
     FROM purchase_invoice_lines pil JOIN products p ON p.id = pil.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE pil.purchase_invoice_id = $1`,
    [id]
  );

  const allocations = await db.query(
    `SELECT spa.*, sp.payment_no, sp.payment_date, sp.payment_method
     FROM supplier_payment_allocations spa JOIN supplier_payments sp ON sp.id = spa.payment_id
     WHERE spa.purchase_invoice_id = $1`,
    [id]
  );

  res.json({ ...header.rows[0], lines: lines.rows, payments: allocations.rows });
});

// POST /purchase-invoices  { supplierId, purchaseOrderId?, supplierInvoiceNo, notes, lines }
const createInvoice = asyncHandler(async (req, res) => {
  const { supplierId, purchaseOrderId, supplierInvoiceNo, notes, lines, currency, exchangeRate } = req.body;
  if (!supplierId) throw new ApiError(400, 'supplierId is required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const supplierResult = await client.query('SELECT * FROM suppliers WHERE id = $1 AND company_id = $2', [supplierId, req.user.companyId]);
    if (!supplierResult.rows.length) throw new ApiError(404, 'Supplier not found');
    const supplier = supplierResult.rows[0];

    const companyResult = await client.query('SELECT base_currency FROM companies WHERE id = $1', [req.user.companyId]);
    const baseCurrency = companyResult.rows[0]?.base_currency || 'GHS';

    // Inherits the linked PO's exact currency/rate (so it clears GRNI at the same rate it
    // was booked at); a fully standalone invoice resolves its own via supplier default -> base.
    let docCurrency; let rate;
    if (purchaseOrderId) {
      const poResult = await client.query('SELECT currency, exchange_rate FROM purchase_orders WHERE id = $1 AND company_id = $2', [purchaseOrderId, req.user.companyId]);
      if (!poResult.rows.length) throw new ApiError(404, 'Referenced purchase order not found');
      docCurrency = poResult.rows[0].currency;
      rate = Number(poResult.rows[0].exchange_rate);
    } else {
      docCurrency = currency || supplier.currency || baseCurrency;
      rate = docCurrency === baseCurrency
        ? 1
        : Number(exchangeRate) || await currencyService.getRate(client, req.user.companyId, docCurrency, baseCurrency, new Date().toISOString().slice(0, 10));
    }

    const totals = salesService.calcHeaderTotals(lines);
    const invoiceNo = await salesService.generateDocNo(client, req.user.companyId, 'PINV');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (supplier.payment_terms_days || 0));

    const invoiceResult = await client.query(
      `INSERT INTO purchase_invoices
         (company_id, supplier_id, purchase_order_id, invoice_no, supplier_invoice_no, due_date,
          subtotal, discount_amount, tax_amount, total_amount, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [req.user.companyId, supplierId, purchaseOrderId || null, invoiceNo, supplierInvoiceNo || null, dueDate,
        totals.subtotal, totals.discountAmount, totals.taxAmount, totals.totalAmount, notes || null, req.user.id, docCurrency, rate]
    );
    const invoice = invoiceResult.rows[0];

    // Lines tied to a PO line were already received via a GRN, which already debited
    // Inventory and credited GRNI Clearing for that value (see grnController). Those lines
    // clear GRNI here instead of re-debiting Inventory. Lines with no PO line (a fully
    // standalone invoice, never received through the GRN flow) still debit Inventory directly.
    let grniPortion = 0;
    let inventoryPortion = 0;

    for (const line of lines) {
      const calc = salesService.calcLine(line);
      const netAmount = calc.lineSubtotal - calc.discountAmount;
      if (line.purchaseOrderLineId) grniPortion += netAmount;
      else inventoryPortion += netAmount;

      await client.query(
        `INSERT INTO purchase_invoice_lines (purchase_invoice_id, purchase_order_line_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [invoice.id, line.purchaseOrderLineId || null, line.productId, line.description || null, line.quantity, line.unitPrice, line.discountPercent || 0, line.taxPercent || 0, calc.lineTotal]
      );

      if (line.purchaseOrderLineId) {
        await client.query(
          'UPDATE purchase_order_lines SET invoiced_quantity = invoiced_quantity + $1 WHERE id = $2',
          [line.quantity, line.purchaseOrderLineId]
        );
      }
    }

    if (purchaseOrderId) {
      const allLines = await client.query('SELECT quantity, invoiced_quantity FROM purchase_order_lines WHERE purchase_order_id = $1', [purchaseOrderId]);
      const fullyInvoiced = allLines.rows.every((l) => Number(l.invoiced_quantity) >= Number(l.quantity));
      if (fullyInvoiced) {
        await client.query(`UPDATE purchase_orders SET status = 'invoiced', updated_at = NOW() WHERE id = $1`, [purchaseOrderId]);
      }
    }

    // Soft credit-limit check: informational only, doesn't block the invoice — mirrors the
    // customer side in invoiceController.
    const outstandingResult = await client.query(
      `SELECT COALESCE(SUM(total_amount - amount_paid - amount_credited), 0) AS outstanding
       FROM purchase_invoices WHERE supplier_id = $1 AND status NOT IN ('paid', 'void')`,
      [supplierId]
    );
    const outstanding = Number(outstandingResult.rows[0].outstanding);
    const overLimit = supplier.credit_limit > 0 && outstanding > Number(supplier.credit_limit);

    // Auto-post to the General Ledger if the chart of accounts is set up.
    // Dr GRNI Clearing (for PO-linked lines already received via GRN) / Dr Inventory (for
    // standalone lines never received through GRN) / Dr Input VAT (tax) / Cr Accounts Payable (total).
    // All amounts convert to base currency using this invoice's rate — which, for a PO-linked
    // invoice, is exactly the rate the GRN booked GRNI at, so that clearing entry matches
    // to the cent with no FX difference to plug.
    const apBase = Math.round(totals.totalAmount * rate * 100) / 100;
    let grniBase = grniPortion > 0 ? Math.round(grniPortion * rate * 100) / 100 : 0;
    let inventoryBase = inventoryPortion > 0 ? Math.round(inventoryPortion * rate * 100) / 100 : 0;
    let vatBase;
    if (totals.taxAmount > 0) {
      vatBase = Math.round((apBase - grniBase - inventoryBase) * 100) / 100; // plug
    } else {
      vatBase = 0;
      // No tax, so grni + inventory must equal apBase exactly — plug whichever is present.
      if (inventoryPortion > 0) inventoryBase = Math.round((apBase - grniBase) * 100) / 100;
      else grniBase = apBase;
    }

    const requiredMappings = ['accounts_payable'];
    if (grniBase > 0) requiredMappings.push('grni_clearing');
    if (inventoryBase > 0) requiredMappings.push('inventory_asset');
    if (vatBase > 0) requiredMappings.push('vat_input');

    if (await accountingService.hasAllMappings(client, req.user.companyId, requiredMappings)) {
      const apAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'accounts_payable');
      const glLines = [];
      if (grniBase > 0) {
        const grniAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'grni_clearing');
        glLines.push({ accountId: grniAccount, debit: grniBase, credit: 0, description: `Clear GRNI on ${invoiceNo}` });
      }
      if (inventoryBase > 0) {
        const inventoryAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'inventory_asset');
        glLines.push({ accountId: inventoryAccount, debit: inventoryBase, credit: 0, description: `Purchase invoice ${invoiceNo}` });
      }
      if (vatBase > 0) {
        const vatInputAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'vat_input');
        glLines.push({ accountId: vatInputAccount, debit: vatBase, credit: 0, description: `Input VAT on ${invoiceNo}` });
      }
      glLines.push({ accountId: apAccount, debit: 0, credit: apBase, description: `Purchase invoice ${invoiceNo}` });

      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: invoice.invoice_date,
        referenceType: 'purchase_invoice', referenceId: invoice.id, description: `Purchase invoice ${invoiceNo}`, lines: glLines,
        currency: docCurrency !== baseCurrency ? docCurrency : null, exchangeRate: docCurrency !== baseCurrency ? rate : null,
        foreignTotal: docCurrency !== baseCurrency ? totals.totalAmount : null,
      });
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'purchase_invoice', entityId: invoice.id, newValues: { invoiceNo }, ip: req.ip });
    res.status(201).json({ ...invoice, creditWarning: overLimit ? `Supplier is now ${baseCurrency} ${(outstanding - supplier.credit_limit).toFixed(2)} over their credit limit` : null });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /purchase-invoices/:id/void
const voidInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `UPDATE purchase_invoices SET status = 'void', updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND amount_paid = 0 RETURNING *`,
    [id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(400, 'Invoice not found, or it has payments applied and cannot be voided directly');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'purchase_invoice', entityId: id, newValues: { status: 'void' }, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listInvoices, getInvoice, createInvoice, voidInvoice };
