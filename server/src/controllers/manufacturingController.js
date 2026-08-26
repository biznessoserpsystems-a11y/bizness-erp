const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const stockService = require('../services/stockService');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const manufacturingSettingsService = require('../services/manufacturingSettingsService');
const { recordAudit } = require('../middleware/auditLog');
const { movementBetween, accountBalancesAsOf } = require('./financialStatementController');

// ============================================================================
// Settings
// ============================================================================

// GET /manufacturing/settings
const getManufacturingSettings = asyncHandler(async (req, res) => {
  const settings = await manufacturingSettingsService.getSettings(db, req.user.companyId);
  res.json(settings);
});

// PUT /manufacturing/settings
// { defaultWarehouseId, defaultOverheadAllocationBase, defaultCostingMethod, overheadVarianceThresholdPct }
const updateManufacturingSettings = asyncHandler(async (req, res) => {
  const {
    defaultWarehouseId, defaultOverheadAllocationBase, defaultCostingMethod, overheadVarianceThresholdPct,
  } = req.body;

  if (defaultOverheadAllocationBase !== undefined && !['labour_hours', 'units_produced'].includes(defaultOverheadAllocationBase)) {
    throw new ApiError(400, "defaultOverheadAllocationBase must be 'labour_hours' or 'units_produced'");
  }
  if (defaultCostingMethod !== undefined && !['standard', 'actual', 'job', 'process', 'abc'].includes(defaultCostingMethod)) {
    throw new ApiError(400, "defaultCostingMethod must be one of: standard, actual, job, process, abc");
  }
  if (overheadVarianceThresholdPct !== undefined && (Number(overheadVarianceThresholdPct) < 0 || Number(overheadVarianceThresholdPct) > 100)) {
    throw new ApiError(400, 'overheadVarianceThresholdPct must be between 0 and 100');
  }
  if (defaultWarehouseId) {
    const warehouse = await db.query('SELECT id FROM warehouses WHERE id = $1 AND company_id = $2', [defaultWarehouseId, req.user.companyId]);
    if (!warehouse.rows.length) throw new ApiError(400, 'defaultWarehouseId is not a warehouse belonging to this company');
  }

  // Ensure the row exists first (companies registered before this module
  // shipped, or any that skipped the migration backfill).
  await manufacturingSettingsService.getSettings(db, req.user.companyId);

  const { rows } = await db.query(
    `UPDATE manufacturing_settings SET
       default_warehouse_id = CASE WHEN $1::UUID IS NULL AND $2::BOOLEAN THEN NULL ELSE COALESCE($1, default_warehouse_id) END,
       default_overhead_allocation_base = COALESCE($3, default_overhead_allocation_base),
       default_costing_method = COALESCE($4, default_costing_method),
       overhead_variance_threshold_pct = COALESCE($5, overhead_variance_threshold_pct),
       updated_at = NOW()
     WHERE company_id = $6
     RETURNING *`,
    [defaultWarehouseId || null, defaultWarehouseId === null, defaultOverheadAllocationBase, defaultCostingMethod, overheadVarianceThresholdPct, req.user.companyId]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'manufacturing_settings', entityId: req.user.companyId, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// ============================================================================
// Bill of Materials
// ============================================================================

// GET /manufacturing/boms
const listBOMs = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, p.name AS product_name, p.sku AS product_sku,
            (SELECT COUNT(*) FROM bom_lines WHERE bom_id = b.id) AS line_count
     FROM bill_of_materials b JOIN products p ON p.id = b.product_id
     WHERE b.company_id = $1 ORDER BY b.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /manufacturing/boms/:id
const getBOM = asyncHandler(async (req, res) => {
  const bom = await db.query(
    `SELECT b.*, p.name AS product_name, p.sku AS product_sku
     FROM bill_of_materials b JOIN products p ON p.id = b.product_id
     WHERE b.id = $1 AND b.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!bom.rows.length) throw new ApiError(404, 'Bill of Materials not found');

  const lines = await db.query(
    `SELECT bl.*, p.name AS component_name, p.sku AS component_sku, p.product_type,
            COALESCE(sl.average_cost, 0) AS current_unit_cost
     FROM bom_lines bl
     JOIN products p ON p.id = bl.component_product_id
     LEFT JOIN stock_levels sl ON sl.product_id = bl.component_product_id
     WHERE bl.bom_id = $1`,
    [req.params.id]
  );
  res.json({ ...bom.rows[0], lines: lines.rows });
});

// POST /manufacturing/boms { productId, name, version, yieldQuantity, labourHoursPerBatch, lines: [{componentProductId, quantityPerBatch}] }
const createBOM = asyncHandler(async (req, res) => {
  const { productId, name, version, yieldQuantity, labourHoursPerBatch, costingMethod, lines } = req.body;
  if (!productId || !name || !Array.isArray(lines) || !lines.length) {
    throw new ApiError(400, 'productId, name, and at least one line are required');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const product = await client.query('SELECT * FROM products WHERE id = $1 AND company_id = $2', [productId, req.user.companyId]);
    if (!product.rows.length) throw new ApiError(404, 'Product not found');
    if (product.rows[0].product_type !== 'finished_good') {
      throw new ApiError(400, 'A Bill of Materials produces a finished_good product — set this product\'s type to Finished Good first');
    }

    const settings = await manufacturingSettingsService.getSettings(client, req.user.companyId);
    const bomResult = await client.query(
      `INSERT INTO bill_of_materials (company_id, product_id, name, version, yield_quantity, labour_hours_per_batch, costing_method, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.companyId, productId, name, version || '1.0', yieldQuantity || 1, labourHoursPerBatch || 0, costingMethod || settings.default_costing_method, req.user.id]
    );
    const bom = bomResult.rows[0];

    for (const line of lines) {
      if (!line.componentProductId || !line.quantityPerBatch) throw new ApiError(400, 'Each line needs componentProductId and quantityPerBatch');
      const component = await client.query('SELECT product_type FROM products WHERE id = $1 AND company_id = $2', [line.componentProductId, req.user.companyId]);
      if (!component.rows.length) throw new ApiError(404, `Component product ${line.componentProductId} not found`);
      await client.query(
        `INSERT INTO bom_lines (bom_id, component_product_id, quantity_per_batch) VALUES ($1,$2,$3)`,
        [bom.id, line.componentProductId, line.quantityPerBatch]
      );
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'bill_of_materials', entityId: bom.id, newValues: req.body, ip: req.ip });
    res.status(201).json(bom);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Manufacturing Overhead Rates (IAS 2.13 — predetermined, based on normal capacity)
// ============================================================================

// GET /manufacturing/overhead-rates
const listOverheadRates = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM manufacturing_overhead_rates WHERE company_id = $1 ORDER BY effective_from DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /manufacturing/overhead-rates { name, allocationBase, budgetedOverheadCost, normalCapacity, effectiveFrom, effectiveTo }
const createOverheadRate = asyncHandler(async (req, res) => {
  const { name, allocationBase, budgetedOverheadCost, normalCapacity, effectiveFrom, effectiveTo } = req.body;
  if (!name || !budgetedOverheadCost || !normalCapacity || !effectiveFrom) {
    throw new ApiError(400, 'name, budgetedOverheadCost, normalCapacity, and effectiveFrom are required');
  }
  if (Number(normalCapacity) <= 0) throw new ApiError(400, 'normalCapacity must be based on a real normal-capacity figure greater than zero (IAS 2.13) — it cannot be zero or actual output');

  const settings = await manufacturingSettingsService.getSettings(db, req.user.companyId);
  const { rows } = await db.query(
    `INSERT INTO manufacturing_overhead_rates (company_id, name, allocation_base, budgeted_overhead_cost, normal_capacity, effective_from, effective_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.companyId, name, allocationBase || settings.default_overhead_allocation_base, budgetedOverheadCost, normalCapacity, effectiveFrom, effectiveTo || null]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'manufacturing_overhead_rate', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// ============================================================================
// Work Orders
// ============================================================================

async function workOrderCostSummary(companyId, workOrderId) {
  const [materials, labour, overhead, abcOverhead] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(total_cost), 0) AS total FROM work_order_material_issues WHERE work_order_id = $1`, [workOrderId]),
    db.query(`SELECT COALESCE(SUM(total_cost), 0) AS total FROM work_order_labour_entries WHERE work_order_id = $1`, [workOrderId]),
    db.query(`SELECT COALESCE(SUM(applied_cost), 0) AS total FROM work_order_overhead_applications WHERE work_order_id = $1`, [workOrderId]),
    // A Work Order can carry overhead from the single predetermined rate
    // AND/OR Activity-Based Costing allocations — both are real debits to
    // this Work Order's WIP and must both be cleared at completion, or WIP
    // would never fully zero out for a Work Order costed via ABC.
    db.query(`SELECT COALESCE(SUM(allocated_cost), 0) AS total FROM work_order_abc_allocations WHERE work_order_id = $1`, [workOrderId]),
  ]);
  const materialsCost = Number(materials.rows[0].total);
  const labourCost = Number(labour.rows[0].total);
  const overheadCost = Number(overhead.rows[0].total) + Number(abcOverhead.rows[0].total);
  return { materialsCost, labourCost, overheadCost, totalCost: materialsCost + labourCost + overheadCost };
}

// GET /manufacturing/work-orders
const listWorkOrders = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT wo.*, b.name AS bom_name, p.name AS product_name, w.name AS warehouse_name
     FROM work_orders wo
     JOIN bill_of_materials b ON b.id = wo.bom_id
     JOIN products p ON p.id = b.product_id
     JOIN warehouses w ON w.id = wo.warehouse_id
     WHERE wo.company_id = $1 ORDER BY wo.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /manufacturing/work-orders/:id
const getWorkOrder = asyncHandler(async (req, res) => {
  const wo = await db.query(
    `SELECT wo.*, b.name AS bom_name, b.yield_quantity, b.labour_hours_per_batch, p.id AS product_id, p.name AS product_name,
            w.name AS warehouse_name, r.name AS overhead_rate_name, r.rate_per_unit, r.allocation_base
     FROM work_orders wo
     JOIN bill_of_materials b ON b.id = wo.bom_id
     JOIN products p ON p.id = b.product_id
     JOIN warehouses w ON w.id = wo.warehouse_id
     LEFT JOIN manufacturing_overhead_rates r ON r.id = wo.overhead_rate_id
     WHERE wo.id = $1 AND wo.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!wo.rows.length) throw new ApiError(404, 'Work order not found');

  const [materials, labour, overhead, summary] = await Promise.all([
    db.query(`SELECT wmi.*, p.name AS product_name FROM work_order_material_issues wmi JOIN products p ON p.id = wmi.product_id WHERE work_order_id = $1 ORDER BY issued_at`, [req.params.id]),
    db.query(`SELECT wle.*, e.first_name, e.last_name FROM work_order_labour_entries wle LEFT JOIN employees e ON e.id = wle.employee_id WHERE work_order_id = $1 ORDER BY logged_at`, [req.params.id]),
    db.query(`SELECT * FROM work_order_overhead_applications WHERE work_order_id = $1 ORDER BY applied_at`, [req.params.id]),
    workOrderCostSummary(req.user.companyId, req.params.id),
  ]);

  const quantityToProduce = Number(wo.rows[0].quantity_to_produce);
  res.json({
    ...wo.rows[0],
    materialIssues: materials.rows, labourEntries: labour.rows, overheadApplications: overhead.rows,
    costSummary: { ...summary, unitCostSoFar: quantityToProduce > 0 ? summary.totalCost / quantityToProduce : 0 },
  });
});

// POST /manufacturing/work-orders { bomId, warehouseId, quantityToProduce, overheadRateId, startDate, notes }
const createWorkOrder = asyncHandler(async (req, res) => {
  const { bomId, quantityToProduce, overheadRateId, startDate, notes } = req.body;
  let { warehouseId } = req.body;
  if (!bomId || !quantityToProduce) throw new ApiError(400, 'bomId and quantityToProduce are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const bom = await client.query('SELECT * FROM bill_of_materials WHERE id = $1 AND company_id = $2', [bomId, req.user.companyId]);
    if (!bom.rows.length) throw new ApiError(404, 'Bill of Materials not found');

    if (!warehouseId) {
      const settings = await manufacturingSettingsService.getSettings(client, req.user.companyId);
      warehouseId = settings.default_warehouse_id;
    }
    if (!warehouseId) {
      // No default configured under Manufacturing → Settings — fall back to
      // the company's first warehouse (same ordering as GET /warehouses)
      // rather than blocking the work order on a manual pick.
      const firstWarehouse = await client.query(
        'SELECT id FROM warehouses WHERE company_id = $1 ORDER BY name LIMIT 1', [req.user.companyId]
      );
      warehouseId = firstWarehouse.rows[0]?.id;
    }
    if (!warehouseId) throw new ApiError(400, 'warehouseId is required — this company has no warehouses set up yet');

    const workOrderNo = await salesService.generateDocNo(client, req.user.companyId, 'WO');
    const { rows } = await client.query(
      `INSERT INTO work_orders (company_id, work_order_no, bom_id, warehouse_id, quantity_to_produce, overhead_rate_id, start_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.companyId, workOrderNo, bomId, warehouseId, quantityToProduce, overheadRateId || null, startDate || new Date().toISOString().slice(0, 10), notes || null, req.user.id]
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

// POST /manufacturing/work-orders/:id/issue-materials
// Issues every BOM component, scaled to this work order's quantity, out of
// the existing shared Inventory account (via the exact same FIFO/weighted-
// average costing stockService already uses for every other stock
// movement) and into Work in Progress — IAS 2.10's direct-materials
// component of conversion cost, at real actual cost, not a standard cost.
const issueMaterialsForWorkOrder = asyncHandler(async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const woResult = await client.query('SELECT * FROM work_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!woResult.rows.length) throw new ApiError(404, 'Work order not found');
    const wo = woResult.rows[0];
    if (wo.status !== 'draft') throw new ApiError(400, `Materials have already been issued for this work order (status: ${wo.status})`);

    const bom = await client.query('SELECT * FROM bill_of_materials WHERE id = $1', [wo.bom_id]);
    const lines = await client.query('SELECT * FROM bom_lines WHERE bom_id = $1', [wo.bom_id]);
    const scale = Number(wo.quantity_to_produce) / Number(bom.rows[0].yield_quantity);

    const inventoryAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'inventory_asset');
    const wipAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'work_in_progress');

    let totalIssuedCost = 0;
    const issuedLines = [];
    for (const line of lines.rows) {
      const quantityNeeded = Number(line.quantity_per_batch) * scale;
      const movements = await stockService.issueStock(client, {
        companyId: req.user.companyId, userId: req.user.id, productId: line.component_product_id,
        warehouseId: wo.warehouse_id, quantity: quantityNeeded, movementType: 'production_issue',
        referenceType: 'work_order', referenceId: wo.id, reason: `Issued to work order ${wo.work_order_no}`,
      });
      for (const m of movements) {
        const lineCost = Number(m.quantity) * Number(m.unit_cost);
        totalIssuedCost += lineCost;
        const issueRow = await client.query(
          `INSERT INTO work_order_material_issues (work_order_id, product_id, quantity_issued, unit_cost)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [wo.id, line.component_product_id, m.quantity, m.unit_cost]
        );
        issuedLines.push(issueRow.rows[0]);
      }
    }

    if (totalIssuedCost > 0) {
      const entry = await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
        referenceType: 'work_order_materials', referenceId: wo.id,
        description: `Materials issued to work order ${wo.work_order_no}`,
        lines: [
          { accountId: wipAccountId, debit: totalIssuedCost, credit: 0 },
          { accountId: inventoryAccountId, debit: 0, credit: totalIssuedCost },
        ],
      });
      await client.query('UPDATE work_order_material_issues SET journal_entry_id = $1 WHERE work_order_id = $2 AND journal_entry_id IS NULL', [entry.id, wo.id]);
    }

    await client.query(`UPDATE work_orders SET status = 'materials_issued' WHERE id = $1`, [wo.id]);
    await client.query('COMMIT');
    res.json({ workOrderId: wo.id, status: 'materials_issued', totalMaterialsCost: totalIssuedCost, issuedLines });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /manufacturing/work-orders/:id/log-labour { hours, ratePerHour, employeeId }
const logLabourForWorkOrder = asyncHandler(async (req, res) => {
  const { hours, ratePerHour, employeeId } = req.body;
  if (!hours || !ratePerHour) throw new ApiError(400, 'hours and ratePerHour are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const woResult = await client.query('SELECT * FROM work_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!woResult.rows.length) throw new ApiError(404, 'Work order not found');
    const wo = woResult.rows[0];
    if (wo.status === 'completed' || wo.status === 'cancelled') throw new ApiError(400, `Cannot log labour on a ${wo.status} work order`);

    const totalCost = Number(hours) * Number(ratePerHour);
    const wipAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'work_in_progress');
    const labourAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'direct_labour_production');

    const entryResult = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'work_order_labour', referenceId: wo.id,
      description: `Direct labour logged to work order ${wo.work_order_no}`,
      lines: [
        { accountId: wipAccountId, debit: totalCost, credit: 0 },
        { accountId: labourAccountId, debit: 0, credit: totalCost },
      ],
    });

    const { rows } = await client.query(
      `INSERT INTO work_order_labour_entries (work_order_id, employee_id, hours, rate_per_hour, journal_entry_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [wo.id, employeeId || null, hours, ratePerHour, entryResult.id]
    );

    if (wo.status === 'materials_issued') await client.query(`UPDATE work_orders SET status = 'in_progress' WHERE id = $1`, [wo.id]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /manufacturing/work-orders/:id/apply-overhead { activityQuantity }
// Applies overhead at the work order's assigned PREDETERMINED rate x actual
// activity — IAS 2.13, never actual overhead incurred divided by actual
// output, which would let idle-capacity cost leak into inventory value.
const applyOverheadForWorkOrder = asyncHandler(async (req, res) => {
  const { activityQuantity } = req.body;
  if (!activityQuantity) throw new ApiError(400, 'activityQuantity is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const woResult = await client.query('SELECT * FROM work_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!woResult.rows.length) throw new ApiError(404, 'Work order not found');
    const wo = woResult.rows[0];
    if (!wo.overhead_rate_id) throw new ApiError(400, 'This work order has no overhead rate assigned');
    if (wo.status === 'completed' || wo.status === 'cancelled') throw new ApiError(400, `Cannot apply overhead on a ${wo.status} work order`);

    const rate = await client.query('SELECT * FROM manufacturing_overhead_rates WHERE id = $1', [wo.overhead_rate_id]);
    const appliedCost = Number(activityQuantity) * Number(rate.rows[0].rate_per_unit);

    const wipAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'work_in_progress');
    const overheadAppliedAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'manufacturing_overhead_applied');

    const entryResult = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'work_order_overhead', referenceId: wo.id,
      description: `Overhead applied to work order ${wo.work_order_no} at predetermined rate`,
      lines: [
        { accountId: wipAccountId, debit: appliedCost, credit: 0 },
        { accountId: overheadAppliedAccountId, debit: 0, credit: appliedCost },
      ],
    });

    const { rows } = await client.query(
      `INSERT INTO work_order_overhead_applications (work_order_id, overhead_rate_id, activity_quantity, applied_cost, journal_entry_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [wo.id, wo.overhead_rate_id, activityQuantity, appliedCost, entryResult.id]
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

// POST /manufacturing/work-orders/:id/complete
// Moves the accumulated WIP cost (materials + labour + overhead applied)
// into finished-goods stock at a computed full-absorption unit cost, using
// the exact same stockService.receiveStock every purchase already uses —
// so the completed product is immediately, fully sellable through the
// existing Sales Order -> Delivery -> COGS pipeline with zero changes there.
const completeWorkOrder = asyncHandler(async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const woResult = await client.query('SELECT * FROM work_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!woResult.rows.length) throw new ApiError(404, 'Work order not found');
    const wo = woResult.rows[0];
    if (wo.status === 'completed') throw new ApiError(400, 'Work order is already completed');
    if (wo.status === 'cancelled') throw new ApiError(400, 'Cannot complete a cancelled work order');
    if (wo.status === 'draft') throw new ApiError(400, 'Issue materials before completing this work order');

    const bom = await client.query('SELECT product_id FROM bill_of_materials WHERE id = $1', [wo.bom_id]);
    const productId = bom.rows[0].product_id;
    const summary = await workOrderCostSummary(req.user.companyId, wo.id);
    const quantityToProduce = Number(wo.quantity_to_produce);
    const unitCost = quantityToProduce > 0 ? summary.totalCost / quantityToProduce : 0;

    await stockService.receiveStock(client, {
      companyId: req.user.companyId, userId: req.user.id, productId, warehouseId: wo.warehouse_id,
      quantity: quantityToProduce, unitCost, movementType: 'production_receipt',
      referenceType: 'work_order', referenceId: wo.id, reason: `Completed work order ${wo.work_order_no}`,
    });

    const inventoryAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'inventory_asset');
    const wipAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'work_in_progress');
    if (summary.totalCost > 0) {
      await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
        referenceType: 'work_order_completion', referenceId: wo.id,
        description: `Work order ${wo.work_order_no} completed — ${quantityToProduce} units at ${unitCost.toFixed(4)} full absorption cost`,
        lines: [
          { accountId: inventoryAccountId, debit: summary.totalCost, credit: 0 },
          { accountId: wipAccountId, debit: 0, credit: summary.totalCost },
        ],
      });
    }

    await client.query(`UPDATE work_orders SET status = 'completed', completion_date = $1 WHERE id = $2`, [new Date().toISOString().slice(0, 10), wo.id]);
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'work_order', entityId: wo.id, newValues: { completed: true, unitCost }, ip: req.ip });
    res.json({ workOrderId: wo.id, status: 'completed', quantityProduced: quantityToProduce, totalCost: summary.totalCost, unitCost });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Cost of Goods Manufactured statement + overhead variance (period reports)
// ============================================================================

// GET /manufacturing/cogm-statement?from=&to=
// Standard COGM formula: Beginning WIP + Total Manufacturing Costs for the
// period (materials + labour + overhead applied) - Ending WIP = Cost of
// Goods Manufactured. Reuses the exact same accountBalancesAsOf helper the
// Statement of Financial Position uses for WIP's opening/closing balance,
// so this can never disagree with the Balance Sheet's own WIP figure.
const cogmStatement = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const companyId = req.user.companyId;
  const priorDay = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10);

  const [materials, labour, overheadRows, abcOverheadRows] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(wmi.total_cost), 0) AS total FROM work_order_material_issues wmi JOIN work_orders wo ON wo.id = wmi.work_order_id WHERE wo.company_id = $1 AND wmi.issued_at::date BETWEEN $2 AND $3`, [companyId, from, to]),
    db.query(`SELECT COALESCE(SUM(wle.total_cost), 0) AS total FROM work_order_labour_entries wle JOIN work_orders wo ON wo.id = wle.work_order_id WHERE wo.company_id = $1 AND wle.logged_at::date BETWEEN $2 AND $3`, [companyId, from, to]),
    db.query(`SELECT COALESCE(SUM(woa.applied_cost), 0) AS total FROM work_order_overhead_applications woa JOIN work_orders wo ON wo.id = woa.work_order_id WHERE wo.company_id = $1 AND woa.applied_at::date BETWEEN $2 AND $3`, [companyId, from, to]),
    // Overhead can also reach WIP via Activity-Based Costing allocations,
    // not just the single predetermined rate — both credit the same
    // Manufacturing Overhead Applied account, so both must count here or
    // this statement's Total Manufacturing Costs would understate what
    // actually happened to WIP for a period with any ABC-costed Work Orders.
    db.query(`SELECT COALESCE(SUM(waa.allocated_cost), 0) AS total FROM work_order_abc_allocations waa JOIN work_orders wo ON wo.id = waa.work_order_id WHERE wo.company_id = $1 AND waa.allocated_at::date BETWEEN $2 AND $3`, [companyId, from, to]),
  ]);

  const [wipStart, wipEnd] = await Promise.all([
    accountBalancesAsOf(companyId, priorDay, ['asset']),
    accountBalancesAsOf(companyId, to, ['asset']),
  ]);
  const findWip = (rows) => rows.find((a) => a.account_name === 'Work in Progress')?.balance || 0;
  const beginningWip = findWip(wipStart);
  const endingWip = findWip(wipEnd);

  const directMaterials = Number(materials.rows[0].total);
  const directLabour = Number(labour.rows[0].total);
  const manufacturingOverheadApplied = Number(overheadRows.rows[0].total) + Number(abcOverheadRows.rows[0].total);
  const totalManufacturingCosts = directMaterials + directLabour + manufacturingOverheadApplied;
  const costOfGoodsManufactured = beginningWip + totalManufacturingCosts - endingWip;

  res.json({
    from, to,
    directMaterials, directLabour, manufacturingOverheadApplied, totalManufacturingCosts,
    beginningWip, endingWip, costOfGoodsManufactured,
  });
});


// GET /manufacturing/manufacturing-account?from=&to=
// The classic "Manufacturing Account" statement (Ghana/WAEC syllabus
// format) — a different, complementary view from cogmStatement above, not
// a duplicate: this one uses ACTUAL factory overhead incurred (the real
// cost categories — rent, utilities, indirect labour, etc.), the figure a
// formal external-facing cost statement would use, whereas cogmStatement
// above uses overhead APPLIED at the predetermined rate to each work
// order (the internal job-costing figure IAS 2.13's variance analysis is
// built around). The two will only match in a period with zero overhead
// variance.
//
// Raw materials don't have their own GL account in this system (see
// 041_manufacturing.sql's design note — they share the same Inventory
// account regular trading goods use, to avoid touching the existing GRN/
// Purchase Invoice flow at all). So Opening/Closing Raw Materials here are
// reconstructed from stock_movements for product_type='raw_material'
// products specifically, the same "closing is always today, opening is
// closing minus the period's net movement" approach the Statement of Cash
// Flows uses for its own opening/closing cash reconciliation — accurate
// when `to` is today, a documented approximation otherwise.
const manufacturingAccountStatement = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const companyId = req.user.companyId;
  const priorDay = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10);

  // ---- Raw Materials: Opening + Purchases - Closing = Consumed ----
  const { rows: closingRmRows } = await db.query(
    `SELECT COALESCE(SUM(sl.quantity * sl.average_cost), 0) AS total
     FROM stock_levels sl JOIN products p ON p.id = sl.product_id
     WHERE p.company_id = $1 AND p.product_type = 'raw_material'`,
    [companyId]
  );
  const closingRawMaterials = Number(closingRmRows[0].total);

  const { rows: rmMovements } = await db.query(
    `SELECT sm.movement_type, sm.total_cost
     FROM stock_movements sm JOIN products p ON p.id = sm.product_id
     WHERE p.company_id = $1 AND p.product_type = 'raw_material' AND sm.created_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const RM_INBOUND = ['stock_in', 'transfer_in', 'adjustment_increase', 'sales_return'];
  const RM_OUTBOUND = ['production_issue', 'stock_out', 'transfer_out', 'adjustment_decrease', 'damaged', 'purchase_return'];
  const netRmMovement = rmMovements.reduce((s, m) => {
    if (RM_INBOUND.includes(m.movement_type)) return s + Number(m.total_cost);
    if (RM_OUTBOUND.includes(m.movement_type)) return s - Number(m.total_cost);
    return s;
  }, 0);
  const openingRawMaterials = closingRawMaterials - netRmMovement;

  const { rows: purchaseRows } = await db.query(
    `SELECT COALESCE(SUM(sm.total_cost), 0) AS total
     FROM stock_movements sm JOIN products p ON p.id = sm.product_id
     WHERE p.company_id = $1 AND p.product_type = 'raw_material' AND sm.reference_type = 'grn' AND sm.created_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const purchases = Number(purchaseRows[0].total);

  const expenseRows = await movementBetween(companyId, from, to, ['expense']);
  const carriageInward = expenseRows.find((a) => a.account_name === 'Carriage Inward')?.balance || 0;
  const directExpenses = expenseRows.find((a) => a.account_name === 'Direct Expenses (Production)')?.balance || 0;

  const rawMaterialsConsumed = openingRawMaterials + purchases + carriageInward - closingRawMaterials;

  // ---- Direct Labour (same source as cogmStatement) ----
  const { rows: labourRows } = await db.query(
    `SELECT COALESCE(SUM(wle.total_cost), 0) AS total FROM work_order_labour_entries wle
     JOIN work_orders wo ON wo.id = wle.work_order_id WHERE wo.company_id = $1 AND wle.logged_at::date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const directLabour = Number(labourRows[0].total);

  const primeCost = rawMaterialsConsumed + directLabour + directExpenses;

  // ---- Factory Overheads: ACTUAL, not applied (see header note) ----
  const factoryOverheadRows = expenseRows.filter((a) => MOH_CATEGORY_CODES.includes(a.account_code));
  const factoryOverheads = factoryOverheadRows.reduce((s, a) => s + a.balance, 0);
  const factoryOverheadsByCategory = factoryOverheadRows.map((a) => ({ category: a.account_name.replace('Manufacturing Overhead — ', ''), amount: a.balance }));

  const factoryCost = primeCost + factoryOverheads;

  // ---- WIP (same source and same "closing is real, opening is derived" pattern as cogmStatement) ----
  const [wipStart, wipEnd] = await Promise.all([
    accountBalancesAsOf(companyId, priorDay, ['asset']),
    accountBalancesAsOf(companyId, to, ['asset']),
  ]);
  const findWip = (rows) => rows.find((a) => a.account_name === 'Work in Progress')?.balance || 0;
  const openingWip = findWip(wipStart);
  const closingWip = findWip(wipEnd);

  const costOfGoodsManufactured = factoryCost + openingWip - closingWip;

  res.json({
    from, to,
    openingRawMaterials, purchases, carriageInward, closingRawMaterials, rawMaterialsConsumed,
    directLabour, directExpenses, primeCost,
    factoryOverheads, factoryOverheadsByCategory, factoryCost,
    openingWip, closingWip, costOfGoodsManufactured,
  });
});

// GET /manufacturing/overhead-variance?from=&to=
const MOH_CATEGORY_CODES = ['6061', '6062', '6063', '6064', '6065', '6066', '6067', '6068', '6069', '6071'];

async function overheadVarianceForPeriod(companyId, from, to) {
  const [expenseRows, liabilityRows] = await Promise.all([
    movementBetween(companyId, from, to, ['expense']),
    movementBetween(companyId, from, to, ['liability']),
  ]);
  const categoryRows = expenseRows.filter((a) => MOH_CATEGORY_CODES.includes(a.account_code));
  const byCategory = categoryRows.map((a) => ({ accountId: a.id, category: a.account_name.replace('Manufacturing Overhead — ', ''), amount: a.balance }));
  const actual = categoryRows.reduce((s, a) => s + a.balance, 0);

  const appliedAccount = liabilityRows.find((a) => a.account_name === 'Manufacturing Overhead Applied');
  // Applied is a liability-normal (credit) clearing account — its stored
  // `balance` (credit-normal) represents the cumulative amount applied.
  const applied = appliedAccount ? appliedAccount.balance : 0;
  return { actual, applied, byCategory, variance: actual - applied, isOverApplied: applied > actual };
}

const overheadVariance = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const [result, settings] = await Promise.all([
    overheadVarianceForPeriod(req.user.companyId, from, to),
    manufacturingSettingsService.getSettings(db, req.user.companyId),
  ]);
  const thresholdPct = Number(settings.overhead_variance_threshold_pct);
  const variancePct = result.applied > 0 ? (Math.abs(result.variance) / result.applied) * 100 : (result.variance !== 0 ? 100 : 0);
  res.json({ from, to, ...result, variancePct, thresholdPct, isSignificant: variancePct > thresholdPct });
});

// POST /manufacturing/overhead-actual { category, amount, bankAccountId, description, date }
// The recording half that was always missing: actual factory overhead
// never had anywhere to be posted to before this, so the variance report
// always showed zero actual overhead regardless of what was really spent.
const MOH_CATEGORY_MAPPING = {
  indirect_labour: 'moh_indirect_labour', factory_rent: 'moh_factory_rent', utilities: 'moh_utilities',
  insurance: 'moh_insurance', security: 'moh_security', cleaning: 'moh_cleaning',
  factory_depreciation: 'moh_factory_depreciation', factory_maintenance: 'moh_factory_maintenance',
  factory_management_salaries: 'moh_factory_management_salaries', internet: 'moh_internet',
};

const recordOverheadActual = asyncHandler(async (req, res) => {
  const { category, amount, bankAccountId, description, date } = req.body;
  if (!category || !amount || !bankAccountId) throw new ApiError(400, 'category, amount, and bankAccountId are required');
  if (!MOH_CATEGORY_MAPPING[category]) throw new ApiError(400, `category must be one of: ${Object.keys(MOH_CATEGORY_MAPPING).join(', ')}`);
  if (Number(amount) <= 0) throw new ApiError(400, 'amount must be greater than zero');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const bankAccount = await client.query('SELECT account_id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
    if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');
    const categoryAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, MOH_CATEGORY_MAPPING[category]);

    const entryDate = date || new Date().toISOString().slice(0, 10);
    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate,
      referenceType: 'manufacturing_overhead_actual',
      description: description || `Actual manufacturing overhead — ${category.replace(/_/g, ' ')}`,
      lines: [
        { accountId: categoryAccountId, debit: amount, credit: 0 },
        { accountId: bankAccount.rows[0].account_id, debit: 0, credit: amount },
      ],
    });
    await client.query('COMMIT');
    res.status(201).json({ category, amount: Number(amount), entryDate, journalEntryId: entry.id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /manufacturing/overhead-variance/close { from, to }
// Closes both clearing accounts to zero for the period and recognises the
// difference as an expense/income immediately (IAS 2.13 — unallocated
// overhead from below-normal-capacity operation is never capitalised into
// ending inventory).
const closeOverheadVariance = asyncHandler(async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM overhead_variance_closings WHERE company_id = $1 AND from_date = $2 AND to_date = $3', [req.user.companyId, from, to]);
    if (existing.rows.length) throw new ApiError(400, 'This period has already been closed');

    const { actual, applied, byCategory, variance } = await overheadVarianceForPeriod(req.user.companyId, from, to);
    if (Math.abs(variance) < 0.01) {
      throw new ApiError(400, 'Actual and applied overhead already match for this period — nothing to close');
    }

    const overheadAppliedId = await accountingService.getMappedAccountId(client, req.user.companyId, 'manufacturing_overhead_applied');
    const overheadVarianceId = await accountingService.getMappedAccountId(client, req.user.companyId, 'manufacturing_overhead_variance');

    // Clear Applied (credit-balance) to zero and each of the nine actual
    // overhead category accounts (debit-balance) to zero individually,
    // plugging the net difference to the Variance expense account.
    const lines = [{ accountId: overheadAppliedId, debit: applied, credit: 0 }];
    for (const cat of byCategory) {
      if (Math.abs(cat.amount) > 0.001) lines.push({ accountId: cat.accountId, debit: 0, credit: cat.amount });
    }
    if (variance > 0) lines.push({ accountId: overheadVarianceId, debit: variance, credit: 0 }); // under-applied: extra expense
    else lines.push({ accountId: overheadVarianceId, debit: 0, credit: -variance }); // over-applied: income/reduction

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: to,
      referenceType: 'overhead_variance_closing', description: `Overhead variance closing for ${from} to ${to}`,
      lines,
    });

    const { rows } = await client.query(
      `INSERT INTO overhead_variance_closings (company_id, from_date, to_date, actual_overhead, applied_overhead, journal_entry_id, closed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.companyId, from, to, actual, applied, entry.id, req.user.id]
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

module.exports = {
  getManufacturingSettings, updateManufacturingSettings,
  listBOMs, getBOM, createBOM,
  listOverheadRates, createOverheadRate,
  listWorkOrders, getWorkOrder, createWorkOrder,
  issueMaterialsForWorkOrder, logLabourForWorkOrder, applyOverheadForWorkOrder, completeWorkOrder,
  cogmStatement, manufacturingAccountStatement, overheadVariance, closeOverheadVariance, recordOverheadActual,
};
