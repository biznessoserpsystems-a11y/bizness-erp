const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');
const inventorySettingsService = require('../services/inventorySettingsService');

const getInventorySettings = asyncHandler(async (req, res) => {
  const settings = await inventorySettingsService.getSettings(db, req.user.companyId);
  res.json(settings);
});

// PUT /inventory/settings { defaultReorderLevel, defaultReorderQuantity, skuEditingEnabled }
const updateInventorySettings = asyncHandler(async (req, res) => {
  const { defaultReorderLevel, defaultReorderQuantity, skuEditingEnabled } = req.body;

  await inventorySettingsService.getSettings(db, req.user.companyId); // ensures the row exists first

  const { rows } = await db.query(
    `UPDATE inventory_settings SET
       default_reorder_level = COALESCE($1, default_reorder_level),
       default_reorder_quantity = COALESCE($2, default_reorder_quantity),
       sku_editing_enabled = COALESCE($3, sku_editing_enabled),
       updated_at = NOW()
     WHERE company_id = $4 RETURNING *`,
    [defaultReorderLevel, defaultReorderQuantity, skuEditingEnabled, req.user.companyId]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'inventory_settings', entityId: req.user.companyId, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { getInventorySettings, updateInventorySettings };
