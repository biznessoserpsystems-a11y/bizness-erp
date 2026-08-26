const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const MANAGE_PERMISSION = { customer: 'sales.customers.manage', supplier: 'procurement.suppliers.manage' };

function assertValidRelatedType(relatedType) {
  if (!['customer', 'supplier'].includes(relatedType)) {
    throw new ApiError(400, "relatedType must be 'customer' or 'supplier'");
  }
}

async function assertRelatedRecordExists(companyId, relatedType, relatedId) {
  const table = relatedType === 'customer' ? 'customers' : 'suppliers';
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE id = $1 AND company_id = $2`, [relatedId, companyId]);
  if (!rows.length) throw new ApiError(404, `${relatedType[0].toUpperCase()}${relatedType.slice(1)} not found`);
}

// GET /communication-logs?relatedType=customer&relatedId=...
const listCommunicationLogs = asyncHandler(async (req, res) => {
  const { relatedType, relatedId } = req.query;
  assertValidRelatedType(relatedType);
  if (!relatedId) throw new ApiError(400, 'relatedId is required');

  const { rows } = await db.query(
    `SELECT cl.*, u.first_name, u.last_name
     FROM communication_logs cl
     LEFT JOIN users u ON u.id = cl.logged_by
     WHERE cl.company_id = $1 AND cl.related_type = $2 AND cl.related_id = $3
     ORDER BY cl.occurred_at DESC`,
    [req.user.companyId, relatedType, relatedId]
  );
  res.json(rows);
});

// POST /communication-logs  { relatedType, relatedId, channel, direction, subject, notes, contactName, occurredAt, followUpDate }
const createCommunicationLog = asyncHandler(async (req, res) => {
  const { relatedType, relatedId, channel, direction, subject, notes, contactName, occurredAt, followUpDate } = req.body;
  assertValidRelatedType(relatedType);
  if (!relatedId) throw new ApiError(400, 'relatedId is required');
  if (!notes) throw new ApiError(400, 'notes is required');

  const requiredPermission = MANAGE_PERMISSION[relatedType];
  if (!(req.user.permissions || []).includes(requiredPermission)) {
    throw new ApiError(403, `Missing permission: ${requiredPermission}`);
  }
  await assertRelatedRecordExists(req.user.companyId, relatedType, relatedId);

  const { rows } = await db.query(
    `INSERT INTO communication_logs
       (company_id, related_type, related_id, channel, direction, subject, notes, contact_name, occurred_at, follow_up_date, logged_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, NOW()),$10,$11) RETURNING *`,
    [
      req.user.companyId, relatedType, relatedId, channel || 'call', direction || 'outbound',
      subject || null, notes, contactName || null, occurredAt || null, followUpDate || null, req.user.id,
    ]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'communication_log', entityId: rows[0].id, newValues: { relatedType, relatedId, channel }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// DELETE /communication-logs/:id
const deleteCommunicationLog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await db.query('SELECT * FROM communication_logs WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Communication log entry not found');

  const requiredPermission = MANAGE_PERMISSION[existing.rows[0].related_type];
  if (!(req.user.permissions || []).includes(requiredPermission)) {
    throw new ApiError(403, `Missing permission: ${requiredPermission}`);
  }

  await db.query('DELETE FROM communication_logs WHERE id = $1', [id]);
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'communication_log', entityId: id, ip: req.ip });
  res.json({ message: 'Deleted' });
});

module.exports = { listCommunicationLogs, createCommunicationLog, deleteCommunicationLog };
