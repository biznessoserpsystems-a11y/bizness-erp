const db = require('../config/db');
const notificationService = require('./notificationService');

// Human-readable link + label per entity type, so the generic "My Approvals"
// inbox can point back to the real record without each module needing to
// know anything about the workflow engine's UI.
const ENTITY_META = {
  purchase_requisition: { label: 'Purchase Requisition', link: '/procurement/requisitions' },
  purchase_order: { label: 'Purchase Order', link: '/procurement/purchase-orders' },
  purchase_invoice: { label: 'Purchase Invoice', link: '/procurement/purchase-invoices' },
  sales_order: { label: 'Sales Order', link: '/sales/orders' },
  journal_entry: { label: 'Journal Entry', link: '/accounting/journal' },
  leave_request: { label: 'Leave Request', link: '/hr/payroll' },
  expense_claim: { label: 'Expense Claim', link: '/hr/payroll' },
};

// Each module that wants its final approve/reject decision reflected on its
// own record registers a small finalize hook here, keyed by entity_type.
// Adding a new integration (Purchase Orders, Leave Requests, ...) means
// adding one entry to this map — no changes to the engine itself.
const finalizeHandlers = {
  purchase_requisition: async (client, { entityId, status, decidedByUserId }) => {
    await client.query(
      `UPDATE purchase_requisitions SET status = $1, approved_by = $2, updated_at = NOW() WHERE id = $3`,
      [status, decidedByUserId, entityId]
    );
  },
};

function registerFinalizeHandler(entityType, handler) {
  finalizeHandlers[entityType] = handler;
}

async function getActiveDefinition(client, { companyId, entityType }) {
  const { rows } = await client.query(
    `SELECT * FROM workflow_definitions WHERE company_id = $1 AND entity_type = $2 AND is_active = TRUE`,
    [companyId, entityType]
  );
  return rows[0] || null;
}

async function getStepsForDefinition(client, definitionId) {
  const { rows } = await client.query(
    `SELECT * FROM workflow_steps WHERE workflow_definition_id = $1 ORDER BY step_number ASC`,
    [definitionId]
  );
  return rows;
}

/**
 * Call this when a module wants to route a record through approval.
 * Returns { requiresApproval: false } if the company has no active workflow
 * configured for this entity type — callers should fall back to their own
 * existing single-step approval in that case.
 */
async function submitForApproval(client, { companyId, entityType, entityId, amount = 0, submittedBy }) {
  const definition = await getActiveDefinition(client, { companyId, entityType });
  if (!definition) return { requiresApproval: false };

  const steps = await getStepsForDefinition(client, definition.id);
  const applicableSteps = steps.filter((s) => Number(amount) >= Number(s.min_amount));
  if (!applicableSteps.length) return { requiresApproval: false };

  const firstStep = applicableSteps[0];
  const { rows } = await client.query(
    `INSERT INTO workflow_instances (company_id, workflow_definition_id, entity_type, entity_id, amount, status, current_step_number, submitted_by)
     VALUES ($1,$2,$3,$4,$5,'pending',$6,$7) RETURNING *`,
    [companyId, definition.id, entityType, entityId, amount, firstStep.step_number, submittedBy || null]
  );
  const instance = rows[0];

  const meta = ENTITY_META[entityType] || { label: entityType, link: '/' };
  await notificationService.notifyUsersWithPermission(client, {
    companyId,
    permissionCode: firstStep.approver_permission_code,
    excludeUserId: submittedBy || undefined,
    type: 'approval_requested',
    title: `${meta.label} awaiting your approval`,
    body: firstStep.name || null,
    link: meta.link,
    referenceType: entityType,
    referenceId: entityId,
    createdBy: submittedBy || null,
  });

  return { requiresApproval: true, instance };
}

async function getMyPendingApprovals(companyId, permissions) {
  if (!permissions.length) return [];
  const { rows } = await db.query(
    `SELECT wi.*, ws.name AS step_name, ws.approver_permission_code, wd.name AS workflow_name, wd.entity_type AS definition_entity_type,
            u.first_name AS submitted_by_first_name, u.last_name AS submitted_by_last_name
     FROM workflow_instances wi
     JOIN workflow_steps ws ON ws.workflow_definition_id = wi.workflow_definition_id AND ws.step_number = wi.current_step_number
     JOIN workflow_definitions wd ON wd.id = wi.workflow_definition_id
     LEFT JOIN users u ON u.id = wi.submitted_by
     WHERE wi.company_id = $1 AND wi.status = 'pending' AND ws.approver_permission_code = ANY($2::text[])
     ORDER BY wi.created_at ASC`,
    [companyId, permissions]
  );
  return rows.map((r) => ({ ...r, entity_label: (ENTITY_META[r.entity_type] || {}).label || r.entity_type, entity_link: (ENTITY_META[r.entity_type] || {}).link || '/' }));
}

