const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService'); // reused for generateDocNo
const { recordAudit } = require('../middleware/auditLog');

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

// GET /leads?stage=qualified
const listLeads = asyncHandler(async (req, res) => {
  const { stage } = req.query;
  const conditions = ['l.company_id = $1'];
  const params = [req.user.companyId];
  if (stage) {
    conditions.push(`l.stage = $${params.length + 1}`);
    params.push(stage);
  }
  const { rows } = await db.query(
    `SELECT l.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
     FROM leads l LEFT JOIN users u ON u.id = l.owner_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.created_at DESC`,
    params
  );
  res.json(rows);
});

// GET /leads/:id — includes contacts and activity timeline
const getLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT l.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
     FROM leads l LEFT JOIN users u ON u.id = l.owner_id
     WHERE l.id = $1 AND l.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Lead not found');

  const contacts = await db.query(`SELECT * FROM contacts WHERE lead_id = $1 ORDER BY is_primary DESC, created_at`, [id]);
  const activities = await db.query(
    `SELECT a.*, u.first_name, u.last_name FROM crm_activities a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.related_type = 'lead' AND a.related_id = $1 ORDER BY a.created_at DESC`,
    [id]
  );
  res.json({ ...header.rows[0], contacts: contacts.rows, activities: activities.rows });
});

// POST /leads { name, companyName, email, phone, source, estimatedValue, expectedCloseDate, ownerId, notes }
const createLead = asyncHandler(async (req, res) => {
  const { name, companyName, email, phone, source, estimatedValue, expectedCloseDate, ownerId, notes } = req.body;
  if (!name) throw new ApiError(400, 'name is required');

  const leadNo = await salesService.generateDocNo(db, req.user.companyId, 'LD');
  const { rows } = await db.query(
    `INSERT INTO leads (company_id, lead_no, name, company_name, email, phone, source, estimated_value, expected_close_date, owner_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.user.companyId, leadNo, name, companyName || null, email || null, phone || null, source || null,
      estimatedValue || 0, expectedCloseDate || null, ownerId || req.user.id, notes || null, req.user.id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'lead', entityId: rows[0].id, newValues: { name, leadNo }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /leads/:id { name, companyName, email, phone, source, stage, estimatedValue, expectedCloseDate, ownerId, notes, isActive }
const updateLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, companyName, email, phone, source, stage, estimatedValue, expectedCloseDate, ownerId, notes, isActive } = req.body;
  if (stage && !STAGES.includes(stage)) throw new ApiError(400, `stage must be one of: ${STAGES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE leads SET
       name = COALESCE($1, name), company_name = COALESCE($2, company_name), email = COALESCE($3, email),
       phone = COALESCE($4, phone), source = COALESCE($5, source), stage = COALESCE($6, stage),
       estimated_value = COALESCE($7, estimated_value), expected_close_date = COALESCE($8, expected_close_date),
       owner_id = COALESCE($9, owner_id), notes = COALESCE($10, notes), is_active = COALESCE($11, is_active),
       updated_at = NOW()
     WHERE id = $12 AND company_id = $13 RETURNING *`,
    [name, companyName, email, phone, source, stage, estimatedValue, expectedCloseDate, ownerId, notes, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Lead not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'lead', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// POST /leads/:id/convert  { customerCode, creditLimit, paymentTermsDays }
// Turns a won lead into a real customer record and links the two.
const convertToCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { customerCode, creditLimit, paymentTermsDays } = req.body;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const leadResult = await client.query('SELECT * FROM leads WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    const lead = leadResult.rows[0];
    if (!lead) throw new ApiError(404, 'Lead not found');
    if (lead.converted_customer_id) throw new ApiError(409, 'This lead has already been converted to a customer');

    const code = customerCode || `CUST-${Date.now()}`;
    const existingCode = await client.query('SELECT id FROM customers WHERE company_id = $1 AND customer_code = $2', [req.user.companyId, code]);
    if (existingCode.rows.length) throw new ApiError(409, 'A customer with this code already exists');

    const customerResult = await client.query(
      `INSERT INTO customers (company_id, customer_code, name, email, phone, credit_limit, payment_terms_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.companyId, code, lead.company_name || lead.name, lead.email, lead.phone, creditLimit || 0, paymentTermsDays || 0]
    );
    const customer = customerResult.rows[0];

    await client.query(
      `UPDATE leads SET stage = 'won', converted_customer_id = $1, updated_at = NOW() WHERE id = $2`,
      [customer.id, id]
    );

    // Carry the lead's contacts over to the new customer record.
    await client.query(
      `UPDATE contacts SET customer_id = $1 WHERE lead_id = $2`,
      [customer.id, id]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'lead', entityId: id, newValues: { convertedTo: customer.id }, ip: req.ip });
    res.status(201).json({ lead: { ...lead, stage: 'won', converted_customer_id: customer.id }, customer });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listLeads, getLead, createLead, updateLead, convertToCustomer, STAGES };
