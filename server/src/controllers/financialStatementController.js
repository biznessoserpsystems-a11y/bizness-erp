const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendExport } = require('../services/exportService');

/**
 * Cumulative balance of an account as of a date = opening balance (dated at
 * its financial year's start) + all journal movements up to that date.
 * Assumption: opening_balances is only ever populated once, for the very
 * first year a company runs on the system — subsequent years roll forward
 * via the year-end closing process instead of a fresh opening balance row.
 * See README for this design note.
 */
async function accountBalancesAsOf(companyId, asOf, accountTypes) {
  const { rows } = await db.query(
    `SELECT coa.id, coa.account_code, coa.account_name, coa.account_type, coa.account_subtype, coa.normal_balance,
            COALESCE(ob_sum.ob_debit, 0) - COALESCE(ob_sum.ob_credit, 0) AS opening_net_debit,
            COALESCE(je_sum.je_debit, 0) - COALESCE(je_sum.je_credit, 0) AS journal_net_debit
     FROM chart_of_accounts coa
     LEFT JOIN (
       SELECT ob.account_id, SUM(ob.debit) AS ob_debit, SUM(ob.credit) AS ob_credit
       FROM opening_balances ob
       JOIN financial_years fy ON fy.id = ob.financial_year_id
       WHERE fy.start_date <= $2
       GROUP BY ob.account_id
     ) ob_sum ON ob_sum.account_id = coa.id
     LEFT JOIN (
       SELECT jel.account_id, SUM(jel.debit) AS je_debit, SUM(jel.credit) AS je_credit
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.status != 'reversed' AND je.entry_date <= $2
       GROUP BY jel.account_id
     ) je_sum ON je_sum.account_id = coa.id
     WHERE coa.company_id = $1 AND coa.account_type = ANY($3::text[])
     ORDER BY coa.account_code`,
    [companyId, asOf, accountTypes]
  );

  return rows.map((r) => {
    const netDebit = Number(r.opening_net_debit) + Number(r.journal_net_debit);
    const balance = r.normal_balance === 'debit' ? netDebit : -netDebit;
    return { ...r, balance };
  });
}

/** Revenue/expense movement between two dates (no opening balance layering — P&L accounts are period flows). */
async function movementBetween(companyId, from, to, accountTypes) {
  const { rows } = await db.query(
    `SELECT coa.id, coa.account_code, coa.account_name, coa.account_type, coa.account_subtype, coa.normal_balance,
            COALESCE(je_sum.total_debit, 0) AS total_debit, COALESCE(je_sum.total_credit, 0) AS total_credit
     FROM chart_of_accounts coa
     LEFT JOIN (
       SELECT jel.account_id, SUM(jel.debit) AS total_debit, SUM(jel.credit) AS total_credit
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.status != 'reversed' AND je.entry_date BETWEEN $2 AND $3
       GROUP BY jel.account_id
     ) je_sum ON je_sum.account_id = coa.id
     WHERE coa.company_id = $1 AND coa.account_type = ANY($4::text[])
     ORDER BY coa.account_code`,
    [companyId, from, to, accountTypes]
  );
  return rows.map((r) => {
    const netDebit = Number(r.total_debit) - Number(r.total_credit);
    const balance = r.normal_balance === 'debit' ? netDebit : -netDebit;
    return { ...r, balance };
  });
}

async function currentFinancialYearStart(companyId, asOf) {
  const { rows } = await db.query(
    `SELECT * FROM financial_years WHERE company_id = $1 AND start_date <= $2 AND end_date >= $2 ORDER BY start_date DESC LIMIT 1`,
    [companyId, asOf]
  );
  return rows[0] || null;
}

