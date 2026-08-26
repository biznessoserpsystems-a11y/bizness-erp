const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const STATUSES = ['open', 'done', 'cancelled'];
const PRIORITIES = ['low', 'normal', 'high'];
const RELATED_TYPES = ['customer', 'supplier', 'invoice', 'lead'];

function canManageAll(user) {
  return (user.permissions || []).includes('tasks.manage_all');
}

// A task is visible to a user if they created it, it's assigned to them,
// or they hold tasks.manage_all (company-wide visibility).
function visibilityClause(user, paramOffset) {
  if (canManageAll(user)) return { clause: '', params: [] };
  return {
    clause: `AND (t.assigned_to = $${paramOffset} OR t.created_by = $${paramOffset})`,
    params: [user.id],
  };
}

// GET /tasks?status=open&assignedTo=me
const listTasks = asyncHandler(async (req, res) => {
  const { status, assignedTo } = req.query;
  const conditions = ['t.company_id = $1'];
  const params = [req.user.companyId];

  if (status) {
    if (!STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${STATUSES.join(', ')}`);
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (assignedTo === 'me') {
    params.push(req.user.id);
    conditions.push(`t.assigned_to = $${params.length}`);
  } else if (!canManageAll(req.user)) {
    // Without tasks.manage_all, you only ever see tasks you created or are assigned to.
    params.push(req.user.id);
    conditions.push(`(t.assigned_to = $${params.length} OR t.created_by = $${params.length})`);
  }

  const { rows } = await db.query(
    `SELECT t.*, a.first_name AS assignee_first_name, a.last_name AS assignee_last_name,
            c.first_name AS creator_first_name, c.last_name AS creator_last_name
     FROM tasks t
     LEFT JOIN users a ON a.id = t.assigned_to
     LEFT JOIN users c ON c.id = t.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY (t.due_date IS NULL), t.due_date ASC, t.created_at DESC`,
    params
  );
  res.json(rows);
});

// POST /tasks { title, notes, dueDate, priority, assignedTo, relatedType, relatedId }
const createTask = asyncHandler(async (req, res) => {
  const { title, notes, dueDate, priority, assignedTo, relatedType, relatedId } = req.body;
  if (!title) throw new ApiError(400, 'title is required');
  if (priority && !PRIORITIES.includes(priority)) throw new ApiError(400, `priority must be one of: ${PRIORITIES.join(', ')}`);
  if (relatedType && !RELATED_TYPES.includes(relatedType)) throw new ApiError(400, `relatedType must be one of: ${RELATED_TYPES.join(', ')}`);
  if (assignedTo && assignedTo !== req.user.id && !canManageAll(req.user)) {
    throw new ApiError(403, 'You need tasks.manage_all to assign a task to someone else');
  }

  const { rows } = await db.query(
    `INSERT INTO tasks (company_id, title, notes, priority, due_date, assigned_to, related_type, related_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.companyId, title, notes || null, priority || 'normal', dueDate || null,
      assignedTo || req.user.id, relatedType || null, relatedId || null, req.user.id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'task', entityId: rows[0].id, newValues: { title }, ip: req.ip });
  res.status(201).json(rows[0]);
});

async function loadOwnedTask(id, req) {
  const { clause, params } = visibilityClause(req.user, 2);
  const { rows } = await db.query(
    `SELECT * FROM tasks t WHERE t.id = $1 AND t.company_id = $${params.length + 2} ${clause}`,
    [id, ...params, req.user.companyId]
  );
  return rows[0] || null;
}

// PATCH /tasks/:id { title, notes, dueDate, priority, assignedTo, relatedType, relatedId }
const updateTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await loadOwnedTask(id, req);
  if (!existing) throw new ApiError(404, 'Task not found');

  const { title, notes, dueDate, priority, assignedTo, relatedType, relatedId } = req.body;
  if (priority && !PRIORITIES.includes(priority)) throw new ApiError(400, `priority must be one of: ${PRIORITIES.join(', ')}`);
  if (relatedType && !RELATED_TYPES.includes(relatedType)) throw new ApiError(400, `relatedType must be one of: ${RELATED_TYPES.join(', ')}`);
  if (assignedTo && assignedTo !== existing.assigned_to && !canManageAll(req.user)) {
    throw new ApiError(403, 'You need tasks.manage_all to reassign this task');
  }

  const { rows } = await db.query(
    `UPDATE tasks SET
       title = COALESCE($1, title), notes = COALESCE($2, notes), due_date = COALESCE($3, due_date),
       priority = COALESCE($4, priority), assigned_to = COALESCE($5, assigned_to),
       related_type = COALESCE($6, related_type), related_id = COALESCE($7, related_id),
       updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [title, notes, dueDate, priority, assignedTo, relatedType, relatedId, id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'task', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// PATCH /tasks/:id/status { status }
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${STATUSES.join(', ')}`);

  const existing = await loadOwnedTask(id, req);
  if (!existing) throw new ApiError(404, 'Task not found');

  const { rows } = await db.query(
    `UPDATE tasks SET status = $1::varchar, completed_at = CASE WHEN $1::varchar = 'done' THEN NOW() ELSE NULL END, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [status, id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'task', entityId: id, newValues: { status }, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /tasks/:id
const deleteTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await loadOwnedTask(id, req);
  if (!existing) throw new ApiError(404, 'Task not found');

  await db.query('DELETE FROM tasks WHERE id = $1', [id]);
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'task', entityId: id, ip: req.ip });
  res.status(204).send();
});

module.exports = { listTasks, createTask, updateTask, updateTaskStatus, deleteTask };
