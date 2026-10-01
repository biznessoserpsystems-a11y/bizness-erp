const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Returns this company's petty_cash_settings row, creating a default one
// first if it doesn't exist yet.
async function getPettyCashSettings(companyId) {
  await db.query('INSERT INTO petty_cash_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING', [companyId]);
  const { rows } = await db.query('SELECT * FROM petty_cash_settings WHERE company_id = $1', [companyId]);
  return rows[0];
}

// Route guard: blocks the request unless the named company switch is on.
function requirePettyCashSetting(column, message) {
  return asyncHandler(async (req, res, next) => {
    const settings = await getPettyCashSettings(req.user.companyId);
    if (!settings[column]) throw new ApiError(403, message);
    next();
  });
}

module.exports = { getPettyCashSettings, requirePettyCashSetting };
