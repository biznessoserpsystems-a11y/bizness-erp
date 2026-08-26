const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const DOC_TYPES = ['work_permit', 'professional_license', 'ssnit_certificate', 'background_check', 'drug_test', 'business_license', 'other'];
const DOC_STATUSES = ['active', 'pending_renewal', 'revoked'];
const INCIDENT_TYPES = ['grievance', 'disciplinary', 'safety_incident', 'harassment_complaint', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];
const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'closed'];

function canManage(user) {
  return (user.permissions || []).includes('hr.compliance.manage');
}

async function findOwnEmployee(req) {
  const { rows } = await db.query('SELECT id FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
  return rows[0] || null;
}

// Shared expiry computation, added to every document row returned to the client.
const EXPIRY_CASE = `
  CASE
    WHEN cd.expiry_date IS NULL THEN 'no_expiry'
    WHEN cd.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN cd.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'valid'
  END AS expiry_state
`;

// ---------------- Compliance documents ----------------

// GET /compliance-documents?employeeId=&expiryState=
const listComplianceDocuments = asyncHandler(async (req, res) => {
  const { employeeId, expiryState } = req.query;
  const conditions = ['cd.company_id = $1'];
  const params = [req.user.companyId];

  if (employeeId) {
    if (!canManage(req.user)) {
      const own = await findOwnEmployee(req);
      if (!own || own.id !== employeeId) throw new ApiError(403, 'You can only view your own compliance documents');
    }
    params.push(employeeId);
    conditions.push(`cd.employee_id = $${params.length}`);
  } else if (!canManage(req.user)) {
    const own = await findOwnEmployee(req);
    if (own) {
      conditions.push(`(cd.employee_id = $${params.length + 1} OR cd.employee_id IS NULL)`);
      params.push(own.id);
    } else {
      conditions.push('cd.employee_id IS NULL');
    }
  }

  const { rows } = await db.query(
    `SELECT cd.*, ${EXPIRY_CASE}, e.first_name, e.last_name
     FROM compliance_documents cd LEFT JOIN employees e ON e.id = cd.employee_id
     WHERE ${conditions.join(' AND ')} ORDER BY cd.expiry_date NULLS LAST, cd.created_at DESC`,
    params
  );

  const filtered = expiryState ? rows.filter((r) => r.expiry_state === expiryState) : rows;
  res.json(filtered);
});

// POST /compliance-documents { employeeId, documentType, documentName, issuingAuthority, issueDate, expiryDate, notes }
const createComplianceDocument = asyncHandler(async (req, res) => {
  const { employeeId, documentType, documentName, issuingAuthority, issueDate, expiryDate, notes } = req.body;
  if (!documentType || !documentName) throw new ApiError(400, 'documentType and documentName are required');
  if (!DOC_TYPES.includes(documentType)) throw new ApiError(400, `documentType must be one of: ${DOC_TYPES.join(', ')}`);

  const { rows } = await db.query(
    `INSERT INTO compliance_documents (company_id, employee_id, document_type, document_name, issuing_authority, issue_date, expiry_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.companyId, employeeId || null, documentType, documentName, issuingAuthority || null, issueDate || null, expiryDate || null, notes || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'compliance_document', entityId: rows[0].id, newValues: { documentName }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /compliance-documents/:id
const updateComplianceDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { documentName, issuingAuthority, issueDate, expiryDate, status, notes } = req.body;
  if (status && !DOC_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${DOC_STATUSES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE compliance_documents SET
       document_name = COALESCE($1, document_name), issuing_authority = COALESCE($2, issuing_authority),
       issue_date = COALESCE($3, issue_date), expiry_date = COALESCE($4, expiry_date),
       status = COALESCE($5, status), notes = COALESCE($6, notes), updated_at = NOW()
     WHERE id = $7 AND company_id = $8 RETURNING *`,
    [documentName, issuingAuthority, issueDate, expiryDate, status, notes, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Compliance document not found');
  res.json(rows[0]);
});

// ---------------- Company policies & acknowledgments ----------------

// GET /company-policies
const listPolicies = asyncHandler(async (req, res) => {
  const employee = await findOwnEmployee(req);
  const { rows } = await db.query(
    `SELECT p.*,
            ${employee ? '(SELECT 1 FROM policy_acknowledgments pa WHERE pa.policy_id = p.id AND pa.employee_id = $2) IS NOT NULL AS acknowledged_by_me' : 'FALSE AS acknowledged_by_me'},
            (SELECT COUNT(*)::int FROM policy_acknowledgments pa WHERE pa.policy_id = p.id) AS acknowledgment_count
     FROM company_policies p WHERE p.company_id = $1 AND p.is_active = TRUE ORDER BY p.effective_date DESC`,
    employee ? [req.user.companyId, employee.id] : [req.user.companyId]
  );
  res.json(rows);
});

// POST /company-policies { name, description, version, effectiveDate, requiresAcknowledgment }
const createPolicy = asyncHandler(async (req, res) => {
  const { name, description, version, effectiveDate, requiresAcknowledgment } = req.body;
  if (!name) throw new ApiError(400, 'name is required');

  const { rows } = await db.query(
    `INSERT INTO company_policies (company_id, name, description, version, effective_date, requires_acknowledgment, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.companyId, name, description || null, version || '1.0', effectiveDate || new Date().toISOString().slice(0, 10),
      requiresAcknowledgment !== false, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// POST /company-policies/:id/acknowledge — always for the caller's own employee record
const acknowledgePolicy = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employee = await findOwnEmployee(req);
  if (!employee) throw new ApiError(400, 'Your user account is not linked to an employee record');

  const policy = await db.query('SELECT 1 FROM company_policies WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!policy.rows.length) throw new ApiError(404, 'Policy not found');

  const { rows } = await db.query(
    `INSERT INTO policy_acknowledgments (company_id, policy_id, employee_id) VALUES ($1,$2,$3)
     ON CONFLICT (policy_id, employee_id) DO NOTHING RETURNING *`,
    [req.user.companyId, id, employee.id]
  );
  res.status(201).json(rows[0] || { alreadyAcknowledged: true });
});

// GET /company-policies/:id/acknowledgments — hr.compliance.manage only, see who has/hasn't acknowledged
const listAcknowledgments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT e.id AS employee_id, e.first_name, e.last_name, e.employee_no,
            pa.acknowledged_at
     FROM employees e
     LEFT JOIN policy_acknowledgments pa ON pa.employee_id = e.id AND pa.policy_id = $1
     WHERE e.company_id = $2 AND e.employment_status = 'active'
     ORDER BY (pa.acknowledged_at IS NULL) DESC, e.first_name`,
    [id, req.user.companyId]
  );
  res.json(rows);
});

// ---------------- Incidents ----------------

// GET /compliance-incidents?employeeId=&status=
const listIncidents = asyncHandler(async (req, res) => {
  const { employeeId, status } = req.query;
  const conditions = ['ci.company_id = $1'];
  const params = [req.user.companyId];

  if (!canManage(req.user)) {
    const own = await findOwnEmployee(req);
    if (!own) throw new ApiError(403, 'Missing required permission: hr.compliance.manage');
    if (employeeId && employeeId !== own.id) throw new ApiError(403, "You can only view incidents about yourself");
    params.push(own.id);
    conditions.push(`ci.employee_id = $${params.length}`);
  } else if (employeeId) {
    params.push(employeeId);
    conditions.push(`ci.employee_id = $${params.length}`);
  }

  if (status) {
    if (!INCIDENT_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${INCIDENT_STATUSES.join(', ')}`);
    params.push(status);
    conditions.push(`ci.status = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT ci.*, e.first_name, e.last_name, u.first_name AS reported_by_first_name, u.last_name AS reported_by_last_name
     FROM compliance_incidents ci
     LEFT JOIN employees e ON e.id = ci.employee_id
     LEFT JOIN users u ON u.id = ci.reported_by
     WHERE ${conditions.join(' AND ')} ORDER BY ci.incident_date DESC`,
    params
  );
  res.json(rows);
});

// POST /compliance-incidents { employeeId, incidentType, severity, description, incidentDate } — hr.compliance.manage only
const createIncident = asyncHandler(async (req, res) => {
  const { employeeId, incidentType, severity, description, incidentDate } = req.body;
  if (!incidentType || !description) throw new ApiError(400, 'incidentType and description are required');
  if (!INCIDENT_TYPES.includes(incidentType)) throw new ApiError(400, `incidentType must be one of: ${INCIDENT_TYPES.join(', ')}`);
  if (severity && !SEVERITIES.includes(severity)) throw new ApiError(400, `severity must be one of: ${SEVERITIES.join(', ')}`);

  const { rows } = await db.query(
    `INSERT INTO compliance_incidents (company_id, employee_id, incident_type, severity, description, incident_date, reported_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.companyId, employeeId || null, incidentType, severity || 'medium', description, incidentDate || new Date().toISOString().slice(0, 10), req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'compliance_incident', entityId: rows[0].id, newValues: { incidentType }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /compliance-incidents/:id { status, resolutionNotes } — hr.compliance.manage only
const updateIncident = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, resolutionNotes, severity } = req.body;
  if (status && !INCIDENT_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${INCIDENT_STATUSES.join(', ')}`);
  if (severity && !SEVERITIES.includes(severity)) throw new ApiError(400, `severity must be one of: ${SEVERITIES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE compliance_incidents SET
       status = COALESCE($1::varchar, status), resolution_notes = COALESCE($2, resolution_notes), severity = COALESCE($3, severity),
       resolved_at = CASE WHEN COALESCE($1::varchar, status) IN ('resolved', 'closed') THEN NOW() ELSE resolved_at END,
       updated_at = NOW()
     WHERE id = $4 AND company_id = $5 RETURNING *`,
    [status, resolutionNotes, severity, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Incident not found');
  res.json(rows[0]);
});

// GET /hr-reports/compliance-summary — hr.compliance.manage only
const getComplianceSummary = asyncHandler(async (req, res) => {
  const docs = await db.query(
    `SELECT ${EXPIRY_CASE}, COUNT(*)::int AS count
     FROM compliance_documents cd WHERE cd.company_id = $1 GROUP BY expiry_state`,
    [req.user.companyId]
  );
  const incidents = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM compliance_incidents WHERE company_id = $1 GROUP BY status`,
    [req.user.companyId]
  );
  res.json({ documentsByExpiryState: docs.rows, incidentsByStatus: incidents.rows });
});

module.exports = {
  listComplianceDocuments, createComplianceDocument, updateComplianceDocument,
  listPolicies, createPolicy, acknowledgePolicy, listAcknowledgments,
  listIncidents, createIncident, updateIncident,
  getComplianceSummary,
};
