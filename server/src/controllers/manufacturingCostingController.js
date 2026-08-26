const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const accountingService = require('../services/accountingService');

// ============================================================================
// BOM costing method
// ============================================================================

// PATCH /manufacturing/boms/:id/costing-method { costingMethod }
const setCostingMethod = asyncHandler(async (req, res) => {
  const { costingMethod } = req.body;
  const valid = ['standard', 'actual', 'job', 'process', 'abc'];
  if (!valid.includes(costingMethod)) throw new ApiError(400, `costingMethod must be one of: ${valid.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE bill_of_materials SET costing_method = $1 WHERE id = $2 AND company_id = $3 RETURNING *`,
    [costingMethod, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Bill of Materials not found');
  res.json(rows[0]);
});

// ============================================================================
// 1. Standard Costing — a standard cost card per BOM, compared against a
// completed Work Order's real actuals to compute variances.
// ============================================================================

// GET /manufacturing/standard-cost-cards?bomId=
const listStandardCostCards = asyncHandler(async (req, res) => {
  const { bomId } = req.query;
  const params = [req.user.companyId];
  let where = 'scc.company_id = $1';
  if (bomId) { params.push(bomId); where += ` AND scc.bom_id = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT scc.*, bom.name AS bom_name, p.name AS product_name
     FROM standard_cost_cards scc
     JOIN bill_of_materials bom ON bom.id = scc.bom_id
     JOIN products p ON p.id = bom.product_id
     WHERE ${where} ORDER BY scc.effective_from DESC`,
    params
  );
  res.json(rows);
});

// POST /manufacturing/standard-cost-cards { bomId, standardMaterialCost, standardLabourCost, standardOverheadCost, effectiveFrom }
const createStandardCostCard = asyncHandler(async (req, res) => {
  const { bomId, standardMaterialCost, standardLabourCost, standardOverheadCost, effectiveFrom } = req.body;
  if (!bomId || standardMaterialCost == null || standardLabourCost == null || standardOverheadCost == null || !effectiveFrom) {
    throw new ApiError(400, 'bomId, standardMaterialCost, standardLabourCost, standardOverheadCost, and effectiveFrom are required');
  }
  const bom = await db.query('SELECT id FROM bill_of_materials WHERE id = $1 AND company_id = $2', [bomId, req.user.companyId]);
  if (!bom.rows.length) throw new ApiError(404, 'Bill of Materials not found');

  const { rows } = await db.query(
    `INSERT INTO standard_cost_cards (company_id, bom_id, standard_material_cost, standard_labour_cost, standard_overhead_cost, effective_from, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.companyId, bomId, standardMaterialCost, standardLabourCost, standardOverheadCost, effectiveFrom, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// PATCH /manufacturing/standard-cost-cards/:id
const updateStandardCostCard = asyncHandler(async (req, res) => {
  const { standardMaterialCost, standardLabourCost, standardOverheadCost, effectiveFrom, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE standard_cost_cards SET
       standard_material_cost = COALESCE($1, standard_material_cost),
       standard_labour_cost = COALESCE($2, standard_labour_cost),
       standard_overhead_cost = COALESCE($3, standard_overhead_cost),
       effective_from = COALESCE($4, effective_from), is_active = COALESCE($5, is_active)
     WHERE id = $6 AND company_id = $7 RETURNING *`,
    [standardMaterialCost, standardLabourCost, standardOverheadCost, effectiveFrom, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Standard cost card not found');
  res.json(rows[0]);
});

// DELETE /manufacturing/standard-cost-cards/:id
const deleteStandardCostCard = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM standard_cost_cards WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Standard cost card not found');
  res.status(204).end();
});

// GET /manufacturing/work-orders/:id/standard-variance
// Compares this completed Work Order's real actual cost (materials issued +
// labour logged + overhead applied — the same figures the Work Order
// detail page already shows) against its BOM's active standard cost card,
// scaled to the quantity actually produced. Positive variance = actual
// cost was LOWER than standard (favourable); negative = actual cost was
// HIGHER than standard (unfavourable) — the conventional sign convention.
const standardVarianceForWorkOrder = asyncHandler(async (req, res) => {
  const wo = await db.query(
    `SELECT wo.*, bom.id AS bom_id FROM work_orders wo JOIN bill_of_materials bom ON bom.id = wo.bom_id
     WHERE wo.id = $1 AND wo.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!wo.rows.length) throw new ApiError(404, 'Work order not found');

  const card = await db.query(
    `SELECT * FROM standard_cost_cards WHERE bom_id = $1 AND is_active = TRUE ORDER BY effective_from DESC LIMIT 1`,
    [wo.rows[0].bom_id]
  );
  if (!card.rows.length) throw new ApiError(404, 'No active standard cost card for this Work Order\'s Bill of Materials — create one first');
  const std = card.rows[0];

  const [materials, labour, overhead] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(total_cost), 0) AS total FROM work_order_material_issues WHERE work_order_id = $1`, [req.params.id]),
    db.query(`SELECT COALESCE(SUM(total_cost), 0) AS total FROM work_order_labour_entries WHERE work_order_id = $1`, [req.params.id]),
    db.query(`SELECT COALESCE(SUM(applied_cost), 0) AS total FROM work_order_overhead_applications WHERE work_order_id = $1`, [req.params.id]),
  ]);
  const actualMaterial = Number(materials.rows[0].total);
  const actualLabour = Number(labour.rows[0].total);
  const actualOverhead = Number(overhead.rows[0].total);
  const quantity = Number(wo.rows[0].quantity_to_produce);

  const standardMaterialTotal = Number(std.standard_material_cost) * quantity;
  const standardLabourTotal = Number(std.standard_labour_cost) * quantity;
  const standardOverheadTotal = Number(std.standard_overhead_cost) * quantity;

  const materialVariance = standardMaterialTotal - actualMaterial;
  const labourVariance = standardLabourTotal - actualLabour;
  const overheadVariance = standardOverheadTotal - actualOverhead;

  res.json({
    workOrderId: req.params.id, workOrderNo: wo.rows[0].work_order_no, quantity,
    standardCostCardId: std.id, standardUnitCost: Number(std.standard_unit_cost),
    material: { standard: standardMaterialTotal, actual: actualMaterial, variance: materialVariance, isFavourable: materialVariance >= 0 },
    labour: { standard: standardLabourTotal, actual: actualLabour, variance: labourVariance, isFavourable: labourVariance >= 0 },
    overhead: { standard: standardOverheadTotal, actual: actualOverhead, variance: overheadVariance, isFavourable: overheadVariance >= 0 },
    totalStandardCost: standardMaterialTotal + standardLabourTotal + standardOverheadTotal,
    totalActualCost: actualMaterial + actualLabour + actualOverhead,
    totalVariance: materialVariance + labourVariance + overheadVariance,
  });
});

