const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

// GET /opening-balances?financialYearId=
const listOpeningBalances = asyncHandler(async (req, res) => {
  const { financialYearId } = req.query;
  if (!financialYearId) throw new ApiError(400, 'financialYearId is required');

  const { rows } = await db.query(
    `SELECT ob.*, coa.account_code, coa.account_name, coa.account_type
     FROM opening_balances ob JOIN chart_of_accounts coa ON coa.id = ob.account_id
     WHERE ob.company_id = $1 AND ob.financial_year_id = $2
     ORDER BY coa.account_code`,
    [req.user.companyId, financialYearId]
  );
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
  res.json({ lines: rows, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 });
});

// PUT /opening-balances  { financialYearId, lines: [{ accountId, debit, credit }] }
// Replaces the full opening balance set for that financial year in one call.
const setOpeningBalances = asyncHandler(async (req, res) => {
  const { financialYearId, lines } = req.body;
  if (!financialYearId) throw new ApiError(400, 'financialYearId is required');
  if (!Array.isArray(lines)) throw new ApiError(400, 'lines must be an array');

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new ApiError(400, `Opening balances must balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM opening_balances WHERE financial_year_id = $1 AND company_id = $2', [financialYearId, req.user.companyId]);
    for (const line of lines) {
      if (!line.debit && !line.credit) continue;
      await client.query(
        `INSERT INTO opening_balances (company_id, financial_year_id, account_id, debit, credit) VALUES ($1,$2,$3,$4,$5)`,
        [req.user.companyId, financialYearId, line.accountId, line.debit || 0, line.credit || 0]
      );
    }
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'opening_balances', newValues: { financialYearId }, ip: req.ip });
    res.json({ message: 'Opening balances saved' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listOpeningBalances, setOpeningBalances };
