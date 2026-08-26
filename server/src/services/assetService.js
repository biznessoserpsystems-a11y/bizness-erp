const ApiError = require('../utils/ApiError');
const accountingService = require('./accountingService');

const EPSILON = 0.01;

/** Current book value (cost model or post-revaluation baseline) minus depreciation and impairment. */
function carryingAmount(asset) {
  return Number(asset.cost) - Number(asset.accumulated_depreciation) - Number(asset.accumulated_impairment);
}

function monthsBetween(periodStart, periodEnd) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  // Counts whole calendar months spanned (e.g. Jan 1 - Jan 31 => 1, Jan 1 - Mar 31 => 3).
  // This is the standard convention so a run over a full calendar month always
  // charges exactly one month's depreciation, regardless of that month's day count.
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
  return Math.max(months, 0);
}

/**
 * Computes the depreciation charge for one asset over one period, per IAS 16.
 * Never depreciates below residual value, and never depreciates before the
 * asset's depreciation_start_date or after it's already fully depreciated.
 */
function calcPeriodDepreciation(asset, periodStart, periodEnd, unitsUsed) {
  if (asset.status !== 'active') return 0;
  if (asset.depreciation_start_date && new Date(asset.depreciation_start_date) > new Date(periodEnd)) return 0;

  // If depreciation started partway through this period (the asset was
  // put into use mid-quarter, say), only the time from that start date
  // onward should count toward this charge — using the raw periodStart
  // here would silently charge depreciation for time before the asset's
  // own depreciation_start_date, directly contradicting the guarantee
  // this function documents above.
  const effectivePeriodStart = asset.depreciation_start_date && new Date(asset.depreciation_start_date) > new Date(periodStart)
    ? asset.depreciation_start_date
    : periodStart;

  const depreciableBase = Number(asset.cost) - Number(asset.residual_value);
  const remainingDepreciable = depreciableBase - Number(asset.accumulated_depreciation);
  if (remainingDepreciable <= EPSILON) return 0;

  let amount = 0;
  if (asset.depreciation_method === 'straight_line') {
    if (!asset.useful_life_years || asset.useful_life_years <= 0) {
      throw new ApiError(400, `Asset ${asset.asset_code} has no useful_life_years set for straight-line depreciation`);
    }
    const annual = depreciableBase / Number(asset.useful_life_years);
    amount = annual / 12 * monthsBetween(effectivePeriodStart, periodEnd);
  } else if (asset.depreciation_method === 'reducing_balance') {
    if (!asset.reducing_balance_rate || asset.reducing_balance_rate <= 0) {
      throw new ApiError(400, `Asset ${asset.asset_code} has no reducing_balance_rate set`);
    }
    const carrying = carryingAmount(asset);
    const monthlyRate = (Number(asset.reducing_balance_rate) / 100) / 12 * monthsBetween(effectivePeriodStart, periodEnd);
    amount = carrying * monthlyRate;
  } else if (asset.depreciation_method === 'units_of_production') {
    if (!asset.total_estimated_units || asset.total_estimated_units <= 0) {
      throw new ApiError(400, `Asset ${asset.asset_code} has no total_estimated_units set for units-of-production depreciation`);
    }
    const units = Number(unitsUsed || 0);
    if (units <= 0) return 0;
    const perUnit = depreciableBase / Number(asset.total_estimated_units);
    amount = perUnit * units;
  } else {
    throw new ApiError(400, `Unknown depreciation method "${asset.depreciation_method}"`);
  }

  return Math.max(0, Math.min(amount, remainingDepreciable));
}

/**
 * Runs depreciation for a batch of assets over one period, posting a single
 * aggregated journal entry (grouped by expense/accum-depreciation account
 * pair) plus one immutable ledger row per asset. Returns the entries created.
 * Assets that produce zero depreciation (fully depreciated, not yet started,
 * or missing units for a UOP asset) are silently skipped.
 */
