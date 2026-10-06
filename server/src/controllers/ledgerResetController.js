const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

const EPS = 0.004;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Debit-positive balance of each account as of a date, counting the same entries the financial
// statements count (everything except reversed entries), so a reset zeroes exactly what the reports show.
async function exactBalances(client, companyId, asOf, accountIds) {
  const params = [companyId, asOf];
  let filter = '';
  if (accountIds) { params.push(accountIds); filter = ' AND a.id = ANY($3::uuid[])'; }
  const { rows } = await client.query(
    `SELECT a.id, a.account_code, a.account_name, a.account_type, a.normal_balance,
            COALESCE((
              SELECT SUM(l.debit - l.credit) FROM journal_entry_lines l
              JOIN journal_entries je ON je.id = l.journal_entry_id
              WHERE l.account_id = a.id AND je.company_id = a.company_id
                AND je.status <> 'reversed' AND je.entry_date <= $2::date
            ), 0)::float8 AS balance
     FROM chart_of_accounts a
     WHERE a.company_id = $1${filter}
     ORDER BY a.account_code`,
    params
  );
  return rows;
}

// GET /ledger-reset/accounts?asOf=YYYY-MM-DD
// Every account that currently has a non-zero balance, plus the equity accounts that can take the offset.
const listAccounts = asyncHandler(async (req, res) => {
  const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);
  if (!isDate(asOf)) throw new ApiError(400, 'asOf must be a date in YYYY-MM-DD format');

  const all = await exactBalances(db, req.user.companyId, asOf, null);
  const accounts = all.filter((a) => Math.abs(a.balance) > EPS);
  const equity = all.filter((a) => a.account_type === 'equity').map((a) => ({ id: a.id, account_code: a.account_code, account_name: a.account_name }));

  const mapped = await db.query(`SELECT account_id FROM gl_account_mappings WHERE company_id = $1 AND mapping_key = 'retained_earnings'`, [req.user.companyId]);
  res.json({ asOf, accounts, equityAccounts: equity, defaultOffsetAccountId: mapped.rows[0]?.account_id || null });
});

// POST /ledger-reset { accountIds, asOf, offsetAccountId?, confirm: 'RESET' }
// Posts ONE journal entry that brings every chosen account to zero. Whatever the chosen accounts add up to
// (their net) goes to the offset equity account, so the books still balance; choosing every account
// with a balance nets to zero and needs no offset. Nothing is deleted: the original entries stay in the
// ledger, and the reset itself can be reversed from the Journal Entries page.
const resetLedgers = asyncHandler(async (req, res) => {
  const { accountIds, asOf, offsetAccountId, confirm } = req.body;
  if (confirm !== 'RESET') throw new ApiError(400, 'Type RESET in the confirmation field to proceed');
  if (!Array.isArray(accountIds) || accountIds.length === 0) throw new ApiError(400, 'Choose at least one account to reset');
  if (accountIds.length > 500) throw new ApiError(400, 'Too many accounts in one reset (maximum 500)');
  const date = asOf || new Date().toISOString().slice(0, 10);
  if (!isDate(date)) throw new ApiError(400, 'asOf must be a date in YYYY-MM-DD format');

  const result = await (async () => {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const chosen = await exactBalances(client, req.user.companyId, date, accountIds);
      if (chosen.length !== new Set(accountIds).size) throw new ApiError(404, 'One or more accounts were not found');
      const toReset = chosen.filter((a) => Math.abs(a.balance) > EPS);
      if (!toReset.length) throw new ApiError(400, 'Nothing to reset: the chosen accounts already have a zero balance');

      const lines = toReset.map((a) => ({
        accountId: a.id,
        debit: a.balance < 0 ? round2(-a.balance) : 0,
        credit: a.balance > 0 ? round2(a.balance) : 0,
        description: `Reset to zero: ${a.account_code} ${a.account_name}`,
      }));
      const net = round2(toReset.reduce((s, a) => s + a.balance, 0));
      if (Math.abs(net) > EPS) {
        if (!offsetAccountId) throw new ApiError(400, 'Choose the equity account that should take the difference');
        const offset = await client.query(`SELECT id, account_code, account_name, account_type FROM chart_of_accounts WHERE id = $1 AND company_id = $2`, [offsetAccountId, req.user.companyId]);
        if (!offset.rows.length) throw new ApiError(404, 'Offset account not found');
        if (offset.rows[0].account_type !== 'equity') throw new ApiError(400, 'The offset account must be an equity account');
        if (accountIds.includes(offsetAccountId)) throw new ApiError(400, 'The offset account cannot also be one of the accounts being reset');
        lines.push({
          accountId: offsetAccountId,
          debit: net > 0 ? net : 0,
          credit: net < 0 ? round2(-net) : 0,
          description: `Offset for ledger reset (${offset.rows[0].account_code} ${offset.rows[0].account_name})`,
        });
      }

      const entry = await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: date,
        referenceType: 'ledger_reset',
        description: `Ledger reset: ${toReset.length} account(s) set to zero as of ${date}`,
        lines,
      });
      await client.query('COMMIT');
      return { entry, toReset, net };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })();

  await recordAudit({
    companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'ledger_reset', entityId: result.entry.id,
    newValues: { asOf: date, offsetAccountId: offsetAccountId || null, accounts: result.toReset.map((a) => ({ code: a.account_code, name: a.account_name, was: round2(a.balance) })) },
    ip: req.ip,
  });
  res.status(201).json({ journalEntryId: result.entry.id, entryNo: result.entry.entry_no, accountsReset: result.toReset.length, offsetAmount: Math.abs(result.net) });
});

module.exports = { listAccounts, resetLedgers };
