const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

// GET /suppliers/:supplierId/contacts
const listContacts = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const { rows } = await db.query(
    `SELECT * FROM supplier_contacts WHERE supplier_id = $1 AND company_id = $2 ORDER BY is_primary DESC, name`,
    [supplierId, req.user.companyId]
  );
  res.json(rows);
});

// POST /suppliers/:supplierId/contacts  { name, jobTitle, email, phone, isPrimary, notes }
const createContact = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const { name, jobTitle, email, phone, isPrimary, notes } = req.body;
  if (!name) throw new ApiError(400, 'name is required');

  const supplier = await db.query('SELECT id FROM suppliers WHERE id = $1 AND company_id = $2', [supplierId, req.user.companyId]);
  if (!supplier.rows.length) throw new ApiError(404, 'Supplier not found');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    if (isPrimary) {
      await client.query('UPDATE supplier_contacts SET is_primary = FALSE WHERE supplier_id = $1', [supplierId]);
    }
    const { rows } = await client.query(
      `INSERT INTO supplier_contacts (company_id, supplier_id, name, job_title, email, phone, is_primary, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.companyId, supplierId, name, jobTitle || null, email || null, phone || null, !!isPrimary, notes || null]
    );
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'supplier_contact', entityId: rows[0].id, newValues: { name }, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /supplier-contacts/:id
const updateContact = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, jobTitle, email, phone, isPrimary, notes } = req.body;

  const existing = await db.query('SELECT * FROM supplier_contacts WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Contact not found');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    if (isPrimary) {
      await client.query('UPDATE supplier_contacts SET is_primary = FALSE WHERE supplier_id = $1', [existing.rows[0].supplier_id]);
    }
    const { rows } = await client.query(
      `UPDATE supplier_contacts SET
         name = COALESCE($1, name), job_title = COALESCE($2, job_title), email = COALESCE($3, email),
         phone = COALESCE($4, phone), is_primary = COALESCE($5, is_primary), notes = COALESCE($6, notes),
         updated_at = NOW()
       WHERE id = $7 AND company_id = $8 RETURNING *`,
      [name, jobTitle, email, phone, isPrimary, notes, id, req.user.companyId]
    );
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'supplier_contact', entityId: id, newValues: req.body, ip: req.ip });
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// DELETE /supplier-contacts/:id
const deleteContact = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query('DELETE FROM supplier_contacts WHERE id = $1 AND company_id = $2 RETURNING id', [id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Contact not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'supplier_contact', entityId: id, ip: req.ip });
  res.status(204).send();
});

module.exports = { listContacts, createContact, updateContact, deleteContact };