async function runDepreciation(client, { companyId, userId, periodStart, periodEnd, assets, unitsByAsset = {} }) {
  const glGroups = new Map(); // key: `${expenseAccountId}|${accumDepAccountId}` -> total amount
  const perAssetAmounts = [];

  for (const asset of assets) {
    const amount = calcPeriodDepreciation(asset, periodStart, periodEnd, unitsByAsset[asset.id]);
    if (amount <= EPSILON) continue;
    perAssetAmounts.push({ asset, amount, unitsUsed: unitsByAsset[asset.id] || null });
    const key = `${asset.depreciation_expense_account_id}|${asset.accumulated_depreciation_account_id}`;
    glGroups.set(key, (glGroups.get(key) || 0) + amount);
  }

  if (perAssetAmounts.length === 0) return { journalEntry: null, entries: [] };

  const hasMappings = true; // asset categories always have their own accounts (NOT NULL columns)
  let journalEntry = null;
  if (hasMappings) {
    const lines = [];
    for (const [key, total] of glGroups.entries()) {
      const [expenseAccountId, accumDepAccountId] = key.split('|');
      lines.push({ accountId: expenseAccountId, debit: total, credit: 0, description: `Depreciation for ${periodStart} to ${periodEnd}` });
      lines.push({ accountId: accumDepAccountId, debit: 0, credit: total, description: `Depreciation for ${periodStart} to ${periodEnd}` });
    }
    journalEntry = await accountingService.postJournalEntry(client, {
      companyId, userId, entryDate: periodEnd, referenceType: 'asset_depreciation',
      description: `Depreciation run ${periodStart} to ${periodEnd}`, lines, entryNoPrefix: 'DEP',
    });
  }

  const entries = [];
  for (const { asset, amount, unitsUsed } of perAssetAmounts) {
    const newAccumDep = Number(asset.accumulated_depreciation) + amount;
    const newCarrying = Number(asset.cost) - newAccumDep - Number(asset.accumulated_impairment);
    const depreciableBase = Number(asset.cost) - Number(asset.residual_value);
    const fullyDepreciated = newAccumDep >= depreciableBase - EPSILON;

    const { rows } = await client.query(
      `INSERT INTO asset_depreciation_entries
         (company_id, asset_id, period_start, period_end, method_used, units_used, depreciation_amount,
          accumulated_depreciation_after, carrying_amount_after, journal_entry_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [companyId, asset.id, periodStart, periodEnd, asset.depreciation_method, unitsUsed, amount,
       newAccumDep, newCarrying, journalEntry?.id || null, userId]
    );
    entries.push(rows[0]);

    await client.query(
      `UPDATE fixed_assets SET accumulated_depreciation = $1,
         units_consumed_to_date = units_consumed_to_date + $2,
         status = CASE WHEN $3 THEN 'fully_depreciated' ELSE status END,
         updated_at = NOW()
       WHERE id = $4`,
      [newAccumDep, unitsUsed || 0, fullyDepreciated, asset.id]
    );
  }

  return { journalEntry, entries };
}

/**
 * Records a revaluation event under the IAS 16 revaluation model (IAS 16.31-42),
 * using the "eliminate accumulated depreciation against gross carrying amount"
 * restatement approach (IAS 16.35(b)): the asset's cost is reset to the new
 * fair value and accumulated depreciation is reset to zero.
 *
 * - An increase reverses any of this asset's own prior revaluation decreases
 *   that were recognised in profit or loss (up to that balance), crediting the
 *   remainder to the Revaluation Surplus equity account (IAS 16.39).
 * - A decrease is debited first against this asset's existing revaluation
 *   surplus balance, with any excess recognised as an expense in profit or
 *   loss (IAS 16.40).
 */
async function revalueAsset(client, { companyId, userId, asset, newFairValue, adjustmentDate, notes }) {
  const costBefore = Number(asset.cost);
  const accumDepBefore = Number(asset.accumulated_depreciation);
  const carryingBefore = carryingAmount(asset);
  const diff = Number(newFairValue) - carryingBefore;

  const surplusBefore = Number(asset.revaluation_surplus_balance);
  const priorPlDecreaseBefore = Number(asset.revaluation_pl_decrease_balance || 0);

  const lines = [];
  let amountToOci = 0;
  let amountToPl = 0;

  const assetAdjust = Number(newFairValue) - costBefore; // net change to the gross cost/asset account
  if (assetAdjust > EPSILON) lines.push({ accountId: asset.asset_account_id, debit: assetAdjust, credit: 0, description: 'Revaluation of asset' });
  else if (assetAdjust < -EPSILON) lines.push({ accountId: asset.asset_account_id, debit: 0, credit: -assetAdjust, description: 'Revaluation of asset' });

  if (accumDepBefore > EPSILON) {
    lines.push({ accountId: asset.accumulated_depreciation_account_id, debit: accumDepBefore, credit: 0, description: 'Eliminate accumulated depreciation on revaluation' });
  }

  if (diff > EPSILON) {
    const reversalToPl = Math.min(diff, priorPlDecreaseBefore);
    const remainderToOci = diff - reversalToPl;
    amountToPl = reversalToPl;
    amountToOci = remainderToOci;
    if (reversalToPl > EPSILON) {
      lines.push({ accountId: asset.impairment_reversal_gain_account_id, debit: 0, credit: reversalToPl, description: 'Reversal of previously expensed revaluation decrease' });
    }
    if (remainderToOci > EPSILON) {
      lines.push({ accountId: asset.revaluation_surplus_account_id, debit: 0, credit: remainderToOci, description: 'Revaluation surplus' });
    }
  } else if (diff < -EPSILON) {
    const decrease = -diff;
    const absorbedByOci = Math.min(decrease, surplusBefore);
    const excessToPl = decrease - absorbedByOci;
    amountToOci = -absorbedByOci;
    amountToPl = -excessToPl;
    if (absorbedByOci > EPSILON) {
      lines.push({ accountId: asset.revaluation_surplus_account_id, debit: absorbedByOci, credit: 0, description: 'Revaluation decrease absorbed against surplus' });
    }
    if (excessToPl > EPSILON) {
      lines.push({ accountId: asset.impairment_loss_account_id, debit: excessToPl, credit: 0, description: 'Revaluation decrease in excess of surplus' });
    }
  }

  let journalEntry = null;
  if (lines.length >= 2) {
    journalEntry = await accountingService.postJournalEntry(client, {
      companyId, userId, entryDate: adjustmentDate, referenceType: 'asset_revaluation', referenceId: asset.id,
      description: `Revaluation of ${asset.asset_code} — ${asset.name}`, lines, entryNoPrefix: 'REVAL',
    });
  }

  const newSurplusBalance = surplusBefore + (diff > 0 ? amountToOci : amountToOci); // amountToOci already signed correctly above
  const newPriorPlDecrease = diff > 0 ? priorPlDecreaseBefore - amountToPl : priorPlDecreaseBefore + Math.max(-amountToPl, 0);

  await client.query(
    `UPDATE fixed_assets SET cost = $1, accumulated_depreciation = 0, measurement_model = 'revaluation',
       revaluation_surplus_balance = $2, revaluation_pl_decrease_balance = $3, last_revaluation_date = $4, updated_at = NOW()
     WHERE id = $5`,
    [newFairValue, newSurplusBalance, newPriorPlDecrease, adjustmentDate, asset.id]
  );

  const { rows } = await client.query(
    `INSERT INTO asset_value_adjustments
       (company_id, asset_id, adjustment_type, adjustment_date, carrying_amount_before, new_amount, amount_to_oci, amount_to_pl, notes, journal_entry_id, created_by)
     VALUES ($1,$2,'revaluation',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [companyId, asset.id, adjustmentDate, carryingBefore, newFairValue, amountToOci, amountToPl, notes || null, journalEntry?.id || null, userId]
  );

  return { adjustment: rows[0], journalEntry };
}

/**
 * Records an IAS 36 impairment loss or reversal for a cost-model asset.
 * Reversals are capped at the depreciated historical cost the asset would
 * have had absent the original impairment (IAS 36.117) — approximated here
 * as original cost less depreciation charged to date, which is the standard
 * simplification when a separate "what-if" depreciation schedule isn't kept.
 */
async function assessImpairment(client, { companyId, userId, asset, recoverableAmount, adjustmentDate, notes }) {
  if (asset.measurement_model !== 'cost') {
    throw new ApiError(400, 'Use the revaluation action for assets carried under the revaluation model; impairment there is a revaluation decrease.');
  }
  const carryingBefore = carryingAmount(asset);
  const historicalCostCap = Number(asset.original_cost) - Number(asset.accumulated_depreciation);
  const lines = [];
  let adjustmentType, amountToPl = 0;

  if (Number(recoverableAmount) < carryingBefore - EPSILON) {
    const loss = carryingBefore - Number(recoverableAmount);
    adjustmentType = 'impairment';
    amountToPl = -loss;
    lines.push({ accountId: asset.impairment_loss_account_id, debit: loss, credit: 0, description: `Impairment of ${asset.asset_code}` });
    lines.push({ accountId: asset.accumulated_depreciation_account_id, debit: 0, credit: loss, description: `Impairment of ${asset.asset_code}` });
    await client.query(`UPDATE fixed_assets SET accumulated_impairment = accumulated_impairment + $1, updated_at = NOW() WHERE id = $2`, [loss, asset.id]);
  } else if (Number(recoverableAmount) > carryingBefore + EPSILON) {
    const uncappedReversal = Number(recoverableAmount) - carryingBefore;
    const reversal = Math.min(uncappedReversal, Number(asset.accumulated_impairment), Math.max(historicalCostCap - carryingBefore, 0));
    if (reversal <= EPSILON) {
      throw new ApiError(400, 'No impairment reversal is available: either nothing was previously impaired, or the historical-cost cap has already been reached');
    }
    adjustmentType = 'impairment_reversal';
    amountToPl = reversal;
    lines.push({ accountId: asset.accumulated_depreciation_account_id, debit: reversal, credit: 0, description: `Reversal of impairment on ${asset.asset_code}` });
    lines.push({ accountId: asset.impairment_reversal_gain_account_id, debit: 0, credit: reversal, description: `Reversal of impairment on ${asset.asset_code}` });
    await client.query(`UPDATE fixed_assets SET accumulated_impairment = accumulated_impairment - $1, updated_at = NOW() WHERE id = $2`, [reversal, asset.id]);
  } else {
    throw new ApiError(400, 'Recoverable amount is equal to carrying amount; no impairment or reversal to record');
  }

  const journalEntry = await accountingService.postJournalEntry(client, {
    companyId, userId, entryDate: adjustmentDate, referenceType: `asset_${adjustmentType}`, referenceId: asset.id,
    description: `${adjustmentType === 'impairment' ? 'Impairment' : 'Impairment reversal'} of ${asset.asset_code} — ${asset.name}`, lines, entryNoPrefix: 'IMP',
  });

  const { rows } = await client.query(
    `INSERT INTO asset_value_adjustments
       (company_id, asset_id, adjustment_type, adjustment_date, carrying_amount_before, new_amount, amount_to_oci, amount_to_pl, notes, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10) RETURNING *`,
    [companyId, asset.id, adjustmentType, adjustmentDate, carryingBefore, recoverableAmount, amountToPl, notes || null, journalEntry.id, userId]
  );

  return { adjustment: rows[0], journalEntry };
}

/**
 * Derecognises an asset (IAS 16.67-72): the gain or loss (proceeds less
 * carrying amount) goes to profit or loss. Any remaining revaluation surplus
 * for the asset is transferred straight to retained earnings, never through
 * profit or loss (IAS 16.41).
 */
async function disposeAsset(client, { companyId, userId, asset, disposalDate, disposalMethod, proceeds, cashAccountId, notes }) {
  const carrying = carryingAmount(asset);
  const gainLoss = Number(proceeds || 0) - carrying;
  const accumDepAndImpairment = Number(asset.accumulated_depreciation) + Number(asset.accumulated_impairment);

  const lines = [];
  if (Number(proceeds) > EPSILON) {
    lines.push({ accountId: cashAccountId, debit: Number(proceeds), credit: 0, description: `Disposal proceeds — ${asset.asset_code}` });
  }
  if (accumDepAndImpairment > EPSILON) {
    lines.push({ accountId: asset.accumulated_depreciation_account_id, debit: accumDepAndImpairment, credit: 0, description: `Clear accumulated depreciation/impairment — ${asset.asset_code}` });
  }
  lines.push({ accountId: asset.asset_account_id, debit: 0, credit: Number(asset.cost), description: `Derecognise asset — ${asset.asset_code}` });

  if (gainLoss > EPSILON) {
    lines.push({ accountId: asset.disposal_gain_account_id, debit: 0, credit: gainLoss, description: `Gain on disposal — ${asset.asset_code}` });
  } else if (gainLoss < -EPSILON) {
    lines.push({ accountId: asset.disposal_loss_account_id, debit: -gainLoss, credit: 0, description: `Loss on disposal — ${asset.asset_code}` });
  }

  const surplusBalance = Number(asset.revaluation_surplus_balance);
  if (surplusBalance > EPSILON) {
    lines.push({ accountId: asset.revaluation_surplus_account_id, debit: surplusBalance, credit: 0, description: `Transfer remaining revaluation surplus — ${asset.asset_code}` });
    lines.push({ accountId: asset.retained_earnings_account_id, debit: 0, credit: surplusBalance, description: `Transfer remaining revaluation surplus — ${asset.asset_code}` });
  }

  const journalEntry = await accountingService.postJournalEntry(client, {
    companyId, userId, entryDate: disposalDate, referenceType: 'asset_disposal', referenceId: asset.id,
    description: `Disposal of ${asset.asset_code} — ${asset.name}`, lines, entryNoPrefix: 'DISP',
  });

  const { rows } = await client.query(
    `INSERT INTO asset_disposals
       (company_id, asset_id, disposal_date, disposal_method, proceeds, carrying_amount_at_disposal, gain_loss_amount, revaluation_surplus_transferred, notes, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [companyId, asset.id, disposalDate, disposalMethod, proceeds || 0, carrying, gainLoss, surplusBalance, notes || null, journalEntry.id, userId]
  );

  await client.query(
    `UPDATE fixed_assets SET status = 'disposed', disposed_at = NOW(), revaluation_surplus_balance = 0, updated_at = NOW() WHERE id = $1`,
    [asset.id]
  );

  return { disposal: rows[0], journalEntry };
}

module.exports = {
  carryingAmount,
  calcPeriodDepreciation,
  runDepreciation,
  revalueAsset,
  assessImpairment,
  disposeAsset,
};