// ============================================================================
// 2. Job Costing — already what Work Orders do; this is an explicit,
// labelled report over that same real data, not new computation.
// ============================================================================

// GET /manufacturing/job-cost-report?from=&to=
const jobCostReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const { rows } = await db.query(
    `SELECT wo.id, wo.work_order_no, wo.status, wo.quantity_to_produce, wo.start_date, wo.completion_date,
            p.name AS product_name,
            COALESCE((SELECT SUM(total_cost) FROM work_order_material_issues WHERE work_order_id = wo.id), 0) AS material_cost,
            COALESCE((SELECT SUM(total_cost) FROM work_order_labour_entries WHERE work_order_id = wo.id), 0) AS labour_cost,
            COALESCE((SELECT SUM(applied_cost) FROM work_order_overhead_applications WHERE work_order_id = wo.id), 0) AS overhead_cost,
            COALESCE((SELECT SUM(allocated_cost) FROM work_order_abc_allocations WHERE work_order_id = wo.id), 0) AS abc_overhead_cost
     FROM work_orders wo
     JOIN bill_of_materials bom ON bom.id = wo.bom_id
     JOIN products p ON p.id = bom.product_id
     WHERE wo.company_id = $1 AND wo.created_at::date BETWEEN $2 AND $3
     ORDER BY wo.created_at DESC`,
    [req.user.companyId, from, to]
  );

  const jobs = rows.map((r) => {
    // A Work Order can carry overhead from the single predetermined rate
    // AND/OR ABC activity allocations (see header note on
    // allocateAbcToWorkOrder) — both count toward its real job cost.
    const overheadCost = Number(r.overhead_cost) + Number(r.abc_overhead_cost);
    const totalCost = Number(r.material_cost) + Number(r.labour_cost) + overheadCost;
    const quantity = Number(r.quantity_to_produce);
    return {
      workOrderId: r.id, jobNo: r.work_order_no, productName: r.product_name, status: r.status, quantity,
      materialCost: Number(r.material_cost), labourCost: Number(r.labour_cost), overheadCost,
      totalCost, unitCost: quantity > 0 ? totalCost / quantity : 0,
    };
  });

  res.json({ from, to, jobs, totalCostAllJobs: jobs.reduce((s, j) => s + j.totalCost, 0) });
});

