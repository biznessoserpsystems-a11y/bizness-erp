const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendExport } = require('../services/exportService');
const { accountBalancesAsOf, movementBetween } = require('./financialStatementController');

/**
 * Shifts a YYYY-MM-DD string back exactly one calendar year (2026-01-01 ->
 * 2025-01-01, 2026-12-31 -> 2025-12-31). Used to build the "same period last
 * year" comparative column the template calls for throughout — every
 * comparative section derives from this one shift, so the prior period is
 * always the literal same date range one year back, not a rolling "last N
 * days" approximation.
 */
function shiftYearBack(dateStr) {
  const d = new Date(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function variance(current, previous) {
  const change = current - previous;
  const pctChange = previous && Math.abs(previous) > 0.0001 ? (change / Math.abs(previous)) * 100 : null;
  return { current, previous, change, pctChange };
}

function money(n) {
  return `GHS ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/**
 * Computes the full figure set (P&L, financial position, cash, ratios) for
 * one period. Called twice — once for the requested period, once for the
 * same period last year — so the comparison is never more than "call this
 * twice and diff the results", never a second parallel calculation that
 * could drift from the primary one.
 */
async function computePeriodFigures(companyId, from, to) {
  const revenue = await movementBetween(companyId, from, to, ['revenue']);
  const expenseAll = await movementBetween(companyId, from, to, ['expense']);
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

  const assetsAll = await accountBalancesAsOf(companyId, to, ['asset']);
  const liabilitiesAll = await accountBalancesAsOf(companyId, to, ['liability']);
  const equity = await accountBalancesAsOf(companyId, to, ['equity']);
  const totalAssets = assetsAll.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilitiesAll.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0) + netIncome;

  const bankAccounts = await db.query('SELECT account_id FROM bank_accounts WHERE company_id = $1', [companyId]);
  const bankAccountIds = new Set(bankAccounts.rows.map((r) => r.account_id));
  const cashAndBank = assetsAll.filter((a) => bankAccountIds.has(a.id)).reduce((s, a) => s + a.balance, 0);

  const currentAssets = assetsAll.filter((a) => a.account_subtype !== 'fixed_asset').reduce((s, a) => s + a.balance, 0);
  const currentLiabilities = liabilitiesAll.filter((a) => a.account_subtype !== 'long_term_liability').reduce((s, a) => s + a.balance, 0);
  const ratio = (n, d) => (d && Math.abs(d) > 0.0001 ? n / d : null);

  return {
    profitAndLoss: { totalRevenue, totalCogs, grossProfit, totalOperatingExpense, operatingProfit, totalFinanceCosts, profitBeforeTax, totalTaxExpense, netIncome },
    financialPosition: { totalAssets, totalLiabilities, totalEquity },
    cashAndBank,
    ratios: {
      currentRatio: ratio(currentAssets, currentLiabilities),
      netProfitMargin: ratio(netIncome, totalRevenue),
      returnOnAssets: ratio(netIncome, totalAssets),
      debtToEquity: ratio(totalLiabilities, totalEquity),
    },
  };
}

/**
 * GET /financial-statements/management-accounts?from=&to=
 * A single internal-management view that would otherwise mean visiting
 * three separate pages (Financial Statements, Banking, Financial Ratios),
 * now with the same-period-last-year comparative the template calls for
 * throughout ("IFRS-style comparative presentation"). Reuses the exact same
 * account-balance helpers the primary statements use — nothing here
 * recomputes a number a different way, so this can never drift from the
 * Statement of Profit or Loss / Statement of Financial Position on their
 * own pages, current period OR prior period.
 */
const managementAccounts = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const priorFrom = shiftYearBack(from);
  const priorTo = shiftYearBack(to);

  const current = await computePeriodFigures(req.user.companyId, from, to);
  const prior = await computePeriodFigures(req.user.companyId, priorFrom, priorTo);

  const comparison = {
    revenue: variance(current.profitAndLoss.totalRevenue, prior.profitAndLoss.totalRevenue),
    grossProfit: variance(current.profitAndLoss.grossProfit, prior.profitAndLoss.grossProfit),
    operatingProfit: variance(current.profitAndLoss.operatingProfit, prior.profitAndLoss.operatingProfit),
    netIncome: variance(current.profitAndLoss.netIncome, prior.profitAndLoss.netIncome),
    totalAssets: variance(current.financialPosition.totalAssets, prior.financialPosition.totalAssets),
    totalLiabilities: variance(current.financialPosition.totalLiabilities, prior.financialPosition.totalLiabilities),
    totalEquity: variance(current.financialPosition.totalEquity, prior.financialPosition.totalEquity),
    cashAndBank: variance(current.cashAndBank, prior.cashAndBank),
  };

  const summary = {
    from, to, priorFrom, priorTo,
    profitAndLoss: current.profitAndLoss,
    profitAndLossPrior: prior.profitAndLoss,
    financialPosition: current.financialPosition,
    financialPositionPrior: prior.financialPosition,
    cashAndBank: current.cashAndBank,
    cashAndBankPrior: prior.cashAndBank,
    ratios: current.ratios,
    ratiosPrior: prior.ratios,
    comparison,
  };

  if (req.query.format) {
    const line = (label, cur, prev) => ({ label: `${label} (Prior Year: ${money(prev)})`, amount: cur });

    const { rows: commentaryRows } = await db.query(
      `SELECT commentary FROM management_report_commentary WHERE company_id = $1 AND from_date = $2 AND to_date = $3`,
      [req.user.companyId, from, to]
    );
    const commentary = commentaryRows[0]?.commentary || '';

    return sendExport(res, req.query.format, `management-accounts-${from}-to-${to}`, {
      title: 'Management Account Report',
      subtitle: `For the period ${from} to ${to} — compared with ${priorFrom} to ${priorTo}`,
      sections: [
        {
          title: 'Executive Summary (Current vs Prior Year)',
          lines: [
            line('Revenue', current.profitAndLoss.totalRevenue, prior.profitAndLoss.totalRevenue),
            line('Gross Profit', current.profitAndLoss.grossProfit, prior.profitAndLoss.grossProfit),
            line('Operating Profit', current.profitAndLoss.operatingProfit, prior.profitAndLoss.operatingProfit),
            line('Net Profit', current.profitAndLoss.netIncome, prior.profitAndLoss.netIncome),
            line('Cash & Bank', current.cashAndBank, prior.cashAndBank),
            ...(commentary ? [{ label: `Commentary: ${commentary}`, amount: null }] : []),
          ],
        },
        {
          title: 'Comparative Income Statement',
          lines: [
            line('Revenue', current.profitAndLoss.totalRevenue, prior.profitAndLoss.totalRevenue),
            line('Cost of Sales', current.profitAndLoss.totalCogs, prior.profitAndLoss.totalCogs),
            line('Gross Profit', current.profitAndLoss.grossProfit, prior.profitAndLoss.grossProfit),
            line('Operating Expenses', current.profitAndLoss.totalOperatingExpense, prior.profitAndLoss.totalOperatingExpense),
            line('Operating Profit', current.profitAndLoss.operatingProfit, prior.profitAndLoss.operatingProfit),
            line('Finance Costs', current.profitAndLoss.totalFinanceCosts, prior.profitAndLoss.totalFinanceCosts),
            line('Income Tax Expense', current.profitAndLoss.totalTaxExpense, prior.profitAndLoss.totalTaxExpense),
          ],
          total: { label: 'Net Profit', amount: current.profitAndLoss.netIncome },
        },
        {
          title: 'Comparative Statement of Financial Position',
          lines: [
            line('Total Assets', current.financialPosition.totalAssets, prior.financialPosition.totalAssets),
            line('Total Liabilities', current.financialPosition.totalLiabilities, prior.financialPosition.totalLiabilities),
            line('Total Equity', current.financialPosition.totalEquity, prior.financialPosition.totalEquity),
          ],
        },
        {
          title: 'Key Ratios (Current vs Prior Year)',
          lines: [
            { label: 'Current Ratio', amount: current.ratios.currentRatio ?? 0 },
            { label: 'Current Ratio (Prior Year)', amount: prior.ratios.currentRatio ?? 0 },
            { label: 'Net Profit Margin (%)', amount: current.ratios.netProfitMargin ? current.ratios.netProfitMargin * 100 : 0 },
            { label: 'Net Profit Margin (Prior Year %)', amount: prior.ratios.netProfitMargin ? prior.ratios.netProfitMargin * 100 : 0 },
            { label: 'Return on Assets (%)', amount: current.ratios.returnOnAssets ? current.ratios.returnOnAssets * 100 : 0 },
            { label: 'Debt to Equity', amount: current.ratios.debtToEquity ?? 0 },
          ],
        },
      ],
    });
  }

  res.json(summary);
});

// GET /financial-statements/management-accounts/commentary?from=&to=
// Returns the saved commentary for this exact reporting period, or an empty
// string if nobody's written one yet — never a 404, since "no commentary
// yet" is a normal, expected state, not an error.
const getCommentary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const { rows } = await db.query(
    `SELECT c.commentary, c.updated_at, u.first_name, u.last_name
     FROM management_report_commentary c
     LEFT JOIN users u ON u.id = c.updated_by
     WHERE c.company_id = $1 AND c.from_date = $2 AND c.to_date = $3`,
    [req.user.companyId, from, to]
  );
  if (!rows.length) return res.json({ commentary: '', updatedAt: null, updatedBy: null });
  const row = rows[0];
  res.json({ commentary: row.commentary, updatedAt: row.updated_at, updatedBy: row.first_name ? `${row.first_name} ${row.last_name}` : null });
});

// PUT /financial-statements/management-accounts/commentary  { from, to, commentary }
const saveCommentary = asyncHandler(async (req, res) => {
  const { from, to, commentary } = req.body;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const { rows } = await db.query(
    `INSERT INTO management_report_commentary (company_id, from_date, to_date, commentary, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (company_id, from_date, to_date)
     DO UPDATE SET commentary = $4, updated_by = $5, updated_at = NOW()
     RETURNING commentary, updated_at`,
    [req.user.companyId, from, to, commentary || '', req.user.id]
  );
  res.json({ commentary: rows[0].commentary, updatedAt: rows[0].updated_at });
});

module.exports = { managementAccounts, getCommentary, saveCommentary };
