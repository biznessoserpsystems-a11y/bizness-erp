const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');
const inventorySettingsService = require('../services/inventorySettingsService');

const listWarehouses = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT w.*, b.name AS branch_name FROM warehouses w
     LEFT JOIN branches b ON b.id = w.branch_id
     WHERE w.company_id = $1 ORDER BY w.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createWarehouse = asyncHandler(async (req, res) => {
  const { name, code, branchId, location } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const { rows } = await db.query(
    'INSERT INTO warehouses (company_id, branch_id, name, code, location) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [req.user.companyId, branchId || null, name, code || null, location || null]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'warehouse', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, code, branchId, location, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE warehouses SET
       name = COALESCE($1, name), code = COALESCE($2, code), branch_id = COALESCE($3, branch_id),
       location = COALESCE($4, location), is_active = COALESCE($5, is_active)
     WHERE id = $6 AND company_id = $7 RETURNING *`,
    [name, code, branchId, location, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Warehouse not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'warehouse', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// ============================================================================
// Inventory & Warehouse Settings
// ============================================================================

// GET /inventory/settings
const getInventorySettings = asyncHandler(async (req, res) => {
  const settings = await inventorySettingsService.getSettings(db, req.user.companyId);
  res.json(settings);
});

// PUT /inventory/settings
// { defaultWarehouseId, allowNegativeStock, defaultReorderLevel, defaultReorderQuantity, expiryAlertWindowDays, stockCountVarianceTolerancePct }
const updateInventorySettings = asyncHandler(async (req, res) => {
  const {
    defaultWarehouseId, allowNegativeStock, defaultReorderLevel, defaultReorderQuantity,
    expiryAlertWindowDays, stockCountVarianceTolerancePct,
  } = req.body;

  if (expiryAlertWindowDays !== undefined && Number(expiryAlertWindowDays) <= 0) {
    throw new ApiError(400, 'expiryAlertWindowDays must be greater than zero');
  }
  if (stockCountVarianceTolerancePct !== undefined && (Number(stockCountVarianceTolerancePct) < 0 || Number(stockCountVarianceTolerancePct) > 100)) {
    throw new ApiError(400, 'stockCountVarianceTolerancePct must be between 0 and 100');
  }
  if (defaultReorderLevel !== undefined && Number(defaultReorderLevel) < 0) {
    throw new ApiError(400, 'defaultReorderLevel cannot be negative');
  }
  if (defaultReorderQuantity !== undefined && Number(defaultReorderQuantity) < 0) {
    throw new ApiError(400, 'defaultReorderQuantity cannot be negative');
  }
  if (defaultWarehouseId) {
    const warehouse = await db.query('SELECT id FROM warehouses WHERE id = $1 AND company_id = $2', [defaultWarehouseId, req.user.companyId]);
    if (!warehouse.rows.length) throw new ApiError(400, 'defaultWarehouseId is not a warehouse belonging to this company');
  }

  // Ensure the row exists first (companies registered before this module
  // shipped, or any that skipped the migration backfill).
  await inventorySettingsService.getSettings(db, req.user.companyId);

  const { rows } = await db.query(
    `UPDATE inventory_settings SET
       default_warehouse_id = CASE WHEN $1::UUID IS NULL AND $2::BOOLEAN THEN NULL ELSE COALESCE($1, default_warehouse_id) END,
       allow_negative_stock = COALESCE($3, allow_negative_stock),
       default_reorder_level = COALESCE($4, default_reorder_level),
       default_reorder_quantity = COALESCE($5, default_reorder_quantity),
       expiry_alert_window_days = COALESCE($6, expiry_alert_window_days),
       stock_count_variance_tolerance_pct = COALESCE($7, stock_count_variance_tolerance_pct),
       updated_at = NOW()
     WHERE company_id = $8
     RETURNING *`,
    [
      defaultWarehouseId || null, defaultWarehouseId === null, allowNegativeStock,
      defaultReorderLevel, defaultReorderQuantity, expiryAlertWindowDays, stockCountVarianceTolerancePct,
      req.user.companyId,
    ]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'inventory_settings', entityId: req.user.companyId, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listWarehouses, createWarehouse, updateWarehouse, getInventorySettings, updateInventorySettings };
