const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');
const { getPettyCashSettings } = require('../middleware/pettyCashSettings');

// GET /petty-cash/settings
const getSettings = asyncHandler(async (req, res) => {
  res.json(await getPettyCashSettings(req.user.companyId));
});

// PUT /petty-cash/settings { allowEdit, allowDelete }
const updateSettings = asyncHandler(async (req, res) => {
  const { allowEdit, allowDelete } = req.body;
  await getPettyCashSettings(req.user.companyId); // ensures the row exists first
  const { rows } = await db.query(
    `UPDATE petty_cash_settings SET
       allow_edit = COALESCE($1, allow_edit),
       allow_delete = COALESCE($2, allow_delete),
       updated_at = NOW()
     WHERE company_id = $3 RETURNING *`,
    [typeof allowEdit === 'boolean' ? allowEdit : null, typeof allowDelete === 'boolean' ? allowDelete : null, req.user.companyId]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'petty_cash_settings', entityId: req.user.companyId, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { getSettings, updateSettings };
