const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');
const { NATURE_OF_BUSINESS_OPTIONS } = require('./authController');

// GET /company  (current company's profile)
const getCompany = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, lt.token AS license_token,
            (SELECT COUNT(*)::int FROM companies WHERE license_token_id = c.license_token_id) AS license_token_companies
     FROM companies c
     LEFT JOIN license_tokens lt ON lt.id = c.license_token_id
     WHERE c.id = $1`,
    [req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Company not found');
  res.json(rows[0]);
});

// PATCH /company
const updateCompany = asyncHandler(async (req, res) => {
  const { name, legalName, tin, registrationNo, address, city, region, phone, email, baseCurrency, docNumberFormat, docNumberPadding, natureOfBusiness } = req.body;

  if (docNumberFormat !== undefined && !docNumberFormat.includes('{SEQ}')) {
    throw new ApiError(400, 'docNumberFormat must include a {SEQ} placeholder, or documents from the same prefix and year would collide');
  }
  if (docNumberPadding !== undefined && (!Number.isInteger(docNumberPadding) || docNumberPadding < 1 || docNumberPadding > 10)) {
    throw new ApiError(400, 'docNumberPadding must be a whole number between 1 and 10');
  }
  if (natureOfBusiness && !NATURE_OF_BUSINESS_OPTIONS.includes(natureOfBusiness)) {
    throw new ApiError(400, 'natureOfBusiness must be one of the provided options');
  }

  const before = await db.query('SELECT * FROM companies WHERE id = $1', [req.user.companyId]);
  if (!before.rows.length) throw new ApiError(404, 'Company not found');

  const { rows } = await db.query(
    `UPDATE companies SET
       name = COALESCE($1, name), legal_name = COALESCE($2, legal_name), tin = COALESCE($3, tin),
       registration_no = COALESCE($4, registration_no), address = COALESCE($5, address),
       city = COALESCE($6, city), region = COALESCE($7, region), phone = COALESCE($8, phone),
       email = COALESCE($9, email), base_currency = COALESCE($10, base_currency),
       doc_number_format = COALESCE($11, doc_number_format), doc_number_padding = COALESCE($12, doc_number_padding),
       nature_of_business = COALESCE($13, nature_of_business),
       updated_at = NOW()
     WHERE id = $14 RETURNING *`,
    [name, legalName, tin, registrationNo, address, city, region, phone, email, baseCurrency, docNumberFormat, docNumberPadding, natureOfBusiness, req.user.companyId]
  );

  await recordAudit({
    companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE',
    entityType: 'company', entityId: req.user.companyId, oldValues: before.rows[0], newValues: req.body, ip: req.ip,
  });

  res.json(rows[0]);
});

// GET /company/document-numbering — current counters, so Settings can show "next number" per doc type
const listDocumentNumbering = asyncHandler(async (req, res) => {
  const company = await db.query('SELECT doc_number_format, doc_number_padding FROM companies WHERE id = $1', [req.user.companyId]);
  const { rows } = await db.query(
    `SELECT prefix, year, next_number FROM document_number_sequences WHERE company_id = $1 ORDER BY prefix, year DESC`,
    [req.user.companyId]
  );
  res.json({ format: company.rows[0].doc_number_format, padding: company.rows[0].doc_number_padding, sequences: rows });
});

// GET /branches
const listBranches = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM branches WHERE company_id = $1 ORDER BY is_head_office DESC, name',
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /branches
const createBranch = asyncHandler(async (req, res) => {
  const { name, code, address, city, region, phone } = req.body;
  if (!name) throw new ApiError(400, 'name is required');

  const { rows } = await db.query(
    `INSERT INTO branches (company_id, name, code, address, city, region, phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.user.companyId, name, code || null, address || null, city || null, region || null, phone || null]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'branch', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /branches/:id
const updateBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, code, address, city, region, phone, isActive } = req.body;

  const existing = await db.query('SELECT * FROM branches WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Branch not found');

  const { rows } = await db.query(
    `UPDATE branches SET
       name = COALESCE($1, name), code = COALESCE($2, code), address = COALESCE($3, address),
       city = COALESCE($4, city), region = COALESCE($5, region), phone = COALESCE($6, phone),
       is_active = COALESCE($7, is_active), updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [name, code, address, city, region, phone, isActive, id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'branch', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { getCompany, updateCompany, listDocumentNumbering, listBranches, createBranch, updateBranch };
