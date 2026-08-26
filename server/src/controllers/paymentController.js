const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const currencyService = require('../services/currencyService');
const { recordAudit } = require('../middleware/auditLog');

const listPayments = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT cp.*, c.name AS customer_name
     FROM customer_payments cp JOIN customers c ON c.id = cp.customer_id
     WHERE cp.company_id = $1 ORDER BY cp.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

async function refreshInvoiceStatus(client, invoiceId) {
  const { rows } = await client.query('SELECT * FROM sales_invoices WHERE id = $1', [invoiceId]);
  const inv = rows[0];
  const settled = Number(inv.amount_paid) + Number(inv.amount_credited);
  let status = inv.status;
  if (status !== 'void') {
    if (settled >= Number(inv.total_amount)) status = 'paid';
    else if (settled > 0) status = 'partially_paid';
    else status = 'issued';
  }
  await client.query('UPDATE sales_invoices SET status = $1, updated_at = NOW() WHERE id = $2', [status, invoiceId]);
}

// POST /payments  { customerId, amount, paymentMethod, reference, notes, currency?, exchangeRate?, allocations?: [{ salesInvoiceId, amount }] }
// `amount` and each allocation's `amount` are in the payment's own currency. Allocations
// can only be made against invoices in that SAME currency — settling a foreign-currency
// invoice with a different-currency receipt would need its own conversion step, which
// isn't modeled here (see README).
const createPayment = asyncHandler(async (req, res) => {
  const { customerId, amount, paymentMethod, reference, notes, currency, exchangeRate, allocations } = req.body;
  if (!customerId || !amount || !paymentMethod) throw new ApiError(400, 'customerId, amount, and paymentMethod are required');

  const allocatedTotal = (allocations || []).reduce((sum, a) => sum + Number(a.amount), 0);
  if (allocatedTotal > Number(amount)) throw new ApiError(400, 'Allocated amount cannot exceed the payment amount');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const companyResult = await client.query('SELECT base_currency FROM companies WHERE id = $1', [req.user.companyId]);
    const baseCurrency = companyResult.rows[0]?.base_currency || 'GHS';
    const customerResult = await client.query('SELECT currency FROM customers WHERE id = $1 AND company_id = $2', [customerId, req.user.companyId]);
    if (!customerResult.rows.length) throw new ApiError(404, 'Customer not found');

    const paymentDate = new Date().toISOString().slice(0, 10);
    const payCurrency = currency || customerResult.rows[0].currency || baseCurrency;
    const payRate = payCurrency === baseCurrency
      ? 1
      : Number(exchangeRate) || await currencyService.getRate(client, req.user.companyId, payCurrency, baseCurrency, paymentDate);

    const paymentNo = await salesService.generateDocNo(client, req.user.companyId, 'RCT');
    const paymentResult = await client.query(
      `INSERT INTO customer_payments (company_id, customer_id, payment_no, amount, unallocated_amount, payment_method, reference, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.companyId, customerId, paymentNo, amount, Number(amount) - allocatedTotal, paymentMethod, reference || null, notes || null, req.user.id, payCurrency, payRate]
    );
    const payment = paymentResult.rows[0];

    // AR was booked (at invoice time) in base currency using each invoice's OWN exchange
    // rate — clearing it must use that same rate, not today's, or the ledger would silently
    // create or destroy value. arClearBase accumulates that "clear at original rate" total;
    // any difference from what was actually collected (at today's rate) is real FX gain/loss.
    let arClearBase = 0;

    for (const alloc of allocations || []) {
      const invResult = await client.query('SELECT * FROM sales_invoices WHERE id = $1 AND customer_id = $2 FOR UPDATE', [alloc.salesInvoiceId, customerId]);
      if (!invResult.rows.length) throw new ApiError(404, `Invoice ${alloc.salesInvoiceId} not found for this customer`);
      const invoice = invResult.rows[0];
      if (invoice.currency !== payCurrency) {
        throw new ApiError(400, `Invoice ${invoice.invoice_no} is in ${invoice.currency}; this payment is in ${payCurrency}. Record a separate payment in ${invoice.currency}.`);
      }
      const balance = Number(invoice.total_amount) - Number(invoice.amount_paid) - Number(invoice.amount_credited);
      if (Number(alloc.amount) > balance + 0.01) {
        throw new ApiError(400, `Cannot allocate ${payCurrency} ${alloc.amount} to invoice ${invoice.invoice_no}: balance is only ${payCurrency} ${balance.toFixed(2)}`);
      }

      await client.query('INSERT INTO payment_allocations (payment_id, sales_invoice_id, amount_allocated) VALUES ($1,$2,$3)', [payment.id, alloc.salesInvoiceId, alloc.amount]);
      await client.query('UPDATE sales_invoices SET amount_paid = amount_paid + $1 WHERE id = $2', [alloc.amount, alloc.salesInvoiceId]);
      await refreshInvoiceStatus(client, alloc.salesInvoiceId);
      arClearBase += Number(alloc.amount) * Number(invoice.exchange_rate);
    }

    // Auto-post to the General Ledger if the chart of accounts is set up.
    // Dr Cash (full amount, at today's rate) / Cr Accounts Receivable (at each invoice's
    // OWN rate) / Cr Customer Advances (unallocated leftover, at today's rate) / Dr or Cr
    // FX Gain or FX Loss for whatever the rate difference works out to, so the entry
    // always balances exactly without silently absorbing the difference into Cash or AR.
    const unallocatedPortion = Number(amount) - allocatedTotal;
    const cashBase = Math.round(Number(amount) * payRate * 100) / 100;
    const advancesBase = Math.round(unallocatedPortion * payRate * 100) / 100;
    arClearBase = Math.round(arClearBase * 100) / 100;

    const requiredMappings = [];
    if (cashBase > 0) requiredMappings.push('cash_default');
    if (arClearBase > 0) requiredMappings.push('accounts_receivable');
    if (advancesBase > 0.01) requiredMappings.push('customer_advances');

    if (requiredMappings.length && await accountingService.hasAllMappings(client, req.user.companyId, requiredMappings)) {
      const glLines = [];
      if (cashBase > 0) {
        const cashAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'cash_default');
        glLines.push({ accountId: cashAccount, debit: cashBase, credit: 0, description: `Receipt ${paymentNo}`, customerId });
      }
      if (arClearBase > 0) {
        const arAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'accounts_receivable');
        glLines.push({ accountId: arAccount, debit: 0, credit: arClearBase, description: `Receipt ${paymentNo}`, customerId });
      }
      if (advancesBase > 0.01) {
        const advancesAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'customer_advances');
        glLines.push({ accountId: advancesAccount, debit: 0, credit: advancesBase, description: `Unapplied receipt ${paymentNo}`, customerId });
      }

      const fxDelta = Math.round((cashBase - arClearBase - advancesBase) * 100) / 100;
      if (Math.abs(fxDelta) > 0.01 && await accountingService.hasAllMappings(client, req.user.companyId, fxDelta > 0 ? ['fx_gain'] : ['fx_loss'])) {
        if (fxDelta > 0) {
          const fxGainAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'fx_gain');
          glLines.push({ accountId: fxGainAccount, debit: 0, credit: fxDelta, description: `FX gain on receipt ${paymentNo}` });
        } else {
          const fxLossAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'fx_loss');
          glLines.push({ accountId: fxLossAccount, debit: -fxDelta, credit: 0, description: `FX loss on receipt ${paymentNo}` });
        }
      }

      if (glLines.length >= 2) {
        await accountingService.postJournalEntry(client, {
          companyId: req.user.companyId, userId: req.user.id, entryDate: payment.payment_date,
          referenceType: 'customer_payment', referenceId: payment.id, description: `Customer payment ${paymentNo}`, lines: glLines,
          currency: payCurrency !== baseCurrency ? payCurrency : null, exchangeRate: payCurrency !== baseCurrency ? payRate : null,
          foreignTotal: payCurrency !== baseCurrency ? Number(amount) : null,
        });
      }
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'customer_payment', entityId: payment.id, newValues: { paymentNo, amount }, ip: req.ip });
    res.status(201).json(payment);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /payments/:id/allocate  { salesInvoiceId, amount } — apply previously unallocated funds to an invoice
const allocatePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { salesInvoiceId, amount } = req.body;
  if (!salesInvoiceId || !amount) throw new ApiError(400, 'salesInvoiceId and amount are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const paymentResult = await client.query('SELECT * FROM customer_payments WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!paymentResult.rows.length) throw new ApiError(404, 'Payment not found');
    const payment = paymentResult.rows[0];
    if (Number(amount) > Number(payment.unallocated_amount) + 0.01) {
      throw new ApiError(400, `Only ${payment.currency} ${payment.unallocated_amount} is unallocated on this payment`);
    }

    const invResult = await client.query('SELECT * FROM sales_invoices WHERE id = $1 AND customer_id = $2 FOR UPDATE', [salesInvoiceId, payment.customer_id]);
    if (!invResult.rows.length) throw new ApiError(404, 'Invoice not found for this customer');
    const invoice = invResult.rows[0];
    if (invoice.currency !== payment.currency) {
      throw new ApiError(400, `Invoice ${invoice.invoice_no} is in ${invoice.currency}; this payment's unallocated balance is in ${payment.currency}.`);
    }
    const balance = Number(invoice.total_amount) - Number(invoice.amount_paid) - Number(invoice.amount_credited);
    if (Number(amount) > balance + 0.01) throw new ApiError(400, `Invoice balance is only ${invoice.currency} ${balance.toFixed(2)}`);

    await client.query('INSERT INTO payment_allocations (payment_id, sales_invoice_id, amount_allocated) VALUES ($1,$2,$3)', [id, salesInvoiceId, amount]);
    await client.query('UPDATE customer_payments SET unallocated_amount = unallocated_amount - $1 WHERE id = $2', [amount, id]);
    await client.query('UPDATE sales_invoices SET amount_paid = amount_paid + $1 WHERE id = $2', [amount, salesInvoiceId]);
    await refreshInvoiceStatus(client, salesInvoiceId);

    // This reallocates previously unapplied cash (booked into Customer Advances at the
    // payment's own rate) into a reduction of Accounts Receivable (cleared at the
    // INVOICE's own rate) — no new cash movement, but the two rates can differ, so this
    // can still realize an FX gain/loss even though no money changes hands today.
    const advancesBase = Math.round(Number(amount) * Number(payment.exchange_rate) * 100) / 100;
    const arClearBase = Math.round(Number(amount) * Number(invoice.exchange_rate) * 100) / 100;
    const fxDelta = Math.round((advancesBase - arClearBase) * 100) / 100;

    if (await accountingService.hasAllMappings(client, req.user.companyId, ['customer_advances', 'accounts_receivable'])) {
      const advancesAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'customer_advances');
      const arAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'accounts_receivable');
      const glLines = [
        { accountId: advancesAccount, debit: advancesBase, credit: 0, description: 'Apply unallocated credit', customerId: payment.customer_id },
        { accountId: arAccount, debit: 0, credit: arClearBase, description: 'Apply unallocated credit', customerId: payment.customer_id },
      ];

      if (Math.abs(fxDelta) > 0.01 && await accountingService.hasAllMappings(client, req.user.companyId, fxDelta > 0 ? ['fx_gain'] : ['fx_loss'])) {
        if (fxDelta > 0) {
          const fxGainAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'fx_gain');
          glLines.push({ accountId: fxGainAccount, debit: 0, credit: fxDelta, description: `FX gain applying payment ${payment.payment_no}` });
        } else {
          const fxLossAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'fx_loss');
          glLines.push({ accountId: fxLossAccount, debit: -fxDelta, credit: 0, description: `FX loss applying payment ${payment.payment_no}` });
        }
      }

      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
        referenceType: 'customer_payment', referenceId: id, description: `Apply payment ${payment.payment_no} to invoice`, lines: glLines,
      });
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'customer_payment', entityId: id, newValues: { salesInvoiceId, amount }, ip: req.ip });
    res.json({ message: 'Payment allocated' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listPayments, createPayment, allocatePayment };
