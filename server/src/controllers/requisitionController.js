const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService'); // reused for generateDocNo
const notificationService = require('../services/notificationService');
const approvalWorkflowService = require('../services/approvalWorkflowService');
const procurementSettingsService = require('../services/procurementSettingsService');
const { recordAudit } = require('../middleware/auditLog');

// Requisition lines carry no unit price (see comment below), so the
// auto-approve threshold is compared against an *estimated* value: each
// line's quantity times the product's current cost — the moving
// weighted-average from stock_levels where the product has stock on
// record, falling back to its last-known cost_price otherwise.
async function estimateRequisitionValue(client, companyId, lines) {
  let total = 0;
  for (const line of lines) {
    const { rows } = await client.query(
      `SELECT p.cost_price, COALESCE(AVG(sl.average_cost), 0) AS avg_cost
       FROM products p
       LEFT JOIN stock_levels sl ON sl.product_id = p.id
       WHERE p.id = $1 AND p.company_id = $2
       GROUP BY p.cost_price`,
      [line.productId, companyId]
    );
    const unitCost = rows.length ? (Number(rows[0].avg_cost) || Number(rows[0].cost_price) || 0) : 0;
    total += unitCost * Number(line.quantity);
  }
  return total;
}

const listRequisitions = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT pr.*, w.name AS warehouse_name, u.first_name, u.last_name
     FROM purchase_requisitions pr
     JOIN warehouses w ON w.id = pr.warehouse_id
     LEFT JOIN users u ON u.id = pr.requested_by
     WHERE pr.company_id = $1 ORDER BY pr.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getRequisition = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT pr.*, w.name AS warehouse_name
     FROM purchase_requisitions pr JOIN warehouses w ON w.id = pr.warehouse_id
     WHERE pr.id = $1 AND pr.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Requisition not found');

  const lines = await db.query(
    `SELECT prl.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol
     FROM purchase_requisition_lines prl JOIN products p ON p.id = prl.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE prl.requisition_id = $1`,
    [id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

// POST /requisitions  { warehouseId, notes, lines: [{ productId, quantity, notes }] }
const createRequisition = asyncHandler(async (req, res) => {
  const { warehouseId, notes, lines } = req.body;
  if (!warehouseId) throw new ApiError(400, 'warehouseId is required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const requisitionNo = await salesService.generateDocNo(client, req.user.companyId, 'PR');
    const headerResult = await client.query(
      `INSERT INTO purchase_requisitions (company_id, warehouse_id, requisition_no, notes, requested_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.companyId, warehouseId, requisitionNo, notes || null, req.user.id]
    );
    const requisition = headerResult.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO purchase_requisition_lines (requisition_id, product_id, quantity, notes) VALUES ($1,$2,$3,$4)`,
        [requisition.id, line.productId, line.quantity, line.notes || null]
      );
    }

    // If this company has configured a multi-step approval workflow for
    // requisitions, route it through the engine instead of the single-step
    // notify-and-approve below (requisitions carry no per-line monetary
    // amount today, so amount thresholds on steps don't apply here — every
    // step with min_amount 0 will be used).
    const workflowResult = await approvalWorkflowService.submitForApproval(client, {
      companyId: req.user.companyId, entityType: 'purchase_requisition', entityId: requisition.id,
      amount: 0, submittedBy: req.user.id,
    });

    let finalRequisition = requisition;
    if (!workflowResult.requiresApproval) {
      // No multi-step workflow configured — fall back to Procurement
      // Settings' requisition_auto_approve_limit, compared against an
      // *estimated* value (requisitions carry no per-line price). A limit
      // of 0 means "always require approval", matching the previous
      // behaviour before this setting existed.
      const settings = await procurementSettingsService.getSettings(client, req.user.companyId);
      const estimatedValue = await estimateRequisitionValue(client, req.user.companyId, lines);
      const autoApprove = Number(settings.requisition_auto_approve_limit) > 0
        && estimatedValue <= Number(settings.requisition_auto_approve_limit);

      if (autoApprove) {
        const autoResult = await client.query(
          `UPDATE purchase_requisitions SET status = 'approved', updated_at = NOW() WHERE id = $1 RETURNING *`,
          [requisition.id]
        );
        finalRequisition = autoResult.rows[0];
      } else {
        await notificationService.notifyUsersWithPermission(client, {
          companyId: req.user.companyId, permissionCode: 'procurement.requisitions.manage', excludeUserId: req.user.id,
          type: 'approval_requested', title: `Requisition ${requisitionNo} awaiting approval`,
          body: notes || null, link: '/procurement/requisitions', referenceType: 'purchase_requisition',
          referenceId: requisition.id, createdBy: req.user.id,
        });
      }
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'purchase_requisition', entityId: requisition.id, newValues: { requisitionNo }, ip: req.ip });
    res.status(201).json(finalRequisition);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /requisitions/:id/status  { status: 'approved'|'rejected' }
const updateRequisitionStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw new ApiError(400, 'status must be "approved" or "rejected"');

  const pendingWorkflow = await db.query(
    `SELECT id FROM workflow_instances WHERE entity_type = 'purchase_requisition' AND entity_id = $1 AND status = 'pending'`,
    [id]
  );
  if (pendingWorkflow.rows.length) {
    throw new ApiError(400, 'This requisition is going through an approval workflow — use the Approval Workflows inbox to act on it.');
  }

  const { rows } = await db.query(
    `UPDATE purchase_requisitions SET status = $1, approved_by = $2, updated_at = NOW()
     WHERE id = $3 AND company_id = $4 AND status = 'submitted' RETURNING *`,
    [status, req.user.id, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Requisition not found or already actioned');
  const requisition = rows[0];

  if (requisition.requested_by && requisition.requested_by !== req.user.id) {
    await notificationService.notifyUser(db, {
      companyId: req.user.companyId, userId: requisition.requested_by,
      type: 'approval_decided', title: `Requisition ${requisition.requisition_no} was ${status}`,
      link: '/procurement/requisitions', referenceType: 'purchase_requisition', referenceId: requisition.id, createdBy: req.user.id,
    });
  }

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'purchase_requisition', entityId: id, newValues: { status }, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listRequisitions, getRequisition, createRequisition, updateRequisitionStatus };
