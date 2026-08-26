const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

// GET /contacts?customerId=... or ?leadId=...
const listContacts = asyncHandler(async (req, res) => {
  const { customerId, leadId } = req.query;
  if (!customerId && !leadId) throw new ApiError(400, 'customerId or leadId is required');

  const { rows } = await db.query(
    `SELECT * FROM contacts WHERE company_id = $1 AND ${customerId ? 'customer_id = $2' : 'lead_id = $2'}
     ORDER BY is_primary DESC, created_at`,
    [req.user.companyId, customerId || leadId]
  );
  res.json(rows);
});

// POST /contacts { customerId?, leadId?, firstName, lastName, title, email, phone, isPrimary, notes }
const createContact = asyncHandler(async (req, res) => {
  const { customerId, leadId, firstName, lastName, title, email, phone, isPrimary, notes } = req.body;
  if (!customerId && !leadId) throw new ApiError(400, 'customerId or leadId is required');
  if (!firstName) throw new ApiError(400, 'firstName is required');

  const { rows } = await db.query(
    `INSERT INTO contacts (company_id, customer_id, lead_id, first_name, last_name, title, email, phone, is_primary, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.companyId, customerId || null, leadId || null, firstName, lastName || null, title || null, email || null, phone || null, !!isPrimary, notes || null]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'contact', entityId: rows[0].id, newValues: { firstName, lastName }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /contacts/:id
const updateContact = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, title, email, phone, isPrimary, notes } = req.body;

  const { rows } = await db.query(
    `UPDATE contacts SET
       first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), title = COALESCE($3, title),
       email = COALESCE($4, email), phone = COALESCE($5, phone), is_primary = COALESCE($6, is_primary),
       notes = COALESCE($7, notes), updated_at = NOW()
     WHERE id = $8 AND company_id = $9 RETURNING *`,
    [firstName, lastName, title, email, phone, isPrimary, notes, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Contact not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'contact', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /contacts/:id
const deleteContact = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query('DELETE FROM contacts WHERE id = $1 AND company_id = $2 RETURNING id', [id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Contact not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'contact', entityId: id, ip: req.ip });
  res.json({ success: true });
});

module.exports = { listContacts, createContact, updateContact, deleteContact };
