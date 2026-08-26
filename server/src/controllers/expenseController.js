const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

// IFRS (IAS 1.99-105): the statement of profit or loss is classified BY
// FUNCTION, not as a flat list of expense categories. These are the same
// four buckets financialStatementController.js groups the P&L into —
// Cost of Sales, Operating Expenses, Finance Costs, Income Tax Expense —
// in that presentation order, so this module's totals always reconcile
// against the Financial Statements page. `other_expense` folds into
// Operating Expenses (IAS 1 doesn't require it as its own primary-statement
// line the way "other income" is commonly split out on the revenue side).
const BUCKET_ORDER = ['cogs', 'operating_expense', 'finance_cost', 'tax_expense'];
const BUCKET_LABELS = {
  cogs: 'Cost of Sales',
  operating_expense: 'Operating Expenses',
  finance_cost: 'Finance Costs',
  tax_expense: 'Income Tax Expense',
};
function bucketOf(subtype) {
  return BUCKET_ORDER.includes(subtype) ? subtype : 'operating_expense';
}

// GET /expense-entries
const listExpenseEntries = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ee.*, coa.account_name AS expense_account_name, coa.account_code AS expense_account_code,
            coa.account_subtype AS expense_account_subtype,
            pay.account_name AS payment_account_name, pay.account_code AS payment_account_code
     FROM expense_entries ee
     JOIN chart_of_accounts coa ON coa.id = ee.expense_account_id
     JOIN chart_of_accounts pay ON pay.id = ee.payment_account_id
     WHERE ee.company_id = $1
     ORDER BY ee.entry_date DESC, ee.created_at DESC`,
    [req.user.companyId]
  );

  // Group into the four IFRS-presented P&L expense buckets, in IAS 1
  // function order.
  const byBucket = {};
  for (const key of BUCKET_ORDER) byBucket[key] = [];
  for (const r of rows) byBucket[bucketOf(r.expense_account_subtype)].push(r);

  const totals = {};
  let totalExpenses = 0;
  for (const key of BUCKET_ORDER) {
    const t = byBucket[key].reduce((s, r) => s + Number(r.amount), 0);
    totals[key] = t;
    totalExpenses += t;
  }

  res.json({
    entries: rows,
    buckets: BUCKET_ORDER.map((key) => ({ key, label: BUCKET_LABELS[key], entries: byBucket[key], total: totals[key] })),
    costOfSales: byBucket.cogs,
    operatingExpenses: byBucket.operating_expense,
    financeCosts: byBucket.finance_cost,
    taxExpense: byBucket.tax_expense,
    totals: {
      totalCostOfSales: totals.cogs,
      totalOperatingExpenses: totals.operating_expense,
      totalFinanceCosts: totals.finance_cost,
      totalTaxExpense: totals.tax_expense,
      totalExpenses,
    },
  });
});

// POST /expense-entries  { entryDate, expenseAccountId, paymentAccountId, payee, description, amount }
const createExpenseEntry = asyncHandler(async (req, res) => {
  const { entryDate, expenseAccountId, paymentAccountId, payee, description, amount } = req.body;
  if (!expenseAccountId || !paymentAccountId || !description || !amount) {
    throw new ApiError(400, 'expenseAccountId, paymentAccountId, description, and amount are required');
  }
  if (Number(amount) <= 0) throw new ApiError(400, 'amount must be greater than zero');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const expenseAccountResult = await client.query(
      'SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2',
      [expenseAccountId, req.user.companyId]
    );
    if (!expenseAccountResult.rows.length) throw new ApiError(404, 'Expense account not found');
    if (expenseAccountResult.rows[0].account_type !== 'expense') {
      throw new ApiError(400, 'expenseAccountId must reference an expense account');
    }

    const paymentAccountResult = await client.query(
      'SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2',
      [paymentAccountId, req.user.companyId]
    );
    if (!paymentAccountResult.rows.length) throw new ApiError(404, 'Payment account not found');
    if (paymentAccountResult.rows[0].account_type !== 'asset') {
      throw new ApiError(400, 'paymentAccountId must reference an asset account');
    }

    const date = entryDate || new Date().toISOString().slice(0, 10);
    const entryNo = await salesService.generateDocNo(client, req.user.companyId, 'EXP');

    const entryResult = await client.query(
      `INSERT INTO expense_entries (company_id, entry_no, entry_date, expense_account_id, payment_account_id, payee, description, amount, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.companyId, entryNo, date, expenseAccountId, paymentAccountId, payee || null, description, amount, req.user.id]
    );
    const expense = entryResult.rows[0];

    // Dr expense account (expense) / Cr payment account (asset).
    const journalEntry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: date,
      referenceType: 'expense', referenceId: expense.id, description: `Expense ${entryNo}: ${description}`,
      lines: [
        { accountId: expenseAccountId, debit: amount, credit: 0, description: `Expense ${entryNo}${payee ? ` — ${payee}` : ''}` },
        { accountId: paymentAccountId, debit: 0, credit: amount, description },
      ],
    });

    await client.query('UPDATE expense_entries SET journal_entry_id = $1 WHERE id = $2', [journalEntry.id, expense.id]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'expense_entry', entityId: expense.id, newValues: { entryNo, amount }, ip: req.ip });
    res.status(201).json({ ...expense, journal_entry_id: journalEntry.id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listExpenseEntries, createExpenseEntry };
