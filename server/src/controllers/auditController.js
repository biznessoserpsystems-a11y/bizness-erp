const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /audit-logs?entityType=&userId=&limit=&offset=
const listAuditLogs = asyncHandler(async (req, res) => {
  const { entityType, userId, limit = 50, offset = 0 } = req.query;
  const conditions = ['al.company_id = $1'];
  const params = [req.user.companyId];

  if (entityType) {
    params.push(entityType);
    conditions.push(`al.entity_type = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`al.user_id = $${params.length}`);
  }

  params.push(Math.min(parseInt(limit, 10) || 50, 200));
  const limitIdx = params.length;
  params.push(parseInt(offset, 10) || 0);
  const offsetIdx = params.length;

  const { rows } = await db.query(
    `SELECT al.*, u.first_name, u.last_name, u.email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY al.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  res.json(rows);
});

// GET /activity-logs
const listActivityLogs = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const { rows } = await db.query(
    `SELECT al.*, u.first_name, u.last_name
     FROM activity_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.company_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.companyId, Math.min(parseInt(limit, 10) || 50, 200), parseInt(offset, 10) || 0]
  );
  res.json(rows);
});

module.exports = { listAuditLogs, listActivityLogs };
