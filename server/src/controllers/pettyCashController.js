const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

const listPettyCashAccounts = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT pca.*, coa.account_name, coa.account_code, u.first_name, u.last_name,
            COALESCE((SELECT SUM(amount) FROM petty_cash_vouchers WHERE petty_cash_account_id = pca.id), 0) AS total_spent,
            COALESCE((SELECT SUM(amount) FROM petty_cash_receipts WHERE petty_cash_account_id = pca.id), 0) AS total_receipts
     FROM petty_cash_accounts pca
     JOIN chart_of_accounts coa ON coa.id = pca.account_id
     LEFT JOIN users u ON u.id = pca.custodian_user_id
     WHERE pca.company_id = $1 ORDER BY pca.name`,
    [req.user.companyId]
  );
  // Balance is a genuine receipts-and-payments running balance: the opening
  // float (float_amount, set once at account creation) plus every later
  // top-up receipt, minus every voucher paid out — not just a single
  // number decremented by spending, the way it worked before receipts
  // existed at all.
  res.json(rows.map((r) => ({ ...r, balance: Number(r.float_amount) + Number(r.total_receipts) - Number(r.total_spent) })));
});

const createPettyCashAccount = asyncHandler(async (req, res) => {
  const { accountId, name, custodianUserId, floatAmount } = req.body;
  if (!accountId || !name) throw new ApiError(400, 'accountId and name are required');

  const { rows } = await db.query(
    `INSERT INTO petty_cash_accounts (company_id, account_id, name, custodian_user_id, float_amount)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.companyId, accountId, name, custodianUserId || null, floatAmount || 0]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'petty_cash_account', entityId: rows[0].id, newValues: { name }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// GET /petty-cash-accounts/:id/vouchers
