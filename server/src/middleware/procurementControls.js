const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const procurementSettingsService = require('../services/procurementSettingsService');
const db = require('../config/db');

// Route guard: blocks the request unless the named Procurement Settings
// switch (allow_record_edit / allow_record_delete) is on for this company.
function requireProcurementControl(column, message) {
  return asyncHandler(async (req, res, next) => {
    const settings = await procurementSettingsService.getSettings(db, req.user.companyId);
    if (!settings[column]) throw new ApiError(403, message);
    next();
  });
}

module.exports = { requireProcurementControl };
