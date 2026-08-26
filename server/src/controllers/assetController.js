const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');
const accountingService = require('../services/accountingService');
const assetService = require('../services/assetService');

// ================== Asset Categories ==================

const listCategories = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, a.account_code AS asset_account_code, a.account_name AS asset_account_name,
            d.account_code AS accum_dep_account_code, e.account_code AS expense_account_code
     FROM asset_categories c
     JOIN chart_of_accounts a ON a.id = c.asset_account_id
     JOIN chart_of_accounts d ON d.id = c.accumulated_depreciation_account_id
     JOIN chart_of_accounts e ON e.id = c.depreciation_expense_account_id
     WHERE c.company_id = $1 ORDER BY c.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createCategory = asyncHandler(async (req, res) => {
  const { name, description, defaultDepreciationMethod, defaultUsefulLifeYears, defaultResidualPct,
    assetAccountId, accumulatedDepreciationAccountId, depreciationExpenseAccountId } = req.body;
  if (!name || !assetAccountId || !accumulatedDepreciationAccountId || !depreciationExpenseAccountId) {
    throw new ApiError(400, 'name, assetAccountId, accumulatedDepreciationAccountId, and depreciationExpenseAccountId are required');
  }
  const { rows } = await db.query(
    `INSERT INTO asset_categories (company_id, name, description, default_depreciation_method, default_useful_life_years,
       default_residual_pct, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.companyId, name, description || null, defaultDepreciationMethod || 'straight_line', defaultUsefulLifeYears || null,
     defaultResidualPct || 0, assetAccountId, accumulatedDepreciationAccountId, depreciationExpenseAccountId]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'asset_category', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, defaultDepreciationMethod, defaultUsefulLifeYears, defaultResidualPct, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE asset_categories SET name = COALESCE($1,name), description = COALESCE($2,description),
       default_depreciation_method = COALESCE($3,default_depreciation_method),
       default_useful_life_years = COALESCE($4,default_useful_life_years),
       default_residual_pct = COALESCE($5,default_residual_pct), is_active = COALESCE($6,is_active)
     WHERE id = $7 AND company_id = $8 RETURNING *`,
    [name, description, defaultDepreciationMethod, defaultUsefulLifeYears, defaultResidualPct, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Asset category not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'asset_category', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// ================== Fixed Asset Register ==================

const listAssets = asyncHandler(async (req, res) => {
  const { status, categoryId } = req.query;
  const conditions = ['fa.company_id = $1'];
  const params = [req.user.companyId];
  if (status) { params.push(status); conditions.push(`fa.status = $${params.length}`); }
  if (categoryId) { params.push(categoryId); conditions.push(`fa.category_id = $${params.length}`); }

  const { rows } = await db.query(
    `SELECT fa.*, c.name AS category_name, c.default_depreciation_method,
            (fa.cost - fa.accumulated_depreciation - fa.accumulated_impairment) AS carrying_amount
     FROM fixed_assets fa JOIN asset_categories c ON c.id = fa.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY fa.acquisition_date DESC`,
    params
  );
  res.json(rows);
});

/** Fetches an asset joined with its category's GL accounts (used by every posting action). */
async function getAssetWithAccounts(client, companyId, id) {
  const { rows } = await client.query(
    `SELECT fa.*, c.asset_account_id, c.accumulated_depreciation_account_id, c.depreciation_expense_account_id
     FROM fixed_assets fa JOIN asset_categories c ON c.id = fa.category_id
     WHERE fa.id = $1 AND fa.company_id = $2`,
    [id, companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Asset not found');
  return rows[0];
}

/** Attaches the global (company-wide) GL mapping account ids an asset posting action needs. */
async function withGlobalMappings(client, companyId, asset, keys) {
  const mapped = {};
  for (const key of keys) {
    mapped[key] = await accountingService.getMappedAccountId(client, companyId, key);
  }
  return {
    ...asset,
    revaluation_surplus_account_id: mapped.asset_revaluation_surplus,
    impairment_loss_account_id: mapped.asset_impairment_loss,
    impairment_reversal_gain_account_id: mapped.asset_impairment_reversal_gain,
    disposal_gain_account_id: mapped.asset_disposal_gain,
    disposal_loss_account_id: mapped.asset_disposal_loss,
    retained_earnings_account_id: mapped.retained_earnings,
  };
}

const getAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT fa.*, c.name AS category_name,
            (fa.cost - fa.accumulated_depreciation - fa.accumulated_impairment) AS carrying_amount
     FROM fixed_assets fa JOIN asset_categories c ON c.id = fa.category_id
     WHERE fa.id = $1 AND fa.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Asset not found');

  const depreciation = await db.query(
    `SELECT * FROM asset_depreciation_entries WHERE asset_id = $1 ORDER BY period_end DESC`, [id]
  );
  const adjustments = await db.query(
    `SELECT * FROM asset_value_adjustments WHERE asset_id = $1 ORDER BY adjustment_date DESC`, [id]
  );
  const disposal = await db.query(`SELECT * FROM asset_disposals WHERE asset_id = $1`, [id]);

  res.json({ ...rows[0], depreciationEntries: depreciation.rows, valueAdjustments: adjustments.rows, disposal: disposal.rows[0] || null });
});

// POST /fixed-assets  — creates the register entry, and optionally posts the acquisition journal entry.
const createAsset = asyncHandler(async (req, res) => {
  const {
    categoryId, assetCode, name, description, branchId, serialNumber, location, custodian, supplierId, purchaseInvoiceId,
    acquisitionDate, cost, residualValue, depreciationMethod, usefulLifeYears, reducingBalanceRate, totalEstimatedUnits,
    depreciationStartDate, status,
    postAcquisition, paymentSource, paymentAccountId,
  } = req.body;

  if (!categoryId || !assetCode || !name || !acquisitionDate || cost == null) {
    throw new ApiError(400, 'categoryId, assetCode, name, acquisitionDate, and cost are required');
  }

  const existing = await db.query('SELECT id FROM fixed_assets WHERE company_id = $1 AND asset_code = $2', [req.user.companyId, assetCode]);
  if (existing.rows.length) throw new ApiError(409, 'An asset with this code already exists');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const category = await client.query('SELECT * FROM asset_categories WHERE id = $1 AND company_id = $2', [categoryId, req.user.companyId]);
    if (!category.rows.length) throw new ApiError(404, 'Asset category not found');

    const { rows } = await client.query(
      `INSERT INTO fixed_assets
         (company_id, branch_id, category_id, asset_code, name, description, serial_number, location, custodian,
          supplier_id, purchase_invoice_id, acquisition_date, original_cost, cost, residual_value, depreciation_method,
          useful_life_years, reducing_balance_rate, total_estimated_units, depreciation_start_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [req.user.companyId, branchId || null, categoryId, assetCode, name, description || null, serialNumber || null,
       location || null, custodian || null, supplierId || null, purchaseInvoiceId || null, acquisitionDate, cost,
       residualValue || 0, depreciationMethod || category.rows[0].default_depreciation_method, usefulLifeYears || category.rows[0].default_useful_life_years,
       reducingBalanceRate || null, totalEstimatedUnits || null, depreciationStartDate || acquisitionDate,
       status || 'active', req.user.id]
    );
    const asset = rows[0];

    let journalEntry = null;
    if (postAcquisition) {
      const creditAccountId = paymentAccountId || await accountingService.getMappedAccountId(
        client, req.user.companyId, paymentSource === 'accounts_payable' ? 'accounts_payable' : 'cash_default'
      );
      journalEntry = await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: acquisitionDate,
        referenceType: 'asset_acquisition', referenceId: asset.id, description: `Acquisition of ${assetCode} — ${name}`,
        lines: [
          { accountId: category.rows[0].asset_account_id, debit: cost, credit: 0, description: `Acquisition of ${assetCode}` },
          { accountId: creditAccountId, debit: 0, credit: cost, description: `Acquisition of ${assetCode}` },
        ],
        entryNoPrefix: 'ASSET',
      });
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'fixed_asset', entityId: asset.id, newValues: req.body, ip: req.ip });
    res.status(201).json({ ...asset, journalEntry });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const updateAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, location, custodian, usefulLifeYears, reducingBalanceRate, totalEstimatedUnits, depreciationStartDate } = req.body;
  const { rows } = await db.query(
    `UPDATE fixed_assets SET name = COALESCE($1,name), description = COALESCE($2,description), location = COALESCE($3,location),
       custodian = COALESCE($4,custodian), useful_life_years = COALESCE($5,useful_life_years),
       reducing_balance_rate = COALESCE($6,reducing_balance_rate), total_estimated_units = COALESCE($7,total_estimated_units),
       depreciation_start_date = COALESCE($8,depreciation_start_date), updated_at = NOW()
     WHERE id = $9 AND company_id = $10 AND status != 'disposed' RETURNING *`,
    [name, description, location, custodian, usefulLifeYears, reducingBalanceRate, totalEstimatedUnits, depreciationStartDate, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Asset not found, or it has already been disposed');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'fixed_asset', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// POST /fixed-assets/depreciation-run  { periodStart, periodEnd, categoryId?, unitsByAsset? }
const runDepreciationBatch = asyncHandler(async (req, res) => {
  const { periodStart, periodEnd, categoryId, unitsByAsset } = req.body;
  if (!periodStart || !periodEnd) throw new ApiError(400, 'periodStart and periodEnd are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const params = [req.user.companyId, periodEnd];
    let categoryFilter = '';
    if (categoryId) { params.push(categoryId); categoryFilter = `AND fa.category_id = $${params.length}`; }

    const { rows: assets } = await client.query(
      `SELECT fa.*, c.asset_account_id, c.accumulated_depreciation_account_id, c.depreciation_expense_account_id
       FROM fixed_assets fa JOIN asset_categories c ON c.id = fa.category_id
       WHERE fa.company_id = $1 AND fa.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM asset_depreciation_entries e WHERE e.asset_id = fa.id AND e.period_end = $2)
         ${categoryFilter}
       FOR UPDATE OF fa`,
      params
    );

    const result = await assetService.runDepreciation(client, {
      companyId: req.user.companyId, userId: req.user.id, periodStart, periodEnd, assets, unitsByAsset: unitsByAsset || {},
    });

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'asset_depreciation_run', entityId: result.journalEntry?.id || null, newValues: { periodStart, periodEnd, assetsProcessed: result.entries.length }, ip: req.ip });
    res.json({
      message: result.entries.length ? `Depreciation posted for ${result.entries.length} asset(s).` : 'No assets required depreciation for this period.',
      entries: result.entries, journalEntry: result.journalEntry,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /fixed-assets/:id/revalue  { newFairValue, adjustmentDate, notes }
const revalueAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newFairValue, adjustmentDate, notes } = req.body;
  if (newFairValue == null || !adjustmentDate) throw new ApiError(400, 'newFairValue and adjustmentDate are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    let asset = await getAssetWithAccounts(client, req.user.companyId, id);
    if (asset.status === 'disposed') throw new ApiError(400, 'Cannot revalue a disposed asset');
    asset = await withGlobalMappings(client, req.user.companyId, asset, ['asset_revaluation_surplus', 'asset_impairment_reversal_gain', 'asset_impairment_loss']);

    const result = await assetService.revalueAsset(client, { companyId: req.user.companyId, userId: req.user.id, asset, newFairValue, adjustmentDate, notes });
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'asset_revaluation', entityId: id, newValues: { newFairValue }, ip: req.ip });
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /fixed-assets/:id/impair  { recoverableAmount, adjustmentDate, notes }
const assessImpairment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { recoverableAmount, adjustmentDate, notes } = req.body;
  if (recoverableAmount == null || !adjustmentDate) throw new ApiError(400, 'recoverableAmount and adjustmentDate are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    let asset = await getAssetWithAccounts(client, req.user.companyId, id);
    if (asset.status === 'disposed') throw new ApiError(400, 'Cannot assess impairment on a disposed asset');
    asset = await withGlobalMappings(client, req.user.companyId, asset, ['asset_impairment_loss', 'asset_impairment_reversal_gain']);

    const result = await assetService.assessImpairment(client, { companyId: req.user.companyId, userId: req.user.id, asset, recoverableAmount, adjustmentDate, notes });
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'asset_impairment', entityId: id, newValues: { recoverableAmount }, ip: req.ip });
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /fixed-assets/:id/dispose  { disposalDate, disposalMethod, proceeds, paymentAccountId, notes }
const disposeAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { disposalDate, disposalMethod, proceeds, paymentAccountId, notes } = req.body;
  if (!disposalDate) throw new ApiError(400, 'disposalDate is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    let asset = await getAssetWithAccounts(client, req.user.companyId, id);
    if (asset.status === 'disposed') throw new ApiError(400, 'This asset has already been disposed');
    asset = await withGlobalMappings(client, req.user.companyId, asset, ['asset_disposal_gain', 'asset_disposal_loss', 'retained_earnings']);

    const cashAccountId = paymentAccountId || (Number(proceeds) > 0
      ? await accountingService.getMappedAccountId(client, req.user.companyId, 'cash_default')
      : null);

    const result = await assetService.disposeAsset(client, {
      companyId: req.user.companyId, userId: req.user.id, asset, disposalDate,
      disposalMethod: disposalMethod || 'sale', proceeds: proceeds || 0, cashAccountId, notes,
    });
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'asset_disposal', entityId: id, newValues: { disposalDate, proceeds }, ip: req.ip });
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ================== Reports ==================

// GET /asset-reports/register — full register with NBV, grouped implicitly by category via ORDER BY
const assetRegisterReport = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT fa.asset_code, fa.name, c.name AS category_name, fa.acquisition_date, fa.original_cost, fa.cost,
            fa.accumulated_depreciation, fa.accumulated_impairment,
            (fa.cost - fa.accumulated_depreciation - fa.accumulated_impairment) AS carrying_amount,
            fa.measurement_model, fa.status
     FROM fixed_assets fa JOIN asset_categories c ON c.id = fa.category_id
     WHERE fa.company_id = $1
     ORDER BY c.name, fa.acquisition_date`,
    [req.user.companyId]
  );
  const totals = rows.reduce((acc, r) => ({
    cost: acc.cost + Number(r.cost),
    accumulated_depreciation: acc.accumulated_depreciation + Number(r.accumulated_depreciation),
    accumulated_impairment: acc.accumulated_impairment + Number(r.accumulated_impairment),
    carrying_amount: acc.carrying_amount + Number(r.carrying_amount),
  }), { cost: 0, accumulated_depreciation: 0, accumulated_impairment: 0, carrying_amount: 0 });
  res.json({ assets: rows, totals });
});

// GET /asset-reports/depreciation-history?from=&to=
const depreciationHistoryReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const params = [req.user.companyId];
  let dateFilter = '';
  if (from) { params.push(from); dateFilter += ` AND e.period_end >= $${params.length}`; }
  if (to) { params.push(to); dateFilter += ` AND e.period_end <= $${params.length}`; }

  const { rows } = await db.query(
    `SELECT e.*, fa.asset_code, fa.name AS asset_name, c.name AS category_name
     FROM asset_depreciation_entries e
     JOIN fixed_assets fa ON fa.id = e.asset_id
     JOIN asset_categories c ON c.id = fa.category_id
     WHERE e.company_id = $1 ${dateFilter}
     ORDER BY e.period_end DESC, fa.asset_code`,
    params
  );
  res.json(rows);
});

// GET /asset-reports/disposals
const disposalsReport = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.*, fa.asset_code, fa.name AS asset_name, c.name AS category_name
     FROM asset_disposals d
     JOIN fixed_assets fa ON fa.id = d.asset_id
     JOIN asset_categories c ON c.id = fa.category_id
     WHERE d.company_id = $1
     ORDER BY d.disposal_date DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// ================== Asset Assignments (company-wide) ==================
// The employee-scoped create/return endpoints live in hrPayrollController
// (added alongside Onboarding's equipment allocation step). These
// complement them with a whole-register view, matching how the rest of
// this module reports on fixed_assets.

const OVERDUE_CASE = `(aa.returned_date IS NULL AND aa.expected_return_date IS NOT NULL AND aa.expected_return_date < CURRENT_DATE)`;

// GET /asset-assignments?status=current|returned|overdue
const listAllAssetAssignments = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const conditions = ['aa.company_id = $1'];
  if (status === 'current') conditions.push('aa.returned_date IS NULL');
  else if (status === 'returned') conditions.push('aa.returned_date IS NOT NULL');
  else if (status === 'overdue') conditions.push(OVERDUE_CASE);
  else if (status) throw new ApiError(400, 'status must be one of: current, returned, overdue');

  const { rows } = await db.query(
    `SELECT aa.*, fa.asset_code, fa.name AS asset_name, e.first_name, e.last_name, e.employee_no,
            ${OVERDUE_CASE} AS is_overdue
     FROM asset_assignments aa
     JOIN fixed_assets fa ON fa.id = aa.asset_id
     JOIN employees e ON e.id = aa.employee_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY (aa.returned_date IS NULL) DESC, aa.assigned_date DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /fixed-assets/:id/assignments — assignment history for one asset
const getAssetAssignmentHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT aa.*, e.first_name, e.last_name, e.employee_no,
            ${OVERDUE_CASE} AS is_overdue
     FROM asset_assignments aa JOIN employees e ON e.id = aa.employee_id
     WHERE aa.company_id = $1 AND aa.asset_id = $2
     ORDER BY aa.assigned_date DESC`,
    [req.user.companyId, id]
  );
  res.json(rows);
});

