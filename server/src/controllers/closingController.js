const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

// PATCH /accounting/fiscal-periods/:id/close — month-end close (blocks further postings in that period)
const closeFiscalPeriod = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `UPDATE fiscal_periods fp SET status = 'closed'
     FROM financial_years fy
     WHERE fp.id = $1 AND fp.financial_year_id = fy.id AND fy.company_id = $2
     RETURNING fp.*`,
    [id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Fiscal period not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'fiscal_period', entityId: id, newValues: { status: 'closed' }, ip: req.ip });
  res.json(rows[0]);
});

// POST /accounting/year-end-close  { financialYearId }
// Zeroes revenue/expense accounts for the year into Retained Earnings and locks the year.
const yearEndClose = asyncHandler(async (req, res) => {
  const { financialYearId } = req.body;
  if (!financialYearId) throw new ApiError(400, 'financialYearId is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const fyResult = await client.query(
      'SELECT * FROM financial_years WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [financialYearId, req.user.companyId]
    );
    if (!fyResult.rows.length) throw new ApiError(404, 'Financial year not found');
    const fy = fyResult.rows[0];
    if (fy.status === 'closed') throw new ApiError(400, 'This financial year is already closed');

    if (!(await accountingService.hasAllMappings(client, req.user.companyId, ['retained_earnings']))) {
      throw new ApiError(400, 'Map a "retained_earnings" account first under Chart of Accounts > GL Mappings');
    }
    const retainedEarningsAccount = await accountingService.getMappedAccountId(client, req.user.companyId, 'retained_earnings');

    const revenueResult = await client.query(
      `SELECT coa.id, coa.normal_balance, COALESCE(SUM(jel.debit),0) AS d, COALESCE(SUM(jel.credit),0) AS c
       FROM chart_of_accounts coa
       LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status != 'reversed' AND je.entry_date BETWEEN $2 AND $3
       WHERE coa.company_id = $1 AND coa.account_type = 'revenue'
       GROUP BY coa.id`,
      [req.user.companyId, fy.start_date, fy.end_date]
    );
    const expenseResult = await client.query(
      `SELECT coa.id, coa.normal_balance, COALESCE(SUM(jel.debit),0) AS d, COALESCE(SUM(jel.credit),0) AS c
       FROM chart_of_accounts coa
       LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status != 'reversed' AND je.entry_date BETWEEN $2 AND $3
       WHERE coa.company_id = $1 AND coa.account_type = 'expense'
       GROUP BY coa.id`,
      [req.user.companyId, fy.start_date, fy.end_date]
    );

    const glLines = [];
    let netIncome = 0;

    for (const acc of revenueResult.rows) {
      const balance = Number(acc.c) - Number(acc.d); // revenue is credit-normal
      if (Math.abs(balance) < 0.01) continue;
      glLines.push({ accountId: acc.id, debit: balance > 0 ? balance : 0, credit: balance < 0 ? -balance : 0, description: 'Year-end close' });
      netIncome += balance;
    }
    for (const acc of expenseResult.rows) {
      const balance = Number(acc.d) - Number(acc.c); // expense is debit-normal
      if (Math.abs(balance) < 0.01) continue;
      glLines.push({ accountId: acc.id, debit: balance < 0 ? -balance : 0, credit: balance > 0 ? balance : 0, description: 'Year-end close' });
      netIncome -= balance;
    }

    if (glLines.length === 0) {
      throw new ApiError(400, 'No revenue or expense activity found in this financial year to close');
    }

    glLines.push({
      accountId: retainedEarningsAccount,
      debit: netIncome < 0 ? -netIncome : 0,
      credit: netIncome > 0 ? netIncome : 0,
      description: `Net income transferred to retained earnings for ${fy.name}`,
    });

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: fy.end_date,
      referenceType: 'closing', referenceId: fy.id, description: `Year-end closing entry for ${fy.name}`, lines: glLines,
    });

    await client.query(`UPDATE financial_years SET status = 'closed' WHERE id = $1`, [financialYearId]);
    await client.query(`UPDATE fiscal_periods SET status = 'closed' WHERE financial_year_id = $1 AND status != 'closed'`, [financialYearId]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'year_end_close', entityId: entry.id, newValues: { financialYearId, netIncome }, ip: req.ip });
    res.json({ message: `Year closed. Net income of GHS ${netIncome.toFixed(2)} transferred to retained earnings.`, journalEntry: entry, netIncome });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { closeFiscalPeriod, yearEndClose };
