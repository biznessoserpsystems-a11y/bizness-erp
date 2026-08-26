const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

// Full accounting access sees/edits everything; procurement.budget.manage
// is restricted to Cost of Sales accounts only, sales.budget.manage to
// Revenue accounts only. Checked in this order so someone holding both a
// module permission AND full accounting access gets the wider scope.
function resolveBudgetScope(req) {
  if (req.user.permissions.includes('accounting.budgets.manage')) return { scope: 'all' };
  if (req.user.permissions.includes('procurement.budget.manage')) return { scope: 'account_subtype', value: 'cogs' };
  if (req.user.permissions.includes('sales.budget.manage')) return { scope: 'account_type', value: 'revenue' };
  return null;
}

async function assertAccountInScope(companyId, accountId, scope) {
  if (scope.scope === 'all') return;
  const { rows } = await db.query(
    `SELECT account_type, account_subtype FROM chart_of_accounts WHERE id = $1 AND company_id = $2`,
    [accountId, companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Account not found');
  const account = rows[0];
  const matches = scope.scope === 'account_subtype' ? account.account_subtype === scope.value : account.account_type === scope.value;
  if (!matches) {
    throw new ApiError(403, scope.scope === 'account_subtype'
      ? 'Procurement budget access is limited to Cost of Sales accounts'
      : 'Sales budget access is limited to Revenue accounts');
  }
}

const listBudgets = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, fy.name AS financial_year_name
     FROM budgets b JOIN financial_years fy ON fy.id = b.financial_year_id
     WHERE b.company_id = $1 ORDER BY b.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getBudget = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT b.*, fy.name AS financial_year_name FROM budgets b JOIN financial_years fy ON fy.id = b.financial_year_id
     WHERE b.id = $1 AND b.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Budget not found');

  const lines = await db.query(
    `SELECT bl.*, coa.account_code, coa.account_name, fp.name AS period_name
     FROM budget_lines bl
     JOIN chart_of_accounts coa ON coa.id = bl.account_id
     JOIN fiscal_periods fp ON fp.id = bl.fiscal_period_id
     WHERE bl.budget_id = $1 ORDER BY fp.start_date, coa.account_code`,
    [id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

// POST /budgets  { financialYearId, name, lines: [{ accountId, fiscalPeriodId, budgetedAmount }] }
const createBudget = asyncHandler(async (req, res) => {
  const { financialYearId, name, lines } = req.body;
  if (!financialYearId || !name) throw new ApiError(400, 'financialYearId and name are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const budgetResult = await client.query(
      `INSERT INTO budgets (company_id, financial_year_id, name, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.companyId, financialYearId, name, req.user.id]
    );
    const budget = budgetResult.rows[0];

    for (const line of lines || []) {
      await client.query(
        `INSERT INTO budget_lines (budget_id, account_id, fiscal_period_id, budgeted_amount) VALUES ($1,$2,$3,$4)`,
        [budget.id, line.accountId, line.fiscalPeriodId, line.budgetedAmount || 0]
      );
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'budget', entityId: budget.id, newValues: { name }, ip: req.ip });
    res.status(201).json(budget);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /budgets/:id/status  { status: 'approved' }
const updateBudgetStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['draft', 'approved'].includes(status)) throw new ApiError(400, 'status must be "draft" or "approved"');

  const { rows } = await db.query('UPDATE budgets SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *', [status, id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Budget not found');
  res.json(rows[0]);
});

// GET /budgets/:id/vs-actual — compares each budget line to actual GL activity for that period
const budgetVsActual = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const budget = await db.query('SELECT * FROM budgets WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!budget.rows.length) throw new ApiError(404, 'Budget not found');

  const { rows } = await db.query(
    `SELECT bl.*, coa.account_code, coa.account_name, coa.account_type, coa.account_subtype, coa.normal_balance, fp.name AS period_name,
            fp.start_date, fp.end_date,
            COALESCE((
              SELECT SUM(CASE WHEN coa.normal_balance = 'debit' THEN jel.debit - jel.credit ELSE jel.credit - jel.debit END)
              FROM journal_entry_lines jel
              JOIN journal_entries je ON je.id = jel.journal_entry_id
              WHERE jel.account_id = bl.account_id AND je.status != 'reversed'
                AND je.entry_date BETWEEN fp.start_date AND fp.end_date
            ), 0) AS actual_amount
     FROM budget_lines bl
     JOIN chart_of_accounts coa ON coa.id = bl.account_id
     JOIN fiscal_periods fp ON fp.id = bl.fiscal_period_id
     WHERE bl.budget_id = $1
     ORDER BY fp.start_date, coa.account_code`,
    [id]
  );

  const withVariance = rows.map((r) => ({
    ...r,
    variance: Number(r.actual_amount) - Number(r.budgeted_amount),
  }));

  res.json({ budget: budget.rows[0], lines: withVariance });
});

// POST /budgets/:id/lines  { accountId, fiscalPeriodId, budgetedAmount }
// Adds a line for an account/period combination that doesn't have one yet.
// A Procurement or Sales user can only add a line for an account within
// their scope (Cost of Sales / Revenue respectively) - checked against the
// real chart of accounts, not trusted from the request.
const addBudgetLine = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountId, fiscalPeriodId, budgetedAmount } = req.body;
  if (!accountId || !fiscalPeriodId) throw new ApiError(400, 'accountId and fiscalPeriodId are required');

  const scope = resolveBudgetScope(req);
  if (!scope) throw new ApiError(403, 'No budget permission held');
  await assertAccountInScope(req.user.companyId, accountId, scope);

  const budget = await db.query('SELECT id FROM budgets WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!budget.rows.length) throw new ApiError(404, 'Budget not found');

  const { rows } = await db.query(
    `INSERT INTO budget_lines (budget_id, account_id, fiscal_period_id, budgeted_amount)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (budget_id, account_id, fiscal_period_id) DO UPDATE SET budgeted_amount = $4
     RETURNING *`,
    [id, accountId, fiscalPeriodId, budgetedAmount || 0]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'budget_line', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /budgets/:id/lines/:lineId  { budgetedAmount }
// Same scope check, applied to an existing line - a Procurement user can't
// edit a Revenue line's amount even if they somehow got its ID, and vice
// versa for Sales.
const updateBudgetLine = asyncHandler(async (req, res) => {
  const { id, lineId } = req.params;
  const { budgetedAmount } = req.body;
  if (budgetedAmount === undefined) throw new ApiError(400, 'budgetedAmount is required');

  const scope = resolveBudgetScope(req);
  if (!scope) throw new ApiError(403, 'No budget permission held');

  const existing = await db.query(
    `SELECT bl.* FROM budget_lines bl JOIN budgets b ON b.id = bl.budget_id
     WHERE bl.id = $1 AND bl.budget_id = $2 AND b.company_id = $3`,
    [lineId, id, req.user.companyId]
  );
  if (!existing.rows.length) throw new ApiError(404, 'Budget line not found');
  await assertAccountInScope(req.user.companyId, existing.rows[0].account_id, scope);

  const { rows } = await db.query(
    `UPDATE budget_lines SET budgeted_amount = $1 WHERE id = $2 RETURNING *`,
    [budgetedAmount, lineId]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'budget_line', entityId: lineId, oldValues: existing.rows[0], newValues: rows[0], ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listBudgets, getBudget, createBudget, updateBudgetStatus, budgetVsActual, addBudgetLine, updateBudgetLine };