async function listInstancesForCompany(companyId) {
  const { rows } = await db.query(
    `SELECT wi.*, wd.name AS workflow_name, u.first_name AS submitted_by_first_name, u.last_name AS submitted_by_last_name
     FROM workflow_instances wi
     JOIN workflow_definitions wd ON wd.id = wi.workflow_definition_id
     LEFT JOIN users u ON u.id = wi.submitted_by
     WHERE wi.company_id = $1
     ORDER BY wi.created_at DESC LIMIT 200`,
    [companyId]
  );
  return rows.map((r) => ({ ...r, entity_label: (ENTITY_META[r.entity_type] || {}).label || r.entity_type }));
}

async function getInstanceHistory(instanceId, companyId) {
  const instanceResult = await db.query(`SELECT * FROM workflow_instances WHERE id = $1 AND company_id = $2`, [instanceId, companyId]);
  if (!instanceResult.rows.length) return null;
  const actions = await db.query(
    `SELECT wia.*, u.first_name, u.last_name FROM workflow_instance_actions wia
     LEFT JOIN users u ON u.id = wia.user_id
     WHERE wia.workflow_instance_id = $1 ORDER BY wia.created_at ASC`,
    [instanceId]
  );
  return { ...instanceResult.rows[0], actions: actions.rows };
}

/**
 * Approve or reject the *current* step of an instance. Throws a plain Error
 * with `.statusCode` set (matching ApiError's shape) on invalid input, so
 * controllers can pass it straight to next().
 */
async function actOnInstance({ instanceId, companyId, userId, permissions, action, comment }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM workflow_instances WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [instanceId, companyId]
    );
    const instance = rows[0];
    if (!instance) { const e = new Error('Approval instance not found'); e.statusCode = 404; throw e; }
    if (instance.status !== 'pending') { const e = new Error('This approval has already been decided'); e.statusCode = 400; throw e; }

    const stepResult = await client.query(
      `SELECT * FROM workflow_steps WHERE workflow_definition_id = $1 AND step_number = $2`,
      [instance.workflow_definition_id, instance.current_step_number]
    );
    const currentStep = stepResult.rows[0];
    if (!currentStep || !permissions.includes(currentStep.approver_permission_code)) {
      const e = new Error(`You don't hold the permission required for this approval step (${currentStep ? currentStep.approver_permission_code : 'unknown'})`);
      e.statusCode = 403;
      throw e;
    }

    await client.query(
      `INSERT INTO workflow_instance_actions (workflow_instance_id, step_number, user_id, action, comment) VALUES ($1,$2,$3,$4,$5)`,
      [instance.id, instance.current_step_number, userId, action, comment || null]
    );

    const meta = ENTITY_META[instance.entity_type] || { label: instance.entity_type, link: '/' };

    if (action === 'rejected') {
      await client.query(`UPDATE workflow_instances SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [instance.id]);
      const handler = finalizeHandlers[instance.entity_type];
      if (handler) await handler(client, { entityId: instance.entity_id, status: 'rejected', decidedByUserId: userId });
      if (instance.submitted_by) {
        await notificationService.notifyUser(client, {
          companyId, userId: instance.submitted_by, type: 'approval_decided',
          title: `${meta.label} was rejected`, body: comment || null, link: meta.link,
          referenceType: instance.entity_type, referenceId: instance.entity_id, createdBy: userId,
        });
      }
      await client.query('COMMIT');
      return { finalStatus: 'rejected' };
    }

    // action === 'approved' — find the next applicable step, if any.
    const allSteps = await getStepsForDefinition(client, instance.workflow_definition_id);
    const nextStep = allSteps.find((s) => s.step_number > instance.current_step_number && Number(instance.amount) >= Number(s.min_amount));

    if (nextStep) {
      await client.query(`UPDATE workflow_instances SET current_step_number = $1, updated_at = NOW() WHERE id = $2`, [nextStep.step_number, instance.id]);
      await notificationService.notifyUsersWithPermission(client, {
        companyId, permissionCode: nextStep.approver_permission_code, excludeUserId: userId,
        type: 'approval_requested', title: `${meta.label} awaiting your approval`, body: nextStep.name || null,
        link: meta.link, referenceType: instance.entity_type, referenceId: instance.entity_id, createdBy: userId,
      });
      await client.query('COMMIT');
      return { finalStatus: 'pending', nextStep: nextStep.step_number };
    }

    await client.query(`UPDATE workflow_instances SET status = 'approved', updated_at = NOW() WHERE id = $1`, [instance.id]);
    const handler = finalizeHandlers[instance.entity_type];
    if (handler) await handler(client, { entityId: instance.entity_id, status: 'approved', decidedByUserId: userId });
    if (instance.submitted_by) {
      await notificationService.notifyUser(client, {
        companyId, userId: instance.submitted_by, type: 'approval_decided',
        title: `${meta.label} was approved`, body: comment || null, link: meta.link,
        referenceType: instance.entity_type, referenceId: instance.entity_id, createdBy: userId,
      });
    }
    await client.query('COMMIT');
    return { finalStatus: 'approved' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  ENTITY_META,
  registerFinalizeHandler,
  submitForApproval,
  getMyPendingApprovals,
  listInstancesForCompany,
  getInstanceHistory,
  actOnInstance,
};
