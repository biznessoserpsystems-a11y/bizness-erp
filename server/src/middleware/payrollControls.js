const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const db = require('../config/db');

// Returns this company's payroll_settings row, creating a default one first if it
// doesn't exist yet (the same lazy-create the payroll run itself relies on).
async function getPayrollControlsRow(client, companyId) {
  await client.query('INSERT INTO payroll_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING', [companyId]);
  const { rows } = await client.query('SELECT allow_record_edit, allow_record_delete FROM payroll_settings WHERE company_id = $1', [companyId]);
  return rows[0];
}

// Route guard: blocks the request unless the named switch is on for this company.
function requirePayrollControl(column, message) {
  return asyncHandler(async (req, res, next) => {
    const row = await getPayrollControlsRow(db, req.user.companyId);
    if (!row[column]) throw new ApiError(403, message);
    next();
  });
}

module.exports = { getPayrollControlsRow, requirePayrollControl };
