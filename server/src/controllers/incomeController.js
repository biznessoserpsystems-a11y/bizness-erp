const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

// IFRS (IAS 1) ordering: an entity's core trading revenue is presented
// first, with any other income shown as its own, later line — never
// interleaved with it.
const SUBTYPE_ORDER = { operating_revenue: 0, other_revenue: 1 };

// GET /income-entries
const listIncomeEntries = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ie.*, coa.account_name AS income_account_name, coa.account_code AS income_account_code,
            coa.account_subtype AS income_account_subtype,
            dep.account_name AS deposit_account_name, dep.account_code AS deposit_account_code
     FROM income_entries ie
     JOIN chart_of_accounts coa ON coa.id = ie.income_account_id
     JOIN chart_of_accounts dep ON dep.id = ie.deposit_account_id
     WHERE ie.company_id = $1
     ORDER BY ie.entry_date DESC, ie.created_at DESC`,
    [req.user.companyId]
  );

  // Group into the two IFRS-presented buckets, keeping IAS 1 order:
  // Operating Revenue first, Other Income second.
  const operatingRevenue = rows.filter((r) => r.income_account_subtype === 'operating_revenue');
  const otherIncome = rows.filter((r) => r.income_account_subtype !== 'operating_revenue');
  const totalOperatingRevenue = operatingRevenue.reduce((s, r) => s + Number(r.amount), 0);
  const totalOtherIncome = otherIncome.reduce((s, r) => s + Number(r.amount), 0);

  res.json({
    entries: rows,
    operatingRevenue,
    otherIncome,
    totals: {
      totalOperatingRevenue,
      totalOtherIncome,
      totalIncome: totalOperatingRevenue + totalOtherIncome,
    },
  });
});

// POST /income-entries  { entryDate, incomeAccountId, depositAccountId, payer, description, amount }
const createIncomeEntry = asyncHandler(async (req, res) => {
  const { entryDate, incomeAccountId, depositAccountId, payer, description, amount } = req.body;
  if (!incomeAccountId || !depositAccountId || !description || !amount) {
    throw new ApiError(400, 'incomeAccountId, depositAccountId, description, and amount are required');
  }
  if (Number(amount) <= 0) throw new ApiError(400, 'amount must be greater than zero');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const incomeAccountResult = await client.query(
      'SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2',
      [incomeAccountId, req.user.companyId]
    );
    if (!incomeAccountResult.rows.length) throw new ApiError(404, 'Income account not found');
    if (incomeAccountResult.rows[0].account_type !== 'revenue') {
      throw new ApiError(400, 'incomeAccountId must reference a revenue account');
    }

    const depositAccountResult = await client.query(
      'SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2',
      [depositAccountId, req.user.companyId]
    );
    if (!depositAccountResult.rows.length) throw new ApiError(404, 'Deposit account not found');
    if (depositAccountResult.rows[0].account_type !== 'asset') {
      throw new ApiError(400, 'depositAccountId must reference an asset account');
    }

    const date = entryDate || new Date().toISOString().slice(0, 10);
    const entryNo = await salesService.generateDocNo(client, req.user.companyId, 'INC');

    const entryResult = await client.query(
      `INSERT INTO income_entries (company_id, entry_no, entry_date, income_account_id, deposit_account_id, payer, description, amount, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.companyId, entryNo, date, incomeAccountId, depositAccountId, payer || null, description, amount, req.user.id]
    );
    const income = entryResult.rows[0];

    // Dr deposit account (asset) / Cr income account (revenue).
    const journalEntry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: date,
      referenceType: 'income', referenceId: income.id, description: `Income ${entryNo}: ${description}`,
      lines: [
        { accountId: depositAccountId, debit: amount, credit: 0, description },
        { accountId: incomeAccountId, debit: 0, credit: amount, description: `Income ${entryNo}${payer ? ` — ${payer}` : ''}` },
      ],
    });

    await client.query('UPDATE income_entries SET journal_entry_id = $1 WHERE id = $2', [journalEntry.id, income.id]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'income_entry', entityId: income.id, newValues: { entryNo, amount }, ip: req.ip });
    res.status(201).json({ ...income, journal_entry_id: journalEntry.id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listIncomeEntries, createIncomeEntry };
