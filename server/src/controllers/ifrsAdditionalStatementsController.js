const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendExport } = require('../services/exportService');
const { accountBalancesAsOf, movementBetween, currentFinancialYearStart } = require('./financialStatementController');

function dayBefore(dateStr) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function cashAccountIds(companyId) {
  const [banks, pettyCash] = await Promise.all([
    db.query('SELECT account_id FROM bank_accounts WHERE company_id = $1', [companyId]),
    db.query('SELECT account_id FROM petty_cash_accounts WHERE company_id = $1', [companyId]),
  ]);
  return new Set([...banks.rows.map((r) => r.account_id), ...pettyCash.rows.map((r) => r.account_id)]);
}

/**
 * GET /financial-statements/cash-flow?from=&to=
 * Indirect method (IAS 7.18(b) — the near-universal choice in practice,
 * since it starts from profit already computed for the Statement of Profit
 * or Loss rather than requiring a parallel direct tally of every gross cash
 * receipt/payment). Net income, adjusted for non-cash items and working
 * capital movement, reconciled against the period's *actual* change in cash
 * and bank balances — the same "does this actually tie out" discipline as
 * the Statement of Financial Position's isBalanced check, so a bug in the
 * classification logic below would show up as a visible discrepancy rather
 * than a silently wrong number.
 */
