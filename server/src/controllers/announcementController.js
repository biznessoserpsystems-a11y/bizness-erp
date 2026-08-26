const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');
const { recordAudit } = require('../middleware/auditLog');

// GET /announcements — visible to everyone (like a company noticeboard).
const listAnnouncements = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.*, u.first_name, u.last_name
     FROM announcements a
     LEFT JOIN users u ON u.id = a.posted_by
     WHERE a.company_id = $1
     ORDER BY a.created_at DESC LIMIT 100`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /announcements  { title, body } — requires communications.announcements.manage
const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) throw new ApiError(400, 'title and body are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO announcements (company_id, title, body, posted_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.companyId, title, body, req.user.id]
    );
    const announcement = rows[0];

    const notifiedCount = await notificationService.notifyAllActiveUsers(client, {
      companyId: req.user.companyId, excludeUserId: req.user.id,
      type: 'announcement', title: `Announcement: ${title}`, body,
      link: '/communications', referenceType: 'announcement', referenceId: announcement.id, createdBy: req.user.id,
    });

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'announcement', entityId: announcement.id, newValues: { title }, ip: req.ip });
    res.status(201).json({ ...announcement, notifiedCount });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// DELETE /announcements/:id
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query('DELETE FROM announcements WHERE id = $1 AND company_id = $2 RETURNING *', [id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Announcement not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'announcement', entityId: id, ip: req.ip });
  res.json({ message: 'Deleted' });
});

module.exports = { listAnnouncements, createAnnouncement, deleteAnnouncement };
