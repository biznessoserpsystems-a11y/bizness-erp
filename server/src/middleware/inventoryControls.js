const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const inventorySettingsService = require('../services/inventorySettingsService');
const db = require('../config/db');

// Route guard: blocks the request unless the named Inventory Settings switch
// (allow_record_edit / allow_record_delete) is on for this company.
function requireInventoryControl(column, message) {
  return asyncHandler(async (req, res, next) => {
    const settings = await inventorySettingsService.getSettings(db, req.user.companyId);
    if (!settings[column]) throw new ApiError(403, message);
    next();
  });
}

module.exports = { requireInventoryControl };