// GET /financial-statements/income-statement?from=&to=
// Structured as an IFRS (IAS 1) "by function" statement of profit or loss:
// Revenue -> COGS -> Gross Profit -> Operating Expenses -> Operating Profit
// -> Finance Costs -> Profit Before Tax -> Income Tax Expense -> Profit for
// the Period. Finance costs and tax are IAS 1.82(b)/(d) - each must be its
// own line, not buried inside "operating expenses".
const incomeStatement = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const revenue = await movementBetween(req.user.companyId, from, to, ['revenue']);
  const expenseAll = await movementBetween(req.user.companyId, from, to, ['expense']);
  const cogs = expenseAll.filter((a) => a.account_subtype === 'cogs');
  const financeCosts = expenseAll.filter((a) => a.account_subtype === 'finance_cost');
  const taxExpense = expenseAll.filter((a) => a.account_subtype === 'tax_expense');
  const operatingExpense = expenseAll.filter((a) => !['cogs', 'finance_cost', 'tax_expense'].includes(a.account_subtype));

  const totalRevenue = revenue.reduce((s, a) => s + a.balance, 0);
  const totalCogs = cogs.reduce((s, a) => s + a.balance, 0);
  const totalOperatingExpense = operatingExpense.reduce((s, a) => s + a.balance, 0);
  const totalFinanceCosts = financeCosts.reduce((s, a) => s + a.balance, 0);
  const totalTaxExpense = taxExpense.reduce((s, a) => s + a.balance, 0);
  const grossProfit = totalRevenue - totalCogs;
  const operatingProfit = grossProfit - totalOperatingExpense;
  const profitBeforeTax = operatingProfit - totalFinanceCosts;
  const netIncome = profitBeforeTax - totalTaxExpense;

  if (req.query.format) {
    return sendExport(res, req.query.format, `income-statement-${from}-to-${to}`, {
      title: 'Statement of Profit or Loss',
      subtitle: `For the period ${from} to ${to} (IFRS presentation, classification of expenses by function)`,
      sections: [
        { title: 'Revenue', lines: revenue.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Total Revenue', amount: totalRevenue } },
        { title: 'Cost of Sales', lines: cogs.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Gross Profit', amount: grossProfit } },
        { title: 'Operating Expenses', lines: operatingExpense.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Operating Profit', amount: operatingProfit } },
        { title: 'Finance Costs', lines: financeCosts.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Profit Before Tax', amount: profitBeforeTax } },
        { title: 'Income Tax Expense', lines: taxExpense.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Profit for the Period', amount: netIncome } },
      ],
      grandTotal: { label: 'Profit for the Period', amount: netIncome },
    });
  }

  res.json({
    from, to, revenue, cogs, operatingExpense, financeCosts, taxExpense,
    totals: {
      totalRevenue, totalCogs, grossProfit, totalOperatingExpense, operatingProfit,
      totalFinanceCosts, profitBeforeTax, totalTaxExpense, netIncome,
    },
  });
});

// GET /financial-statements/balance-sheet?asOf=
// Structured as an IFRS (IAS 1.60-76) statement of financial position with
// a current/non-current split on both assets and liabilities. Non-current
// is presented first, current second, matching the common IFRS illustrative
// ordering (ascending liquidity) rather than the current-first US GAAP
// convention - IAS 1 doesn't mandate an order, only that the split exists,
// but this keeps a single consistent convention across the statement.
const balanceSheet = asyncHandler(async (req, res) => {
  const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);

  const assetsAll = await accountBalancesAsOf(req.user.companyId, asOf, ['asset']);
  const liabilitiesAll = await accountBalancesAsOf(req.user.companyId, asOf, ['liability']);
  const equity = await accountBalancesAsOf(req.user.companyId, asOf, ['equity']);

  // Anything without an explicit subtype defaults to current — safer than
  // silently dropping an account from both totals if it predates subtype
  // classification (e.g. a custom account a company added by hand).
  const nonCurrentAssets = assetsAll.filter((a) => a.account_subtype === 'fixed_asset');
  const currentAssets = assetsAll.filter((a) => a.account_subtype !== 'fixed_asset');
  const nonCurrentLiabilities = liabilitiesAll.filter((a) => a.account_subtype === 'long_term_liability');
  const currentLiabilities = liabilitiesAll.filter((a) => a.account_subtype !== 'long_term_liability');

  const fy = await currentFinancialYearStart(req.user.companyId, asOf);
  let currentYearEarnings = 0;
  if (fy) {
    const revenue = await movementBetween(req.user.companyId, fy.start_date, asOf, ['revenue']);
    const expense = await movementBetween(req.user.companyId, fy.start_date, asOf, ['expense']);
    currentYearEarnings = revenue.reduce((s, a) => s + a.balance, 0) - expense.reduce((s, a) => s + a.balance, 0);
  }

  const totalNonCurrentAssets = nonCurrentAssets.reduce((s, a) => s + a.balance, 0);
  const totalCurrentAssets = currentAssets.reduce((s, a) => s + a.balance, 0);
  const totalAssets = totalNonCurrentAssets + totalCurrentAssets;
  const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((s, a) => s + a.balance, 0);
  const totalCurrentLiabilities = currentLiabilities.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = totalNonCurrentLiabilities + totalCurrentLiabilities;
  const totalEquityExCurrent = equity.reduce((s, a) => s + a.balance, 0);
  const totalEquity = totalEquityExCurrent + currentYearEarnings;

  if (req.query.format) {
    const equityLines = equity.map((a) => ({ label: a.account_name, amount: a.balance }));
    if (Math.abs(currentYearEarnings) > 0.001) equityLines.push({ label: 'Current Year Earnings', amount: currentYearEarnings });
    return sendExport(res, req.query.format, `balance-sheet-${asOf}`, {
      title: 'Statement of Financial Position',
      subtitle: `As of ${asOf} (IFRS presentation)`,
      sections: [
        { title: 'Non-current Assets', lines: nonCurrentAssets.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Total Non-current Assets', amount: totalNonCurrentAssets } },
        { title: 'Current Assets', lines: currentAssets.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Total Current Assets', amount: totalCurrentAssets } },
        { title: 'Non-current Liabilities', lines: nonCurrentLiabilities.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Total Non-current Liabilities', amount: totalNonCurrentLiabilities } },
        { title: 'Current Liabilities', lines: currentLiabilities.map((a) => ({ label: a.account_name, amount: a.balance })), total: { label: 'Total Current Liabilities', amount: totalCurrentLiabilities } },
        { title: 'Equity', lines: equityLines, total: { label: 'Total Equity', amount: totalEquity } },
      ],
      grandTotal: { label: 'Total Liabilities & Equity', amount: totalLiabilities + totalEquity },
    });
  }

  res.json({
    asOf,
    // Flat arrays, kept for existing consumers that just want "every asset
    // account" regardless of current/non-current (Dashboard.jsx and
    // AccountingWorkspace.jsx both filter these by bank account id to get
    // a cash total) - the split versions below are what the statement
    // itself renders.
    assets: assetsAll, liabilities: liabilitiesAll,
    nonCurrentAssets, currentAssets, nonCurrentLiabilities, currentLiabilities, equity,
    currentYearEarnings,
    totals: {
      totalNonCurrentAssets, totalCurrentAssets, totalAssets,
      totalNonCurrentLiabilities, totalCurrentLiabilities, totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    },
  });
});

// GET /financial-statements/ratios?asOf=
const financialRatios = asyncHandler(async (req, res) => {
  const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);

  const assets = await accountBalancesAsOf(req.user.companyId, asOf, ['asset']);
  const liabilities = await accountBalancesAsOf(req.user.companyId, asOf, ['liability']);
  const equity = await accountBalancesAsOf(req.user.companyId, asOf, ['equity']);

  const currentAssets = assets.filter((a) => a.account_subtype === 'current_asset').reduce((s, a) => s + a.balance, 0);
  const inventory = assets.filter((a) => a.account_subtype === 'current_asset' && /inventory/i.test(a.account_name)).reduce((s, a) => s + a.balance, 0);
  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const currentLiabilities = liabilities.filter((a) => a.account_subtype === 'current_liability').reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);

  const fy = await currentFinancialYearStart(req.user.companyId, asOf);
  let totalRevenue = 0, netIncome = 0;
  if (fy) {
    const revenue = await movementBetween(req.user.companyId, fy.start_date, asOf, ['revenue']);
    const expense = await movementBetween(req.user.companyId, fy.start_date, asOf, ['expense']);
    totalRevenue = revenue.reduce((s, a) => s + a.balance, 0);
    netIncome = totalRevenue - expense.reduce((s, a) => s + a.balance, 0);
  }
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0) + netIncome;

  const ratio = (n, d) => (d && Math.abs(d) > 0.0001 ? n / d : null);

  res.json({
    asOf,
    currentRatio: ratio(currentAssets, currentLiabilities),
    quickRatio: ratio(currentAssets - inventory, currentLiabilities),
    debtToEquity: ratio(totalLiabilities, totalEquity),
    netProfitMargin: ratio(netIncome, totalRevenue),
    returnOnAssets: ratio(netIncome, totalAssets),
    returnOnEquity: ratio(netIncome, totalEquity),
    raw: { currentAssets, inventory, totalAssets, currentLiabilities, totalLiabilities, totalEquity, totalRevenue, netIncome },
  });
});

module.exports = { incomeStatement, balanceSheet, financialRatios, accountBalancesAsOf, movementBetween, currentFinancialYearStart };
