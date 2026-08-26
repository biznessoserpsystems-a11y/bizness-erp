const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const RELATED_TYPES = ['customer', 'supplier', 'invoice', 'lead'];

function canManageAll(user) {
  return (user.permissions || []).includes('calendar.manage_all');
}

// GET /calendar-events?from=&to=
const listEvents = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const conditions = ['e.company_id = $1', 'e.starts_at >= $2', 'e.starts_at <= $3'];
  const params = [req.user.companyId, from, to];

  if (!canManageAll(req.user)) {
    params.push(req.user.id);
    conditions.push(`EXISTS (SELECT 1 FROM calendar_event_attendees a WHERE a.event_id = e.id AND a.user_id = $${params.length})`);
  }

  const { rows } = await db.query(
    `SELECT e.*, c.first_name AS creator_first_name, c.last_name AS creator_last_name,
            COALESCE(
              (SELECT json_agg(json_build_object('id', u.id, 'firstName', u.first_name, 'lastName', u.last_name))
               FROM calendar_event_attendees a JOIN users u ON u.id = a.user_id WHERE a.event_id = e.id),
              '[]'
            ) AS attendees
     FROM calendar_events e
     LEFT JOIN users c ON c.id = e.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.starts_at ASC`,
    params
  );
  res.json(rows);
});

// POST /calendar-events { title, description, startsAt, endsAt, allDay, relatedType, relatedId, attendeeUserIds }
const createEvent = asyncHandler(async (req, res) => {
  const { title, description, startsAt, endsAt, allDay, relatedType, relatedId, attendeeUserIds } = req.body;
  if (!title) throw new ApiError(400, 'title is required');
  if (!startsAt) throw new ApiError(400, 'startsAt is required');
  if (relatedType && !RELATED_TYPES.includes(relatedType)) throw new ApiError(400, `relatedType must be one of: ${RELATED_TYPES.join(', ')}`);

  const otherAttendees = (attendeeUserIds || []).filter((id) => id !== req.user.id);
  if (otherAttendees.length > 0 && !canManageAll(req.user)) {
    throw new ApiError(403, 'You need calendar.manage_all to add other attendees to an event');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO calendar_events (company_id, title, description, starts_at, ends_at, all_day, related_type, related_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.companyId, title, description || null, startsAt, endsAt || null, !!allDay, relatedType || null, relatedId || null, req.user.id]
    );
    const event = rows[0];

    const attendeeIds = new Set([req.user.id, ...otherAttendees]);
    for (const userId of attendeeIds) {
      await client.query(
        `INSERT INTO calendar_event_attendees (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [event.id, userId]
      );
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'calendar_event', entityId: event.id, newValues: { title }, ip: req.ip });
    res.status(201).json(event);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

async function loadVisibleEvent(id, req) {
  if (canManageAll(req.user)) {
    const { rows } = await db.query('SELECT * FROM calendar_events WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    return rows[0] || null;
  }
  const { rows } = await db.query(
    `SELECT e.* FROM calendar_events e
     WHERE e.id = $1 AND e.company_id = $2
       AND EXISTS (SELECT 1 FROM calendar_event_attendees a WHERE a.event_id = e.id AND a.user_id = $3)`,
    [id, req.user.companyId, req.user.id]
  );
  return rows[0] || null;
}

// PATCH /calendar-events/:id { title, description, startsAt, endsAt, allDay, relatedType, relatedId }
const updateEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await loadVisibleEvent(id, req);
  if (!existing) throw new ApiError(404, 'Event not found');

  const { title, description, startsAt, endsAt, allDay, relatedType, relatedId } = req.body;
  if (relatedType && !RELATED_TYPES.includes(relatedType)) throw new ApiError(400, `relatedType must be one of: ${RELATED_TYPES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE calendar_events SET
       title = COALESCE($1, title), description = COALESCE($2, description),
       starts_at = COALESCE($3, starts_at), ends_at = COALESCE($4, ends_at),
       all_day = COALESCE($5, all_day), related_type = COALESCE($6, related_type),
       related_id = COALESCE($7, related_id), updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [title, description, startsAt, endsAt, allDay, relatedType, relatedId, id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'calendar_event', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /calendar-events/:id
const deleteEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await loadVisibleEvent(id, req);
  if (!existing) throw new ApiError(404, 'Event not found');

  await db.query('DELETE FROM calendar_events WHERE id = $1', [id]);
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'calendar_event', entityId: id, ip: req.ip });
  res.status(204).send();
});

module.exports = { listEvents, createEvent, updateEvent, deleteEvent };