// ============================================================================
// 3. Process Costing — continuous/homogeneous production tracked per
// period rather than per discrete job. Equivalent units, not raw units,
// since partly-finished units in process don't cost the same as finished
// ones.
// ============================================================================

// GET /manufacturing/process-cost-batches?bomId=
const listProcessCostBatches = asyncHandler(async (req, res) => {
  const { bomId } = req.query;
  const params = [req.user.companyId];
  let where = 'pcb.company_id = $1';
  if (bomId) { params.push(bomId); where += ` AND pcb.bom_id = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT pcb.*, bom.name AS bom_name, p.name AS product_name
     FROM process_cost_batches pcb
     JOIN bill_of_materials bom ON bom.id = pcb.bom_id
     JOIN products p ON p.id = bom.product_id
     WHERE ${where} ORDER BY pcb.period_end DESC`,
    params
  );
  const batches = rows.map((r) => {
    const equivalentUnits = Number(r.units_completed) + Number(r.units_in_process) * (Number(r.percent_complete_in_process) / 100);
    const totalCost = Number(r.material_cost) + Number(r.labour_cost) + Number(r.overhead_cost);
    return { ...r, equivalentUnits, totalCost, costPerEquivalentUnit: equivalentUnits > 0 ? totalCost / equivalentUnits : 0 };
  });
  res.json(batches);
});

