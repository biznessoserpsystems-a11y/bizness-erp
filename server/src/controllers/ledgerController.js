const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

// GET /ledger/:accountId?from=&to=
const accountLedger = asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const { from, to } = req.query;

  const account = await db.query('SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2', [accountId, req.user.companyId]);
  if (!account.rows.length) throw new ApiError(404, 'Account not found');

  const conditions = ['jel.account_id = $1', 'je.status != $2'];
  const params = [accountId, 'reversed'];
  if (from) { params.push(from); conditions.push(`je.entry_date >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`je.entry_date <= $${params.length}`); }

  const { rows } = await db.query(
    `SELECT jel.*, je.entry_no, je.entry_date, je.description AS entry_description, je.reference_type
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY je.entry_date, je.created_at`,
    params
  );

  const isDebitNormal = account.rows[0].normal_balance === 'debit';
  let balance = 0;
  const lines = rows.map((l) => {
    const movement = isDebitNormal ? Number(l.debit) - Number(l.credit) : Number(l.credit) - Number(l.debit);
    balance += movement;
    return { ...l, running_balance: balance };
  });

  res.json({ account: account.rows[0], lines, closingBalance: balance });
});

// GET /trial-balance?asOf=
const trialBalance = asyncHandler(async (req, res) => {
  const { asOf } = req.query;
  const dateFilter = asOf ? 'AND je.entry_date <= $2' : '';
  const params = asOf ? [req.user.companyId, asOf] : [req.user.companyId];

  const { rows } = await db.query(
    `SELECT coa.id, coa.account_code, coa.account_name, coa.account_type, coa.normal_balance,
            COALESCE(SUM(jel.debit), 0) AS total_debit, COALESCE(SUM(jel.credit), 0) AS total_credit
     FROM chart_of_accounts coa
     LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
     LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status != 'reversed' ${dateFilter}
     WHERE coa.company_id = $1
     GROUP BY coa.id
     ORDER BY coa.account_code`,
    params
  );

  let totalDebitBalances = 0;
  let totalCreditBalances = 0;
  const lines = rows
    .map((r) => {
      const net = Number(r.total_debit) - Number(r.total_credit);
      const debitBalance = net > 0 ? net : 0;
      const creditBalance = net < 0 ? -net : 0;
      totalDebitBalances += debitBalance;
      totalCreditBalances += creditBalance;
      return { ...r, debit_balance: debitBalance, credit_balance: creditBalance };
    })
    .filter((r) => Number(r.total_debit) > 0 || Number(r.total_credit) > 0);

  res.json({ asOf: asOf || null, lines, totalDebitBalances, totalCreditBalances, isBalanced: Math.abs(totalDebitBalances - totalCreditBalances) < 0.01 });
});

module.exports = { accountLedger, trialBalance };
