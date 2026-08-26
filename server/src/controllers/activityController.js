const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const TYPES = ['call', 'email', 'meeting', 'note', 'task'];

// GET /activities?customerId=... or ?leadId=...
const listActivities = asyncHandler(async (req, res) => {
  const { customerId, leadId } = req.query;
  if (!customerId && !leadId) throw new ApiError(400, 'customerId or leadId is required');

  const relatedType = customerId ? 'customer' : 'lead';
  const relatedId = customerId || leadId;

  const { rows } = await db.query(
    `SELECT a.*, u.first_name, u.last_name FROM crm_activities a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.company_id = $1 AND a.related_type = $2 AND a.related_id = $3
     ORDER BY a.created_at DESC`,
    [req.user.companyId, relatedType, relatedId]
  );
  res.json(rows);
});

// POST /activities { customerId?, leadId?, type, subject, notes, dueDate }
const createActivity = asyncHandler(async (req, res) => {
  const { customerId, leadId, type, subject, notes, dueDate } = req.body;
  if (!customerId && !leadId) throw new ApiError(400, 'customerId or leadId is required');
  if (!subject) throw new ApiError(400, 'subject is required');
  if (type && !TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${TYPES.join(', ')}`);

  const relatedType = customerId ? 'customer' : 'lead';
  const relatedId = customerId || leadId;

  const { rows } = await db.query(
    `INSERT INTO crm_activities (company_id, related_type, related_id, type, subject, notes, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, relatedType, relatedId, type || 'note', subject, notes || null, dueDate || null, req.user.id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'crm_activity', entityId: rows[0].id, newValues: { subject, type }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /activities/:id  { subject, notes, dueDate, isDone }
const updateActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { subject, notes, dueDate, isDone } = req.body;

  const { rows } = await db.query(
    `UPDATE crm_activities SET
       subject = COALESCE($1, subject), notes = COALESCE($2, notes), due_date = COALESCE($3, due_date),
       is_done = COALESCE($4, is_done), updated_at = NOW()
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [subject, notes, dueDate, isDone, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Activity not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'crm_activity', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// GET /activities/follow-ups — company-wide open follow-ups (across every
// lead and customer), for the CRM workspace's "needs attention" view. Relies
// on idx_crm_activities_followups (company_id, due_date) WHERE is_done=false.
const listFollowUps = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.*, u.first_name, u.last_name,
            l.name AS lead_name, l.lead_no,
            c.name AS customer_name, c.customer_code
     FROM crm_activities a
     LEFT JOIN users u ON u.id = a.created_by
     LEFT JOIN leads l ON a.related_type = 'lead' AND l.id = a.related_id
     LEFT JOIN customers c ON a.related_type = 'customer' AND c.id = a.related_id
     WHERE a.company_id = $1 AND a.is_done = FALSE AND a.due_date IS NOT NULL
     ORDER BY a.due_date ASC`,
    [req.user.companyId]
  );
  res.json(rows);
});

module.exports = { listActivities, createActivity, updateActivity, listFollowUps, TYPES };