const listVouchers = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT pcv.*, coa.account_name AS expense_account_name
     FROM petty_cash_vouchers pcv
     JOIN chart_of_accounts coa ON coa.id = pcv.expense_account_id
     JOIN petty_cash_accounts pca ON pca.id = pcv.petty_cash_account_id
     WHERE pcv.petty_cash_account_id = $1 AND pca.company_id = $2
     ORDER BY pcv.voucher_date DESC`,
    [id, req.user.companyId]
  );
  res.json(rows);
});

// POST /petty-cash-accounts/:id/vouchers  { payee, description, amount, expenseAccountId, voucherDate }
const createVoucher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { payee, description, amount, expenseAccountId, voucherDate } = req.body;
  if (!description || !amount || !expenseAccountId) throw new ApiError(400, 'description, amount, and expenseAccountId are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const pettyCashResult = await client.query('SELECT * FROM petty_cash_accounts WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!pettyCashResult.rows.length) throw new ApiError(404, 'Petty cash account not found');
    const pettyCash = pettyCashResult.rows[0];

    const spentResult = await client.query('SELECT COALESCE(SUM(amount), 0) AS spent FROM petty_cash_vouchers WHERE petty_cash_account_id = $1', [id]);
    const receiptsResult = await client.query('SELECT COALESCE(SUM(amount), 0) AS received FROM petty_cash_receipts WHERE petty_cash_account_id = $1', [id]);
    const available = Number(pettyCash.float_amount) + Number(receiptsResult.rows[0].received) - Number(spentResult.rows[0].spent);
    if (Number(amount) > available + 0.01) {
      throw new ApiError(400, `Only GHS ${available.toFixed(2)} remains in this petty cash float`);
    }

    const voucherNo = await salesService.generateDocNo(client, req.user.companyId, 'PCV');
    const voucherResult = await client.query(
      `INSERT INTO petty_cash_vouchers (petty_cash_account_id, voucher_no, voucher_date, payee, description, amount, expense_account_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, voucherNo, voucherDate || new Date().toISOString().slice(0, 10), payee || null, description, amount, expenseAccountId, req.user.id]
    );
    const voucher = voucherResult.rows[0];

    // Dr Expense / Cr Petty Cash asset.
    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: voucher.voucher_date,
      referenceType: 'petty_cash', referenceId: voucher.id, description: `Petty cash voucher ${voucherNo}: ${description}`,
      lines: [
        { accountId: expenseAccountId, debit: amount, credit: 0, description },
        { accountId: pettyCash.account_id, debit: 0, credit: amount, description: `Voucher ${voucherNo}` },
      ],
    });

    await client.query('UPDATE petty_cash_vouchers SET journal_entry_id = $1 WHERE id = $2', [entry.id, voucher.id]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'petty_cash_voucher', entityId: voucher.id, newValues: { voucherNo, amount }, ip: req.ip });
    res.status(201).json({ ...voucher, journal_entry_id: entry.id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /petty-cash-accounts/:id/receipts
const listReceipts = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT pcr.*, ba.bank_name, ba.account_number AS bank_account_number
     FROM petty_cash_receipts pcr
     JOIN petty_cash_accounts pca ON pca.id = pcr.petty_cash_account_id
     LEFT JOIN bank_accounts ba ON ba.id = pcr.bank_account_id
     WHERE pcr.petty_cash_account_id = $1 AND pca.company_id = $2
     ORDER BY pcr.receipt_date DESC, pcr.created_at DESC`,
    [id, req.user.companyId]
  );
  res.json(rows);
});

// POST /petty-cash-accounts/:id/receipts { receivedFrom, paymentMethod, bankAccountId, referenceNo, amount, receiptDate }
// A real petty cash book has two sides — this is the receipts side that
// was missing: money genuinely coming INTO the float, from a real source
// (cash handed over, a cheque, mobile money, or a bank transfer), posted
// as Dr Petty Cash / Cr wherever the money actually came from — the exact
// mirror of how createVoucher already posts Dr Expense / Cr Petty Cash for
// money going out.
const createReceipt = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { receivedFrom, paymentMethod, bankAccountId, referenceNo, amount, receiptDate } = req.body;
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'amount is required and must be greater than zero');
  const validMethods = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'];
  const method = paymentMethod || 'cash';
  if (!validMethods.includes(method)) throw new ApiError(400, `paymentMethod must be one of: ${validMethods.join(', ')}`);
  if (method !== 'cash' && !bankAccountId) throw new ApiError(400, 'bankAccountId is required for a non-cash receipt method');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const pettyCashResult = await client.query('SELECT * FROM petty_cash_accounts WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!pettyCashResult.rows.length) throw new ApiError(404, 'Petty cash account not found');
    const pettyCash = pettyCashResult.rows[0];

    // The same source-account selection already established for payroll
    // payments (052_payroll_payment_method.sql): a specific bank account
    // for non-cash methods, falling back to the mapped cash account.
    let sourceAccountId = null;
    if (method !== 'cash' && bankAccountId) {
      const bankAccount = await client.query('SELECT account_id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
      if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');
      sourceAccountId = bankAccount.rows[0].account_id;
    }
    if (!sourceAccountId) {
      const hasCash = await accountingService.hasAllMappings(client, req.user.companyId, ['cash_default']);
      if (!hasCash) throw new ApiError(400, 'A default Cash account must be mapped before recording a cash receipt');
      sourceAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'cash_default');
    }

    const receiptNo = await salesService.generateDocNo(client, req.user.companyId, 'PCR');
    const receiptResult = await client.query(
      `INSERT INTO petty_cash_receipts (petty_cash_account_id, receipt_no, receipt_date, received_from, payment_method, bank_account_id, reference_no, amount, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, receiptNo, receiptDate || new Date().toISOString().slice(0, 10), receivedFrom || null, method, method !== 'cash' ? bankAccountId : null, referenceNo || null, amount, req.user.id]
    );
    const receipt = receiptResult.rows[0];

    // Dr Petty Cash asset / Cr wherever the money actually came from.
    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: receipt.receipt_date,
      referenceType: 'petty_cash_receipt', referenceId: receipt.id,
      description: `Petty cash receipt ${receiptNo}${receivedFrom ? ' from ' + receivedFrom : ''} (${method.replace('_', ' ')})`,
      lines: [
        { accountId: pettyCash.account_id, debit: amount, credit: 0, description: `Receipt ${receiptNo}` },
        { accountId: sourceAccountId, debit: 0, credit: amount, description: `Receipt ${receiptNo}` },
      ],
    });

    await client.query('UPDATE petty_cash_receipts SET journal_entry_id = $1 WHERE id = $2', [entry.id, receipt.id]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'petty_cash_receipt', entityId: receipt.id, newValues: { receiptNo, amount, method }, ip: req.ip });
    res.status(201).json({ ...receipt, journal_entry_id: entry.id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
const updatePettyCashAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, custodianUserId, floatAmount } = req.body;
  const { rows } = await db.query(
    `UPDATE petty_cash_accounts SET name = $1, custodian_user_id = $2, float_amount = $3
     WHERE id = $4 AND company_id = $5 RETURNING *`,
    [name, custodianUserId || null, floatAmount, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Petty cash account not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'petty_cash_account', entityId: id, newValues: { name, custodianUserId, floatAmount }, ip: req.ip });
  res.json(rows[0]);
});

const deletePettyCashAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await db.query('SELECT id FROM petty_cash_accounts WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Petty cash account not found');

  const activity = await db.query(
    `SELECT (SELECT COUNT(*) FROM petty_cash_vouchers WHERE petty_cash_account_id = $1) AS voucher_count,
            (SELECT COUNT(*) FROM petty_cash_receipts WHERE petty_cash_account_id = $1) AS receipt_count`,
    [id]
  );
  if (Number(activity.rows[0].voucher_count) > 0 || Number(activity.rows[0].receipt_count) > 0) {
    throw new ApiError(400, 'Cannot delete a petty cash account that has vouchers or receipts.');
  }

  await db.query('DELETE FROM petty_cash_accounts WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'petty_cash_account', entityId: id, ip: req.ip });
  res.status(204).send();
});

const updateVoucher = asyncHandler(async (req, res) => {
  const { id, voucherId } = req.params;
  const { payee, description, amount, expenseAccountId, voucherDate } = req.body;
  if (!description || !amount || !expenseAccountId) throw new ApiError(400, 'description, amount, and expenseAccountId are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const pettyCashResult = await client.query('SELECT * FROM petty_cash_accounts WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!pettyCashResult.rows.length) throw new ApiError(404, 'Petty cash account not found');
    const pettyCash = pettyCashResult.rows[0];

    const voucherResult = await client.query('SELECT * FROM petty_cash_vouchers WHERE id = $1 AND petty_cash_account_id = $2', [voucherId, id]);
    if (!voucherResult.rows.length) throw new ApiError(404, 'Voucher not found');
    const voucher = voucherResult.rows[0];

    if (voucher.journal_entry_id) {
      await accountingService.reverseJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, journalEntryId: voucher.journal_entry_id,
        reason: `Voucher ${voucher.voucher_no} edited`,
      });
    }

    const spentResult = await client.query('SELECT COALESCE(SUM(amount), 0) AS spent FROM petty_cash_vouchers WHERE petty_cash_account_id = $1 AND id != $2', [id, voucherId]);
    const receiptsResult = await client.query('SELECT COALESCE(SUM(amount), 0) AS received FROM petty_cash_receipts WHERE petty_cash_account_id = $1', [id]);
    const available = Number(pettyCash.float_amount) + Number(receiptsResult.rows[0].received) - Number(spentResult.rows[0].spent);
    if (Number(amount) > available + 0.01) {
      throw new ApiError(400, `Only GHS ${available.toFixed(2)} remains in this petty cash float`);
    }

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: voucherDate || voucher.voucher_date,
      referenceType: 'petty_cash', referenceId: voucher.id, description: `Petty cash voucher ${voucher.voucher_no} (edited): ${description}`,
      lines: [
        { accountId: expenseAccountId, debit: amount, credit: 0, description },
        { accountId: pettyCash.account_id, debit: 0, credit: amount, description: `Voucher ${voucher.voucher_no}` },
      ],
    });

    const updated = await client.query(
      `UPDATE petty_cash_vouchers SET payee = $1, description = $2, amount = $3, expense_account_id = $4, voucher_date = $5, journal_entry_id = $6
       WHERE id = $7 RETURNING *`,
      [payee || null, description, amount, expenseAccountId, voucherDate || voucher.voucher_date, entry.id, voucherId]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'petty_cash_voucher', entityId: voucherId, oldValues: { amount: voucher.amount, description: voucher.description }, newValues: { amount, description }, ip: req.ip });
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const deleteVoucher = asyncHandler(async (req, res) => {
  const { id, voucherId } = req.params;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const voucherResult = await client.query(
      `SELECT pcv.* FROM petty_cash_vouchers pcv JOIN petty_cash_accounts pca ON pca.id = pcv.petty_cash_account_id
       WHERE pcv.id = $1 AND pcv.petty_cash_account_id = $2 AND pca.company_id = $3`,
      [voucherId, id, req.user.companyId]
    );
    if (!voucherResult.rows.length) throw new ApiError(404, 'Voucher not found');
    const voucher = voucherResult.rows[0];

    if (voucher.journal_entry_id) {
      await accountingService.reverseJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, journalEntryId: voucher.journal_entry_id,
        reason: `Voucher ${voucher.voucher_no} deleted`,
      });
    }

    await client.query('DELETE FROM petty_cash_vouchers WHERE id = $1', [voucherId]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'petty_cash_voucher', entityId: voucherId, oldValues: { amount: voucher.amount, description: voucher.description }, ip: req.ip });
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const updateReceipt = asyncHandler(async (req, res) => {
  const { id, receiptId } = req.params;
  const { receivedFrom, paymentMethod, bankAccountId, referenceNo, amount, receiptDate } = req.body;
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'amount is required and must be greater than zero');
  const validMethods = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'];
  const method = paymentMethod || 'cash';
  if (!validMethods.includes(method)) throw new ApiError(400, `paymentMethod must be one of: ${validMethods.join(', ')}`);
  if (method !== 'cash' && !bankAccountId) throw new ApiError(400, 'bankAccountId is required for a non-cash receipt method');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const pettyCashResult = await client.query('SELECT * FROM petty_cash_accounts WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!pettyCashResult.rows.length) throw new ApiError(404, 'Petty cash account not found');
    const pettyCash = pettyCashResult.rows[0];

    const receiptResult = await client.query('SELECT * FROM petty_cash_receipts WHERE id = $1 AND petty_cash_account_id = $2', [receiptId, id]);
    if (!receiptResult.rows.length) throw new ApiError(404, 'Receipt not found');
    const receipt = receiptResult.rows[0];

    if (receipt.journal_entry_id) {
      await accountingService.reverseJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, journalEntryId: receipt.journal_entry_id,
        reason: `Receipt ${receipt.receipt_no} edited`,
      });
    }

    let sourceAccountId = null;
    if (method !== 'cash' && bankAccountId) {
      const bankAccount = await client.query('SELECT account_id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
      if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');
      sourceAccountId = bankAccount.rows[0].account_id;
    }
    if (!sourceAccountId) {
      const hasCash = await accountingService.hasAllMappings(client, req.user.companyId, ['cash_default']);
      if (!hasCash) throw new ApiError(400, 'A default Cash account must be mapped before recording a cash receipt');
      sourceAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'cash_default');
    }

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: receiptDate || receipt.receipt_date,
      referenceType: 'petty_cash_receipt', referenceId: receipt.id,
      description: `Petty cash receipt ${receipt.receipt_no} (edited)${receivedFrom ? ' from ' + receivedFrom : ''} (${method.replace('_', ' ')})`,
      lines: [
        { accountId: pettyCash.account_id, debit: amount, credit: 0, description: `Receipt ${receipt.receipt_no}` },
        { accountId: sourceAccountId, debit: 0, credit: amount, description: `Receipt ${receipt.receipt_no}` },
      ],
    });

    const updated = await client.query(
      `UPDATE petty_cash_receipts SET received_from = $1, payment_method = $2, bank_account_id = $3, reference_no = $4, amount = $5, receipt_date = $6, journal_entry_id = $7
       WHERE id = $8 RETURNING *`,
      [receivedFrom || null, method, method !== 'cash' ? bankAccountId : null, referenceNo || null, amount, receiptDate || receipt.receipt_date, entry.id, receiptId]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'petty_cash_receipt', entityId: receiptId, oldValues: { amount: receipt.amount }, newValues: { amount }, ip: req.ip });
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const deleteReceipt = asyncHandler(async (req, res) => {
  const { id, receiptId } = req.params;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const receiptResult = await client.query(
      `SELECT pcr.* FROM petty_cash_receipts pcr JOIN petty_cash_accounts pca ON pca.id = pcr.petty_cash_account_id
       WHERE pcr.id = $1 AND pcr.petty_cash_account_id = $2 AND pca.company_id = $3`,
      [receiptId, id, req.user.companyId]
    );
    if (!receiptResult.rows.length) throw new ApiError(404, 'Receipt not found');
    const receipt = receiptResult.rows[0];

    if (receipt.journal_entry_id) {
      await accountingService.reverseJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, journalEntryId: receipt.journal_entry_id,
        reason: `Receipt ${receipt.receipt_no} deleted`,
      });
    }

    await client.query('DELETE FROM petty_cash_receipts WHERE id = $1', [receiptId]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'petty_cash_receipt', entityId: receiptId, oldValues: { amount: receipt.amount }, ip: req.ip });
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
module.exports = { listPettyCashAccounts, createPettyCashAccount, listVouchers, createVoucher, listReceipts, createReceipt };