// POST /asset-assignments/:id/transfer { newEmployeeId, expectedReturnDate, notes }
// Returns the current assignment and creates a new one in a single step —
// the common case of equipment moving directly from one person to another.
const transferAssetAssignment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newEmployeeId, expectedReturnDate, notes } = req.body;
  if (!newEmployeeId) throw new ApiError(400, 'newEmployeeId is required');

  const current = await db.query('SELECT * FROM asset_assignments WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!current.rows.length) throw new ApiError(404, 'Asset assignment not found');
  if (current.rows[0].returned_date) throw new ApiError(400, 'This assignment has already been returned');

  const newEmp = await db.query('SELECT 1 FROM employees WHERE id = $1 AND company_id = $2', [newEmployeeId, req.user.companyId]);
  if (!newEmp.rows.length) throw new ApiError(404, 'Employee not found');
  if (newEmployeeId === current.rows[0].employee_id) throw new ApiError(400, 'This asset is already assigned to that employee');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE asset_assignments SET returned_date = CURRENT_DATE WHERE id = $1', [id]);
    const { rows } = await client.query(
      `INSERT INTO asset_assignments (company_id, asset_id, employee_id, assigned_date, expected_return_date, notes, created_by)
       VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6) RETURNING *`,
      [req.user.companyId, current.rows[0].asset_id, newEmployeeId, expectedReturnDate || null, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /asset-reports/assignment-summary
const assignmentSummaryReport = asyncHandler(async (req, res) => {
  const totals = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM fixed_assets WHERE company_id = $1 AND status != 'disposed') AS total_active_assets,
       (SELECT COUNT(*)::int FROM asset_assignments aa WHERE aa.company_id = $1 AND aa.returned_date IS NULL) AS currently_assigned,
       (SELECT COUNT(*)::int FROM asset_assignments aa WHERE aa.company_id = $1 AND ${OVERDUE_CASE}) AS overdue`,
    [req.user.companyId]
  );
  const t = totals.rows[0];
  res.json({ ...t, available: t.total_active_assets - t.currently_assigned });
});

module.exports = {
  listCategories, createCategory, updateCategory,
  listAssets, getAsset, createAsset, updateAsset,
  runDepreciationBatch, revalueAsset, assessImpairment, disposeAsset,
  assetRegisterReport, depreciationHistoryReport, disposalsReport,
  listAllAssetAssignments, getAssetAssignmentHistory, transferAssetAssignment, assignmentSummaryReport,
};
