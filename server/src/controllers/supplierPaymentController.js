const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const currencyService = require('../services/currencyService');
const { recordAudit } = require('../middleware/auditLog');

const listPayments = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sp.*, s.name AS supplier_name
     FROM supplier_payments sp JOIN suppliers s ON s.id = sp.supplier_id
     WHERE sp.company_id = $1 ORDER BY sp.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

async function refreshInvoiceStatus(client, invoiceId) {
  const { rows } = await client.query('SELECT * FROM purchase_invoices WHERE id = $1', [invoiceId]);
  const inv = rows[0];
  const settled = Number(inv.amount_paid) + Number(inv.amount_credited);
  let status = inv.status;
  if (status !== 'void') {
    if (settled >= Number(inv.total_amount)) status = 'paid';
    else if (settled > 0) status = 'partially_paid';
    else status = 'issued';
  }
  await client.query('UPDATE purchase_invoices SET status = $1, updated_at = NOW() WHERE id = $2', [status, invoiceId]);
}

// POST /supplier-payments  { supplierId, amount, paymentMethod, reference, notes, currency?, exchangeRate?, allocations?: [{ purchaseInvoiceId, amount }] }
// `amount` and each allocation's `amount` are in the payment's own currency. Allocations
// can only be made against invoices in that SAME currency, mirroring the customer side.
const createPayment = asyncHandler(async (req, res) => {
  const { supplierId, amount, paymentMethod, reference, notes, currency, exchangeRate, allocations } = req.body;
  if (!supplierId || !amount || !paymentMethod) throw new ApiError(400, 'supplierId, amount, and paymentMethod are required');

  const allocatedTotal = (allocations || []).reduce((sum, a) => sum + Number(a.amount), 0);
  if (allocatedTotal > Number(amount)) throw new ApiError(400, 'Allocated amount cannot exceed the payment amount');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const companyResult = await client.query('SELECT base_currency FROM companies WHERE id = $1', [req.user.companyId]);
    const baseCurrency = companyResult.rows[0]?.base_currency || 'GHS';
    const supplierResult = await client.query('SELECT currency FROM suppliers WHERE id = $1 AND company_id = $2', [supplierId, req.user.companyId]);
    if (!supplierResult.rows.length) throw new ApiError(404, 'Supplier not found');

    const paymentDate = new Date().toISOString().slice(0, 10);
    const payCurrency = currency || supplierResult.rows[0].currency || baseCurrency;
    const payRate = payCurrency === baseCurrency
      ? 1
      : Number(exchangeRate) || await currencyService.getRate(client, req.user.companyId, payCurrency, baseCurrency, paymentDate);

    const paymentNo = await salesService.generateDocNo(client, req.user.companyId, 'SPMT');
    const paymentResult = await client.query(
      `INSERT INTO supplier_payments (company_id, supplier_id, payment_no, amount, unallocated_amount, payment_method, reference, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.companyId, supplierId, paymentNo, amount, Number(amount) - allocatedTotal, paymentMethod, reference || null, notes || null, req.user.id, payCurrency, payRate]
    );
    const payment = paymentResult.rows[0];

    // AP was booked (at invoice time) in base currency using each invoice's OWN rate —
    // clearing it must use that same rate. Any difference from what was actually paid
    // (at today's rate) is real FX gain/loss.
    let apClearBase = 0;

    for (const alloc of allocations || []) {
      const invResult = await client.query('SELECT * FROM purchase_invoices WHERE id = $1 AND supplier_id = $2 FOR UPDATE', [alloc.purchaseInvoiceId, supplierId]);
      if (!invResult.rows.length) throw new ApiError(404, `Invoice ${alloc.purchaseInvoiceId} not found for this supplier`);
      const invoice = invResult.rows[0];
      if (invoice.currency !== payCurrency) {
        throw new ApiError(400, `Invoice ${invoice.invoice_no} is in ${invoice.currency}; this payment is in ${payCurrency}. Record a separate payment in ${invoice.currency}.`);
      }
      const balance = Number(invoice.total_amount) - Number(invoice.amount_paid) - Number(invoice.amount_credited);
      if (Number(alloc.amount) > balance + 0.01) {
        throw new ApiError(400, `Cannot allocate ${payCurrency} ${alloc.amount} to invoice ${invoice.invoice_no}: balance is only ${payCurrency} ${balance.toFixed(2)}`);
      }

      await client.query('INSERT INTO supplier_payment_allocations (payment_id, purchase_invoice_id, amount_allocated) VALUES ($1,$2,$3)', [payment.id, alloc.purchaseInvoiceId, alloc.amount]);
      await client.query('UPDATE purchase_invoices SET amount_paid = amount_paid + $1 WHERE id = $2', [alloc.amount, alloc.purchaseInvoiceId]);
      await refreshInvoiceStatus(client, alloc.purchaseInvoiceId);
      apClearBase += Number(alloc.amount) * Number(invoice.exchange_rate);
    }

    // Auto-post to the General Ledger if the chart of accounts is set up.
    // Mirror of the customer receipt: Dr Accounts Payable (at each invoice's OWN rate) / Cr
    // Cash (full amount, at today's rate) / Dr or Cr FX Gain or Loss for the difference.
    // Any unallocated portion still debits AP as a prepayment, valued at today's rate since
    // there's no prior AP booking to match it against yet.
    const unallocatedPortion = Number(amount) - allocatedTotal;
    const cashBase = Math.round(Number(amount) * payRate * 100) / 100;
    const prepaymentBase = Math.round(unallocatedPortion * payRate * 100) / 100;
    apClearBase = Math.round(apClearBase * 100) / 100;
    const apTotalBase = Math.round((apClearBase + prepaymentBase) * 100) / 100;

    if (cashBase > 0 && await accountingService.hasAllMappings(client, req.user.companyId, ['accounts_payable', 'cash_default'])) {
      const apAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'accounts_payable');
      const cashAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'cash_default');
      const glLines = [
        { accountId: apAccount, debit: apTotalBase, credit: 0, description: `Supplier payment ${paymentNo}` },
        { accountId: cashAccount, debit: 0, credit: cashBase, description: `Supplier payment ${paymentNo}` },
      ];

      const fxDelta = Math.round((cashBase - apTotalBase) * 100) / 100;
      if (Math.abs(fxDelta) > 0.01 && await accountingService.hasAllMappings(client, req.user.companyId, fxDelta > 0 ? ['fx_loss'] : ['fx_gain'])) {
        // Paying MORE base currency than the AP being cleared is worth is a LOSS (the
        // opposite sign convention from the customer side, since this is a payable, not a receivable).
        if (fxDelta > 0) {
          const fxLossAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'fx_loss');
          glLines.push({ accountId: fxLossAccount, debit: fxDelta, credit: 0, description: `FX loss on payment ${paymentNo}` });
        } else {
          const fxGainAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'fx_gain');
          glLines.push({ accountId: fxGainAccount, debit: 0, credit: -fxDelta, description: `FX gain on payment ${paymentNo}` });
        }
      }

      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: payment.payment_date,
        referenceType: 'supplier_payment', referenceId: payment.id, description: `Supplier payment ${paymentNo}`, lines: glLines,
        currency: payCurrency !== baseCurrency ? payCurrency : null, exchangeRate: payCurrency !== baseCurrency ? payRate : null,
        foreignTotal: payCurrency !== baseCurrency ? Number(amount) : null,
      });
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'supplier_payment', entityId: payment.id, newValues: { paymentNo, amount }, ip: req.ip });
    res.status(201).json(payment);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /supplier-payments/:id/allocate  { purchaseInvoiceId, amount }
const allocatePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { purchaseInvoiceId, amount } = req.body;
  if (!purchaseInvoiceId || !amount) throw new ApiError(400, 'purchaseInvoiceId and amount are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const paymentResult = await client.query('SELECT * FROM supplier_payments WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!paymentResult.rows.length) throw new ApiError(404, 'Payment not found');
    const payment = paymentResult.rows[0];
    if (Number(amount) > Number(payment.unallocated_amount) + 0.01) {
      throw new ApiError(400, `Only GHS ${payment.unallocated_amount} is unallocated on this payment`);
    }

    const invResult = await client.query('SELECT * FROM purchase_invoices WHERE id = $1 AND supplier_id = $2 FOR UPDATE', [purchaseInvoiceId, payment.supplier_id]);
    if (!invResult.rows.length) throw new ApiError(404, 'Invoice not found for this supplier');
    const invoice = invResult.rows[0];
    const balance = Number(invoice.total_amount) - Number(invoice.amount_paid) - Number(invoice.amount_credited);
    if (Number(amount) > balance + 0.01) throw new ApiError(400, `Invoice balance is only GHS ${balance.toFixed(2)}`);

    await client.query('INSERT INTO supplier_payment_allocations (payment_id, purchase_invoice_id, amount_allocated) VALUES ($1,$2,$3)', [id, purchaseInvoiceId, amount]);
    await client.query('UPDATE supplier_payments SET unallocated_amount = unallocated_amount - $1 WHERE id = $2', [amount, id]);
    await client.query('UPDATE purchase_invoices SET amount_paid = amount_paid + $1 WHERE id = $2', [amount, purchaseInvoiceId]);
    await refreshInvoiceStatus(client, purchaseInvoiceId);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'supplier_payment', entityId: id, newValues: { purchaseInvoiceId, amount }, ip: req.ip });
    res.json({ message: 'Payment allocated' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listPayments, createPayment, allocatePayment };