// POST /manufacturing/process-cost-batches { bomId, periodStart, periodEnd, unitsCompleted, unitsInProcess, percentCompleteInProcess, materialCost, labourCost, overheadCost }
const createProcessCostBatch = asyncHandler(async (req, res) => {
  const { bomId, periodStart, periodEnd, unitsCompleted, unitsInProcess, percentCompleteInProcess, materialCost, labourCost, overheadCost } = req.body;
  if (!bomId || !periodStart || !periodEnd) throw new ApiError(400, 'bomId, periodStart, and periodEnd are required');

  const bom = await db.query('SELECT id FROM bill_of_materials WHERE id = $1 AND company_id = $2', [bomId, req.user.companyId]);
  if (!bom.rows.length) throw new ApiError(404, 'Bill of Materials not found');

  const { rows } = await db.query(
    `INSERT INTO process_cost_batches
       (company_id, bom_id, period_start, period_end, units_completed, units_in_process, percent_complete_in_process, material_cost, labour_cost, overhead_cost, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.user.companyId, bomId, periodStart, periodEnd,
      unitsCompleted || 0, unitsInProcess || 0, percentCompleteInProcess || 0,
      materialCost || 0, labourCost || 0, overheadCost || 0, req.user.id,
    ]
  );
  const b = rows[0];
  const equivalentUnits = Number(b.units_completed) + Number(b.units_in_process) * (Number(b.percent_complete_in_process) / 100);
  const totalCost = Number(b.material_cost) + Number(b.labour_cost) + Number(b.overhead_cost);
  res.status(201).json({ ...b, equivalentUnits, totalCost, costPerEquivalentUnit: equivalentUnits > 0 ? totalCost / equivalentUnits : 0 });
});

// PATCH /manufacturing/process-cost-batches/:id
const updateProcessCostBatch = asyncHandler(async (req, res) => {
  const { periodStart, periodEnd, unitsCompleted, unitsInProcess, percentCompleteInProcess, materialCost, labourCost, overheadCost } = req.body;
  const { rows } = await db.query(
    `UPDATE process_cost_batches SET
       period_start = COALESCE($1, period_start), period_end = COALESCE($2, period_end),
       units_completed = COALESCE($3, units_completed), units_in_process = COALESCE($4, units_in_process),
       percent_complete_in_process = COALESCE($5, percent_complete_in_process),
       material_cost = COALESCE($6, material_cost), labour_cost = COALESCE($7, labour_cost), overhead_cost = COALESCE($8, overhead_cost)
     WHERE id = $9 AND company_id = $10 RETURNING *`,
    [periodStart, periodEnd, unitsCompleted, unitsInProcess, percentCompleteInProcess, materialCost, labourCost, overheadCost, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Process cost batch not found');
  const b = rows[0];
  const equivalentUnits = Number(b.units_completed) + Number(b.units_in_process) * (Number(b.percent_complete_in_process) / 100);
  const totalCost = Number(b.material_cost) + Number(b.labour_cost) + Number(b.overhead_cost);
  res.json({ ...b, equivalentUnits, totalCost, costPerEquivalentUnit: equivalentUnits > 0 ? totalCost / equivalentUnits : 0 });
});

// DELETE /manufacturing/process-cost-batches/:id
const deleteProcessCostBatch = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM process_cost_batches WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Process cost batch not found');
  res.status(204).end();
});

// ============================================================================
// 4. Activity-Based Costing — overhead allocated by multiple cost drivers,
// each with its own pool and rate, rather than one single predetermined
// rate. An alternative to (not a replacement of) the existing single-rate
// overhead application — a Work Order can use either or both.
// ============================================================================

// GET /manufacturing/abc-activity-pools
const listActivityPools = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM abc_activity_pools WHERE company_id = $1 ORDER BY effective_from DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /manufacturing/abc-activity-pools { name, costDriverUnit, poolCost, totalDriverVolume, effectiveFrom }
const createActivityPool = asyncHandler(async (req, res) => {
  const { name, costDriverUnit, poolCost, totalDriverVolume, effectiveFrom } = req.body;
  if (!name || !costDriverUnit || !poolCost || !totalDriverVolume || !effectiveFrom) {
    throw new ApiError(400, 'name, costDriverUnit, poolCost, totalDriverVolume, and effectiveFrom are required');
  }
  if (Number(totalDriverVolume) <= 0) throw new ApiError(400, 'totalDriverVolume must be greater than zero');

  const { rows } = await db.query(
    `INSERT INTO abc_activity_pools (company_id, name, cost_driver_unit, pool_cost, total_driver_volume, effective_from)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.companyId, name, costDriverUnit, poolCost, totalDriverVolume, effectiveFrom]
  );
  res.status(201).json(rows[0]);
});

// PATCH /manufacturing/abc-activity-pools/:id
const updateActivityPool = asyncHandler(async (req, res) => {
  const { name, costDriverUnit, poolCost, totalDriverVolume, effectiveFrom, isActive } = req.body;
  if (totalDriverVolume !== undefined && Number(totalDriverVolume) <= 0) throw new ApiError(400, 'totalDriverVolume must be greater than zero');

  const { rows } = await db.query(
    `UPDATE abc_activity_pools SET
       name = COALESCE($1, name), cost_driver_unit = COALESCE($2, cost_driver_unit),
       pool_cost = COALESCE($3, pool_cost), total_driver_volume = COALESCE($4, total_driver_volume),
       effective_from = COALESCE($5, effective_from), is_active = COALESCE($6, is_active)
     WHERE id = $7 AND company_id = $8 RETURNING *`,
    [name, costDriverUnit, poolCost, totalDriverVolume, effectiveFrom, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Activity pool not found');
  res.json(rows[0]);
});

// DELETE /manufacturing/abc-activity-pools/:id
// Blocked by the database itself (a real FK constraint, not just an
// application check) if any Work Order has already been allocated
// overhead from this pool — deleting it would silently orphan those real
// GL-backed allocation records. Caught and turned into a clear message
// rather than a raw constraint-violation error reaching the user.
const deleteActivityPool = asyncHandler(async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM abc_activity_pools WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
    if (!rows.length) throw new ApiError(404, 'Activity pool not found');
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') throw new ApiError(400, 'This activity pool has real overhead allocations against it and cannot be deleted — mark it inactive instead');
    throw err;
  }
});

