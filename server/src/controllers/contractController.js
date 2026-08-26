const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const { recordAudit } = require('../middleware/auditLog');

const listContracts = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, s.name AS supplier_name
     FROM procurement_contracts c JOIN suppliers s ON s.id = c.supplier_id
     WHERE c.company_id = $1 ORDER BY c.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createContract = asyncHandler(async (req, res) => {
  const { supplierId, title, startDate, endDate, contractValue, terms } = req.body;
  if (!supplierId || !title) throw new ApiError(400, 'supplierId and title are required');

  const contractNo = await salesService.generateDocNo(db, req.user.companyId, 'CTR');
  const { rows } = await db.query(
    `INSERT INTO procurement_contracts (company_id, supplier_id, contract_no, title, start_date, end_date, contract_value, terms, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.companyId, supplierId, contractNo, title, startDate || null, endDate || null, contractValue || null, terms || null, req.user.id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'procurement_contract', entityId: rows[0].id, newValues: { title }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateContractStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'expired', 'terminated'].includes(status)) throw new ApiError(400, 'Invalid status');

  const { rows } = await db.query(
    'UPDATE procurement_contracts SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *',
    [status, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Contract not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'procurement_contract', entityId: id, newValues: { status }, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listContracts, createContract, updateContractStatus };
