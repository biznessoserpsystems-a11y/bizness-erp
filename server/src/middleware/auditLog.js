const db = require('../config/db');

/**
 * Records an entry in audit_logs. Call this from controllers after a
 * successful create/update/delete/login action.
 */
async function recordAudit({ companyId, userId, action, entityType, entityId, oldValues, newValues, ip }) {
  await db.query(
    `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      companyId || null,
      userId || null,
      action,
      entityType || null,
      entityId || null,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ip || null,
    ]
  );
}

/** Records a lightweight "user did X" entry in activity_logs. */
async function recordActivity({ companyId, userId, activity, metadata, ip }) {
  await db.query(
    `INSERT INTO activity_logs (company_id, user_id, activity, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [companyId || null, userId || null, activity, metadata ? JSON.stringify(metadata) : null, ip || null]
  );
}

module.exports = { recordAudit, recordActivity };