const cashFlowStatement = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  const companyId = req.user.companyId;
  const priorDay = dayBefore(from);

  // ---- Operating activities ----
  const revenueRows = await movementBetween(companyId, from, to, ['revenue']);
  const expenseRows = await movementBetween(companyId, from, to, ['expense']);
  const netIncome = revenueRows.reduce((s, a) => s + a.balance, 0) - expenseRows.reduce((s, a) => s + a.balance, 0);

  const { rows: deprRows } = await db.query(
    `SELECT COALESCE(SUM(depreciation_amount), 0) AS total FROM asset_depreciation_entries
     WHERE company_id = $1 AND period_end BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const depreciation = Number(deprRows[0].total);

  const cashIds = await cashAccountIds(companyId);
  const [assetsStart, assetsEnd, liabStart, liabEnd] = await Promise.all([
    accountBalancesAsOf(companyId, priorDay, ['asset']),
    accountBalancesAsOf(companyId, to, ['asset']),
    accountBalancesAsOf(companyId, priorDay, ['liability']),
    accountBalancesAsOf(companyId, to, ['liability']),
  ]);
  // Working capital = every current asset/liability EXCEPT cash/bank/petty
  // cash (that's what this whole statement solves for, not an input to it)
  // and EXCEPT fixed assets (those are investing activities, handled below).
  const currentAssetsStart = assetsStart.filter((a) => a.account_subtype !== 'fixed_asset' && !cashIds.has(a.id));
  const currentAssetsEnd = assetsEnd.filter((a) => a.account_subtype !== 'fixed_asset' && !cashIds.has(a.id));
  const currentLiabStart = liabStart.filter((l) => l.account_subtype !== 'long_term_liability');
  const currentLiabEnd = liabEnd.filter((l) => l.account_subtype !== 'long_term_liability');

  function movementByAccount(startRows, endRows) {
    const startMap = new Map(startRows.map((r) => [r.id, { name: r.account_name, balance: r.balance }]));
    const endMap = new Map(endRows.map((r) => [r.id, { name: r.account_name, balance: r.balance }]));
    const ids = new Set([...startMap.keys(), ...endMap.keys()]);
    return [...ids].map((id) => {
      const startBal = startMap.get(id)?.balance || 0;
      const endBal = endMap.get(id)?.balance || 0;
      return { name: (endMap.get(id) || startMap.get(id)).name, change: endBal - startBal };
    }).filter((r) => Math.abs(r.change) > 0.001);
  }

  const assetMovements = movementByAccount(currentAssetsStart, currentAssetsEnd); // increase = use of cash
  const liabMovements = movementByAccount(currentLiabStart, currentLiabEnd); // increase = source of cash
  const workingCapitalChanges = [
    ...assetMovements.map((m) => ({ label: `(Increase)/Decrease in ${m.name}`, amount: -m.change })),
    ...liabMovements.map((m) => ({ label: `Increase/(Decrease) in ${m.name}`, amount: m.change })),
  ];
  const totalWorkingCapitalChange = workingCapitalChanges.reduce((s, m) => s + m.amount, 0);
  const netCashFromOperations = netIncome + depreciation + totalWorkingCapitalChange;

  // ---- Investing activities ----
  const { rows: capexRows } = await db.query(
    `SELECT COALESCE(SUM(original_cost), 0) AS total FROM fixed_assets
     WHERE company_id = $1 AND acquisition_date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const capex = Number(capexRows[0].total);
  const { rows: disposalRows } = await db.query(
    `SELECT COALESCE(SUM(proceeds), 0) AS total FROM asset_disposals
     WHERE company_id = $1 AND disposal_date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const disposalProceeds = Number(disposalRows[0].total);
  const netCashFromInvesting = disposalProceeds - capex;

  // ---- Financing activities ----
  const { rows: periodMovements } = await db.query(
    `SELECT coa.account_type, coa.account_subtype, coa.account_name, je.reference_type,
            SUM(CASE WHEN coa.normal_balance = 'debit' THEN jel.debit - jel.credit ELSE jel.credit - jel.debit END) AS net_change
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status != 'reversed'
     JOIN chart_of_accounts coa ON coa.id = jel.account_id
     WHERE coa.company_id = $1 AND je.entry_date BETWEEN $2 AND $3
       AND (coa.account_subtype = 'long_term_liability' OR (coa.account_type = 'equity'))
     GROUP BY coa.account_type, coa.account_subtype, coa.account_name, je.reference_type`,
    [companyId, from, to]
  );
  const loanMovements = periodMovements.filter((m) => m.account_subtype === 'long_term_liability');
  const equityMovements = periodMovements.filter((m) => m.account_type === 'equity' && m.reference_type !== 'closing' && m.reference_type !== 'asset_revaluation');
  const netLoanChange = loanMovements.reduce((s, m) => s + Number(m.net_change), 0);
  const netEquityContribution = equityMovements.reduce((s, m) => s + Number(m.net_change), 0);
  const netCashFromFinancing = netLoanChange + netEquityContribution;

  const netChangeInCash = netCashFromOperations + netCashFromInvesting + netCashFromFinancing;

  // ---- Reconciliation: does the computed net change actually match reality? ----
  const [cashStart, cashEnd] = await Promise.all([
    accountBalancesAsOf(companyId, priorDay, ['asset']),
    accountBalancesAsOf(companyId, to, ['asset']),
  ]);
  const openingCash = cashStart.filter((a) => cashIds.has(a.id)).reduce((s, a) => s + a.balance, 0);
  const closingCash = cashEnd.filter((a) => cashIds.has(a.id)).reduce((s, a) => s + a.balance, 0);
  const actualChangeInCash = closingCash - openingCash;
  const reconcilingDifference = actualChangeInCash - netChangeInCash;

  const summary = {
    from, to,
    operating: { netIncome, depreciation, workingCapitalChanges, totalWorkingCapitalChange, netCashFromOperations },
    investing: { capex, disposalProceeds, netCashFromInvesting },
    financing: { loanMovements, netLoanChange, equityMovements, netEquityContribution, netCashFromFinancing },
    netChangeInCash, openingCash, closingCash, actualChangeInCash, reconcilingDifference,
    isReconciled: Math.abs(reconcilingDifference) < 0.01,
  };

  if (req.query.format) {
    const line = (label, amount) => ({ label, amount });
    return sendExport(res, req.query.format, `cash-flow-statement-${from}-to-${to}`, {
      title: 'Statement of Cash Flows',
      subtitle: `For the period ${from} to ${to} (indirect method, IAS 7)`,
      sections: [
        {
          title: 'Operating Activities',
          lines: [
            line('Net Income for the Period', netIncome),
            line('Add: Depreciation', depreciation),
            ...workingCapitalChanges.map((m) => line(m.label, m.amount)),
          ],
          total: { label: 'Net Cash from Operating Activities', amount: netCashFromOperations },
        },
        {
          title: 'Investing Activities',
          lines: [line('Purchase of Fixed Assets', -capex), line('Proceeds from Disposal of Assets', disposalProceeds)],
          total: { label: 'Net Cash from Investing Activities', amount: netCashFromInvesting },
        },
        {
          title: 'Financing Activities',
          lines: [line('Net Movement in Long-term Loans', netLoanChange), line('Net Owner Contributions/(Drawings)', netEquityContribution)],
          total: { label: 'Net Cash from Financing Activities', amount: netCashFromFinancing },
        },
        {
          title: 'Reconciliation',
          lines: [line('Cash at Beginning of Period', openingCash), line('Net Increase/(Decrease) in Cash', netChangeInCash)],
        },
      ],
      grandTotal: { label: 'Cash at End of Period', amount: closingCash },
    });
  }

  res.json(summary);
});

/**
 * GET /financial-statements/changes-in-equity?from=&to=
 * A roll-forward of every equity account: opening balance, movements
 * (split into profit transferred at year-end close, revaluation surplus
 * movements per IAS 16.41, and everything else), closing balance. For any
 * financial year not yet formally closed (see /accounting/year-end-close),
 * Retained Earnings' closing balance also folds in the *unappropriated*
 * current-year profit using the exact same calculation the Statement of
 * Financial Position uses for its "Current Year Earnings" line — so this
 * statement's Total Equity always ties out to the Balance Sheet's Total
 * Equity for the same date, never a second, disagreeing number.
 */
const changesInEquity = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  const companyId = req.user.companyId;
  const priorDay = dayBefore(from);

  const [openingBalances, closingBalances] = await Promise.all([
    accountBalancesAsOf(companyId, priorDay, ['equity']),
    accountBalancesAsOf(companyId, to, ['equity']),
  ]);

  const { rows: movementRows } = await db.query(
    `SELECT coa.id AS account_id, coa.account_name, je.reference_type,
            SUM(jel.credit - jel.debit) AS net_change
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status != 'reversed'
     JOIN chart_of_accounts coa ON coa.id = jel.account_id
     WHERE coa.company_id = $1 AND coa.account_type = 'equity' AND je.entry_date BETWEEN $2 AND $3
     GROUP BY coa.id, coa.account_name, je.reference_type`,
    [companyId, from, to]
  );

  const accountIds = new Set([...openingBalances.map((a) => a.id), ...closingBalances.map((a) => a.id), ...movementRows.map((r) => r.account_id)]);
  const openingMap = new Map(openingBalances.map((a) => [a.id, a]));
  const closingMap = new Map(closingBalances.map((a) => [a.id, a]));

  const fy = await currentFinancialYearStart(companyId, to);
  let unappropriatedEarnings = 0;
  if (fy && fy.status !== 'closed') {
    const revenue = await movementBetween(companyId, fy.start_date, to, ['revenue']);
    const expense = await movementBetween(companyId, fy.start_date, to, ['expense']);
    unappropriatedEarnings = revenue.reduce((s, a) => s + a.balance, 0) - expense.reduce((s, a) => s + a.balance, 0);
  }

  const accounts = [...accountIds].map((id) => {
    const name = (closingMap.get(id) || openingMap.get(id) || movementRows.find((r) => r.account_id === id))?.account_name;
    const opening = openingMap.get(id)?.balance || 0;
    const rowsForAccount = movementRows.filter((r) => r.account_id === id);
    const profitTransferred = rowsForAccount.filter((r) => r.reference_type === 'closing').reduce((s, r) => s + Number(r.net_change), 0);
    const revaluation = rowsForAccount.filter((r) => r.reference_type === 'asset_revaluation').reduce((s, r) => s + Number(r.net_change), 0);
    const otherMovements = rowsForAccount.filter((r) => r.reference_type !== 'closing' && r.reference_type !== 'asset_revaluation').reduce((s, r) => s + Number(r.net_change), 0);
    let closing = closingMap.get(id)?.balance || 0;
    // Only Retained Earnings gets the unappropriated top-up — matching the
    // Balance Sheet's treatment exactly, not applied to every equity account.
    const isRetainedEarnings = /retained earnings/i.test(name || '');
    if (isRetainedEarnings) closing += unappropriatedEarnings;
    return { accountId: id, name, opening, profitTransferred, revaluation, otherMovements, unappropriated: isRetainedEarnings ? unappropriatedEarnings : 0, closing };
  });

  const totals = accounts.reduce((acc, a) => ({
    opening: acc.opening + a.opening,
    profitTransferred: acc.profitTransferred + a.profitTransferred,
    revaluation: acc.revaluation + a.revaluation,
    otherMovements: acc.otherMovements + a.otherMovements,
    unappropriated: acc.unappropriated + a.unappropriated,
    closing: acc.closing + a.closing,
  }), { opening: 0, profitTransferred: 0, revaluation: 0, otherMovements: 0, unappropriated: 0, closing: 0 });

  const summary = { from, to, accounts, totals, financialYearStatus: fy ? fy.status : null };

  if (req.query.format) {
    const line = (label, amount) => ({ label, amount });
    return sendExport(res, req.query.format, `statement-of-changes-in-equity-${from}-to-${to}`, {
      title: 'Statement of Changes in Equity',
      subtitle: `For the period ${from} to ${to}`,
      sections: accounts.map((a) => ({
        title: a.name,
        lines: [
          line('Opening Balance', a.opening),
          line('Profit for the Year Transferred', a.profitTransferred),
          line('Revaluation Surplus Movement', a.revaluation),
          line('Other Movements (Contributions/Drawings)', a.otherMovements),
          ...(a.unappropriated !== 0 ? [line('Current Year Earnings (Unappropriated)', a.unappropriated)] : []),
        ],
        total: { label: 'Closing Balance', amount: a.closing },
      })),
      grandTotal: { label: 'Total Equity', amount: totals.closing },
    });
  }

  res.json(summary);
});

module.exports = { cashFlowStatement, changesInEquity };
