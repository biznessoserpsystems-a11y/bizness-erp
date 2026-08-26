const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const approvalWorkflowService = require('../services/approvalWorkflowService');
const { recordAudit } = require('../middleware/auditLog');

const ENTITY_TYPES = ['purchase_requisition', 'purchase_order', 'purchase_invoice', 'sales_order', 'journal_entry', 'leave_request', 'expense_claim'];

// ---------- Workflow definitions (configuration) ----------

const listDefinitions = asyncHandler(async (req, res) => {
  const { rows: definitions } = await db.query(
    `SELECT * FROM workflow_definitions WHERE company_id = $1 ORDER BY entity_type ASC`,
    [req.user.companyId]
  );
  for (const def of definitions) {
    const { rows: steps } = await db.query(
      `SELECT * FROM workflow_steps WHERE workflow_definition_id = $1 ORDER BY step_number ASC`,
      [def.id]
    );
    def.steps = steps;
  }
  res.json(definitions);
});

// POST /workflow-definitions  { entityType, name, isActive, steps: [{ name, approverPermissionCode, minAmount }] }
const upsertDefinition = asyncHandler(async (req, res) => {
  const { entityType, name, isActive = true, steps } = req.body;
  if (!ENTITY_TYPES.includes(entityType)) throw new ApiError(400, `entityType must be one of: ${ENTITY_TYPES.join(', ')}`);
  if (!name) throw new ApiError(400, 'name is required');
  if (!Array.isArray(steps) || !steps.length) throw new ApiError(400, 'At least one approval step is required');
  steps.forEach((s, i) => {
    if (!s.approverPermissionCode) throw new ApiError(400, `Step ${i + 1} is missing approverPermissionCode`);
  });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM workflow_definitions WHERE company_id = $1 AND entity_type = $2`,
      [req.user.companyId, entityType]
    );

    let definition;
    if (existing.rows.length) {
      const { rows } = await client.query(
        `UPDATE workflow_definitions SET name = $1, is_active = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
        [name, isActive, existing.rows[0].id]
      );
      definition = rows[0];
      await client.query(`DELETE FROM workflow_steps WHERE workflow_definition_id = $1`, [definition.id]);
    } else {
      const { rows } = await client.query(
        `INSERT INTO workflow_definitions (company_id, entity_type, name, is_active) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.user.companyId, entityType, name, isActive]
      );
      definition = rows[0];
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await client.query(
        `INSERT INTO workflow_steps (workflow_definition_id, step_number, name, approver_permission_code, min_amount)
         VALUES ($1,$2,$3,$4,$5)`,
        [definition.id, i + 1, s.name || `Step ${i + 1}`, s.approverPermissionCode, s.minAmount || 0]
      );
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: existing.rows.length ? 'UPDATE' : 'CREATE', entityType: 'workflow_definition', entityId: definition.id, newValues: { entityType, name, isActive, stepCount: steps.length }, ip: req.ip });
    res.status(existing.rows.length ? 200 : 201).json(definition);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const setDefinitionActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE workflow_definitions SET is_active = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING *`,
    [!!isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Workflow definition not found');
  res.json(rows[0]);
});

// ---------- Instances (runtime approvals) ----------

const myPendingApprovals = asyncHandler(async (req, res) => {
  const rows = await approvalWorkflowService.getMyPendingApprovals(req.user.companyId, req.user.permissions);
  res.json(rows);
});

const listAllInstances = asyncHandler(async (req, res) => {
  const rows = await approvalWorkflowService.listInstancesForCompany(req.user.companyId);
  res.json(rows);
});

const getInstance = asyncHandler(async (req, res) => {
  const instance = await approvalWorkflowService.getInstanceHistory(req.params.id, req.user.companyId);
  if (!instance) throw new ApiError(404, 'Approval instance not found');
  res.json(instance);
});

// POST /workflow-instances/:id/action  { action: 'approved'|'rejected', comment }
const actOnInstance = asyncHandler(async (req, res) => {
  const { action, comment } = req.body;
  if (!['approved', 'rejected'].includes(action)) throw new ApiError(400, `action must be "approved" or "rejected"`);

  const result = await approvalWorkflowService.actOnInstance({
    instanceId: req.params.id,
    companyId: req.user.companyId,
    userId: req.user.id,
    permissions: req.user.permissions,
    action,
    comment,
  });

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'workflow_instance', entityId: req.params.id, newValues: { action, comment: comment || null }, ip: req.ip });
  res.json(result);
});

module.exports = {
  ENTITY_TYPES,
  listDefinitions,
  upsertDefinition,
  setDefinitionActive,
  myPendingApprovals,
  listAllInstances,
  getInstance,
  actOnInstance,
};
