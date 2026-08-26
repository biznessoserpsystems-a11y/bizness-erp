const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

const listAccounts = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT coa.*, parent.account_name AS parent_account_name
     FROM chart_of_accounts coa
     LEFT JOIN chart_of_accounts parent ON parent.id = coa.parent_account_id
     WHERE coa.company_id = $1 ORDER BY coa.account_code`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createAccount = asyncHandler(async (req, res) => {
  const { accountCode, accountName, accountType, accountSubtype, parentAccountId, description } = req.body;
  if (!accountCode || !accountName || !accountType) throw new ApiError(400, 'accountCode, accountName, and accountType are required');
  if (!accountingService.NORMAL_BALANCE[accountType]) throw new ApiError(400, 'accountType must be one of: asset, liability, equity, revenue, expense');

  const existing = await db.query('SELECT id FROM chart_of_accounts WHERE company_id = $1 AND account_code = $2', [req.user.companyId, accountCode]);
  if (existing.rows.length) throw new ApiError(409, 'An account with this code already exists');

  const { rows } = await db.query(
    `INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, parent_account_id, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, accountCode, accountName, accountType, accountSubtype || null, accountingService.NORMAL_BALANCE[accountType], parentAccountId || null, description || null]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'chart_of_accounts', entityId: rows[0].id, newValues: { accountCode, accountName }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountName, accountSubtype, parentAccountId, description, isActive } = req.body;

  const { rows } = await db.query(
    `UPDATE chart_of_accounts SET
       account_name = COALESCE($1, account_name), account_subtype = COALESCE($2, account_subtype),
       parent_account_id = COALESCE($3, parent_account_id), description = COALESCE($4, description),
       is_active = COALESCE($5, is_active), updated_at = NOW()
     WHERE id = $6 AND company_id = $7 RETURNING *`,
    [accountName, accountSubtype, parentAccountId, description, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Account not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'chart_of_accounts', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// GET /gl-mappings
const listMappings = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.mapping_key, m.account_id, coa.account_code, coa.account_name
     FROM gl_account_mappings m JOIN chart_of_accounts coa ON coa.id = m.account_id
     WHERE m.company_id = $1`,
    [req.user.companyId]
  );
  res.json(rows);
});

// PUT /gl-mappings/:mappingKey  { accountId }
const setMapping = asyncHandler(async (req, res) => {
  const { mappingKey } = req.params;
  const { accountId } = req.body;
  if (!accountId) throw new ApiError(400, 'accountId is required');

  const account = await db.query('SELECT id FROM chart_of_accounts WHERE id = $1 AND company_id = $2', [accountId, req.user.companyId]);
  if (!account.rows.length) throw new ApiError(404, 'Account not found');

  const { rows } = await db.query(
    `INSERT INTO gl_account_mappings (company_id, mapping_key, account_id) VALUES ($1,$2,$3)
     ON CONFLICT (company_id, mapping_key) DO UPDATE SET account_id = EXCLUDED.account_id
     RETURNING *`,
    [req.user.companyId, mappingKey, accountId]
  );
  res.json(rows[0]);
});

// POST /accounting/setup-defaults — seeds standard chart of accounts + mappings (safe to re-run)
const setupDefaults = asyncHandler(async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await accountingService.seedDefaultChartOfAccounts(client, req.user.companyId);
    await client.query('COMMIT');
    res.json({ message: 'Default chart of accounts and GL mappings are set up.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listAccounts, createAccount, updateAccount, listMappings, setMapping, setupDefaults };
