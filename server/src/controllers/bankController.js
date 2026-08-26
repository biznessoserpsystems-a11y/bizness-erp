const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const listBankAccounts = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ba.*, coa.account_name, coa.account_code
     FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.account_id
     WHERE ba.company_id = $1 ORDER BY ba.bank_name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createBankAccount = asyncHandler(async (req, res) => {
  const { accountId, bankName, accountNumber, branch, currency } = req.body;
  if (!accountId || !bankName) throw new ApiError(400, 'accountId and bankName are required');

  const { rows } = await db.query(
    `INSERT INTO bank_accounts (company_id, account_id, bank_name, account_number, branch, currency)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.companyId, accountId, bankName, accountNumber || null, branch || null, currency || 'GHS']
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'bank_account', entityId: rows[0].id, newValues: { bankName }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// GET /bank-accounts/:id/statement-lines
const listStatementLines = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT bsl.* FROM bank_statement_lines bsl
     JOIN bank_accounts ba ON ba.id = bsl.bank_account_id
     WHERE bsl.bank_account_id = $1 AND ba.company_id = $2
     ORDER BY bsl.transaction_date DESC`,
    [id, req.user.companyId]
  );
  res.json(rows);
});

// POST /bank-accounts/:id/statement-lines  { lines: [{ transactionDate, description, amount, reference }] }
const importStatementLines = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lines } = req.body;
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'lines is required');

  const bankAccount = await db.query('SELECT id FROM bank_accounts WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');

  const inserted = [];
  for (const line of lines) {
    const { rows } = await db.query(
      `INSERT INTO bank_statement_lines (bank_account_id, transaction_date, description, amount, reference)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, line.transactionDate, line.description || null, line.amount, line.reference || null]
    );
    inserted.push(rows[0]);
  }
  res.status(201).json(inserted);
});

// GET /bank-accounts/:id/reconciliation — statement lines alongside unreconciled GL movements on that account
const getReconciliationView = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bankAccount = await db.query('SELECT * FROM bank_accounts WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');

  const statementLines = await db.query(
    'SELECT * FROM bank_statement_lines WHERE bank_account_id = $1 ORDER BY transaction_date DESC',
    [id]
  );

  const glLines = await db.query(
    `SELECT jel.id, jel.debit, jel.credit, jel.description, je.entry_no, je.entry_date
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE jel.account_id = $1 AND je.status != 'reversed'
     ORDER BY je.entry_date DESC`,
    [bankAccount.rows[0].account_id]
  );

  const unreconciledStatementTotal = statementLines.rows.filter((l) => !l.is_reconciled).reduce((s, l) => s + Number(l.amount), 0);

  res.json({ bankAccount: bankAccount.rows[0], statementLines: statementLines.rows, glLines: glLines.rows, unreconciledStatementTotal });
});

// POST /bank-accounts/:id/auto-reconcile
// Matches unreconciled statement lines to unmatched GL movements on the account's GL
// account, one-to-one, by exact amount (within a cent) and closest transaction date.
// A GL debit increases a bank/asset account's balance the same way a deposit does, and a
// credit decreases it the same way a withdrawal does, so a GL line's "net" (debit - credit)
// is compared directly against a statement line's signed amount (deposit positive,
// withdrawal negative). Anything that doesn't find a same-amount match is left for manual
// review — this only auto-applies matches it's confident about, it never guesses on amount.
const autoReconcile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bankAccount = await db.query('SELECT * FROM bank_accounts WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');

  const statementLines = await db.query(
    `SELECT * FROM bank_statement_lines WHERE bank_account_id = $1 AND is_reconciled = FALSE ORDER BY transaction_date ASC`,
    [id]
  );

  const glLines = await db.query(
    `SELECT jel.id, jel.debit, jel.credit, je.entry_date
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE jel.account_id = $1 AND je.status != 'reversed'
       AND jel.id NOT IN (
         SELECT matched_journal_entry_line_id FROM bank_statement_lines
         WHERE matched_journal_entry_line_id IS NOT NULL
       )`,
    [bankAccount.rows[0].account_id]
  );

  // Pool of available GL lines, each tagged with its net signed amount.
  const pool = glLines.rows.map((l) => ({
    ...l,
    net: Number(l.debit) - Number(l.credit),
    used: false,
  }));

  const matched = [];
  for (const line of statementLines.rows) {
    const amount = Number(line.amount);
    let best = null;
    for (const candidate of pool) {
      if (candidate.used) continue;
      if (Math.abs(candidate.net - amount) > 0.01) continue;
      if (!best || Math.abs(new Date(candidate.entry_date) - new Date(line.transaction_date)) <
                    Math.abs(new Date(best.entry_date) - new Date(line.transaction_date))) {
        best = candidate;
      }
    }
    if (best) {
      best.used = true;
      await db.query(
        `UPDATE bank_statement_lines SET is_reconciled = TRUE, matched_journal_entry_line_id = $1 WHERE id = $2`,
        [best.id, line.id]
      );
      matched.push({ statementLineId: line.id, journalEntryLineId: best.id, amount });
    }
  }

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'bank_account', entityId: id, newValues: { autoReconciled: matched.length }, ip: req.ip });
  res.json({ matchedCount: matched.length, unmatchedCount: statementLines.rows.length - matched.length, matched });
});

// PATCH /bank-statement-lines/:id/reconcile  { matchedJournalEntryLineId }
const reconcileLine = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { matchedJournalEntryLineId } = req.body;

  const { rows } = await db.query(
    `UPDATE bank_statement_lines bsl SET is_reconciled = TRUE, matched_journal_entry_line_id = $1
     FROM bank_accounts ba
     WHERE bsl.id = $2 AND bsl.bank_account_id = ba.id AND ba.company_id = $3
     RETURNING bsl.*`,
    [matchedJournalEntryLineId || null, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Statement line not found');
  res.json(rows[0]);
});

// GET /bank-accounts/:id/reconciliation-statement?asOf=YYYY-MM-DD
//
// The formal accounting document, not the working matching tool above —
// getReconciliationView is where someone actually clicks through and
// matches individual lines; this is the resulting statement once that
// work is done (or partly done — an out-of-balance result here is
// itself useful information, not an error condition).
//
// Standard two-sided bank reconciliation: the bank's balance and the
// book's balance rarely agree on any given day purely because of
// timing, not because either is wrong — a check the books already
// recorded hasn't cleared the bank yet; the bank charged a fee the
// books haven't recorded yet. Adjusting each side for exactly the items
// timing hasn't caught up on yet should bring both to the same
// adjusted figure — that match (or mismatch) is what this reports.
const getReconciliationStatement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);

  const bankAccount = await db.query(
    `SELECT ba.*, coa.account_name, coa.account_code
     FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.account_id
     WHERE ba.id = $1 AND ba.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');
  const glAccountId = bankAccount.rows[0].account_id;

  // Balance per bank statement: the statement lines are this account's
  // own record of every transaction the bank has reported, so their
  // running total as of the chosen date is the bank's own balance —
  // the same figure a person would read directly off a real bank
  // statement for that date.
  const bankBalanceResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS balance FROM bank_statement_lines
     WHERE bank_account_id = $1 AND transaction_date <= $2`,
    [id, asOf]
  );

  // Balance per books: the GL account's own running balance as of the
  // same date — debits increase a bank/asset account, credits decrease
  // it, the same convention every other balance in this ledger follows.
  const bookBalanceResult = await db.query(
    `SELECT COALESCE(SUM(jel.debit - jel.credit), 0) AS balance
     FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE jel.account_id = $1 AND je.status != 'reversed' AND je.entry_date <= $2`,
    [glAccountId, asOf]
  );

  // Deposits in transit / outstanding payments: recorded in the books,
  // not yet cleared by the bank — the book side of unreconciled items.
  const unmatchedGlResult = await db.query(
    `SELECT jel.id, jel.debit, jel.credit, jel.description, je.entry_no, je.entry_date
     FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE jel.account_id = $1 AND je.status != 'reversed' AND je.entry_date <= $2
       AND jel.id NOT IN (
         SELECT matched_journal_entry_line_id FROM bank_statement_lines
         WHERE matched_journal_entry_line_id IS NOT NULL
       )
     ORDER BY je.entry_date ASC`,
    [glAccountId, asOf]
  );
  const depositsInTransit = unmatchedGlResult.rows
    .map((r) => ({ ...r, net: Number(r.debit) - Number(r.credit) }))
    .filter((r) => r.net > 0);
  const outstandingPayments = unmatchedGlResult.rows
    .map((r) => ({ ...r, net: Number(r.debit) - Number(r.credit) }))
    .filter((r) => r.net < 0);

  // Unrecorded bank credits / charges: on the bank statement, not yet
  // recorded in the books — the bank side of unreconciled items (bank
  // interest, bank fees, direct debits the company hasn't entered yet).
  const unmatchedStatementResult = await db.query(
    `SELECT * FROM bank_statement_lines
     WHERE bank_account_id = $1 AND transaction_date <= $2 AND is_reconciled = FALSE
     ORDER BY transaction_date ASC`,
    [id, asOf]
  );
  const unrecordedBankCredits = unmatchedStatementResult.rows.filter((l) => Number(l.amount) > 0);
  const unrecordedBankCharges = unmatchedStatementResult.rows.filter((l) => Number(l.amount) < 0);

  const balancePerBank = Number(bankBalanceResult.rows[0].balance);
  const balancePerBooks = Number(bookBalanceResult.rows[0].balance);
  const depositsInTransitTotal = depositsInTransit.reduce((s, r) => s + r.net, 0);
  const outstandingPaymentsTotal = Math.abs(outstandingPayments.reduce((s, r) => s + r.net, 0));
  const unrecordedBankCreditsTotal = unrecordedBankCredits.reduce((s, l) => s + Number(l.amount), 0);
  const unrecordedBankChargesTotal = Math.abs(unrecordedBankCharges.reduce((s, l) => s + Number(l.amount), 0));

  const adjustedBankBalance = balancePerBank + depositsInTransitTotal - outstandingPaymentsTotal;
  const adjustedBookBalance = balancePerBooks + unrecordedBankCreditsTotal - unrecordedBankChargesTotal;

  res.json({
    bankAccount: bankAccount.rows[0],
    asOf,
    balancePerBank,
    depositsInTransit, depositsInTransitTotal,
    outstandingPayments, outstandingPaymentsTotal,
    adjustedBankBalance,
    balancePerBooks,
    unrecordedBankCredits, unrecordedBankCreditsTotal,
    unrecordedBankCharges, unrecordedBankChargesTotal,
    adjustedBookBalance,
    isReconciled: Math.abs(adjustedBankBalance - adjustedBookBalance) < 0.01,
    difference: Number((adjustedBankBalance - adjustedBookBalance).toFixed(2)),
  });
});

module.exports = { listBankAccounts, createBankAccount, listStatementLines, importStatementLines, getReconciliationView, autoReconcile, reconcileLine, getReconciliationStatement };
