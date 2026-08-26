const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const CHANNELS = ['call', 'email', 'meeting', 'site_visit', 'note'];

// GET /suppliers/:supplierId/communications
const listCommunications = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const { rows } = await db.query(
    `SELECT c.*, u.first_name, u.last_name, sc.name AS contact_name
     FROM supplier_communications c
     LEFT JOIN users u ON u.id = c.created_by
     LEFT JOIN supplier_contacts sc ON sc.id = c.contact_id
     WHERE c.supplier_id = $1 AND c.company_id = $2
     ORDER BY c.contact_date DESC, c.created_at DESC`,
    [supplierId, req.user.companyId]
  );
  res.json(rows);
});

// POST /suppliers/:supplierId/communications  { channel, subject, notes, contactDate, contactId }
const createCommunication = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const { channel, subject, notes, contactDate, contactId } = req.body;
  if (!subject) throw new ApiError(400, 'subject is required');
  if (channel && !CHANNELS.includes(channel)) throw new ApiError(400, `channel must be one of: ${CHANNELS.join(', ')}`);

  const supplier = await db.query('SELECT id FROM suppliers WHERE id = $1 AND company_id = $2', [supplierId, req.user.companyId]);
  if (!supplier.rows.length) throw new ApiError(404, 'Supplier not found');

  const { rows } = await db.query(
    `INSERT INTO supplier_communications (company_id, supplier_id, contact_id, channel, subject, notes, contact_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, CURRENT_DATE),$8) RETURNING *`,
    [req.user.companyId, supplierId, contactId || null, channel || 'note', subject, notes || null, contactDate || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'supplier_communication', entityId: rows[0].id, newValues: { subject }, ip: req.ip });
  res.status(201).json(rows[0]);
});

module.exports = { listCommunications, createCommunication };