// POST /manufacturing/work-orders/:id/abc-allocations { activityPoolId, driverQuantity }
// Allocates overhead to this Work Order's WIP based on its actual
// consumption of one activity pool's driver — e.g. "this job needed 3
// machine setups" x the pool's rate per setup. Posts the same Dr WIP /
// Cr Manufacturing Overhead Applied entry the single-rate method already
// uses — ABC is an alternative way of arriving at the amount to apply,
// not a different GL treatment once applied.
const allocateAbcToWorkOrder = asyncHandler(async (req, res) => {
  const { activityPoolId, driverQuantity } = req.body;
  if (!activityPoolId || !driverQuantity) throw new ApiError(400, 'activityPoolId and driverQuantity are required');
  if (Number(driverQuantity) <= 0) throw new ApiError(400, 'driverQuantity must be greater than zero');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const wo = await client.query('SELECT * FROM work_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!wo.rows.length) throw new ApiError(404, 'Work order not found');
    if (wo.rows[0].status === 'completed' || wo.rows[0].status === 'cancelled') throw new ApiError(400, `Cannot allocate ABC overhead on a ${wo.rows[0].status} work order`);

    const pool = await client.query('SELECT * FROM abc_activity_pools WHERE id = $1 AND company_id = $2', [activityPoolId, req.user.companyId]);
    if (!pool.rows.length) throw new ApiError(404, 'Activity pool not found');

    const allocatedCost = Number(driverQuantity) * Number(pool.rows[0].rate_per_driver);
    const wipAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'work_in_progress');
    const overheadAppliedAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'manufacturing_overhead_applied');

    await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'work_order_abc_overhead', referenceId: wo.rows[0].id,
      description: `ABC overhead applied to work order ${wo.rows[0].work_order_no} — ${pool.rows[0].name} (${driverQuantity} ${pool.rows[0].cost_driver_unit})`,
      lines: [
        { accountId: wipAccountId, debit: allocatedCost, credit: 0 },
        { accountId: overheadAppliedAccountId, debit: 0, credit: allocatedCost },
      ],
    });

    const { rows } = await client.query(
      `INSERT INTO work_order_abc_allocations (work_order_id, activity_pool_id, driver_quantity, allocated_cost)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, activityPoolId, driverQuantity, allocatedCost]
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

// GET /manufacturing/work-orders/:id/abc-allocations
const getAbcAllocationsForWorkOrder = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT waa.*, p.name AS pool_name, p.cost_driver_unit
     FROM work_order_abc_allocations waa JOIN abc_activity_pools p ON p.id = waa.activity_pool_id
     WHERE waa.work_order_id = $1 ORDER BY waa.allocated_at`,
    [req.params.id]
  );
  res.json(rows);
});

module.exports = {
  setCostingMethod,
  listStandardCostCards, createStandardCostCard, updateStandardCostCard, deleteStandardCostCard, standardVarianceForWorkOrder,
  jobCostReport,
  listProcessCostBatches, createProcessCostBatch, updateProcessCostBatch, deleteProcessCostBatch,
  listActivityPools, createActivityPool, updateActivityPool, deleteActivityPool, allocateAbcToWorkOrder, getAbcAllocationsForWorkOrder,
};
