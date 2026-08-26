const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const procurementSettingsService = require('../services/procurementSettingsService');
const { recordAudit } = require('../middleware/auditLog');

// GET /procurement/settings
const getProcurementSettings = asyncHandler(async (req, res) => {
  const settings = await procurementSettingsService.getSettings(db, req.user.companyId);
  res.json(settings);
});

// PUT /procurement/settings
// { defaultPaymentTermsDays, defaultVatRate, defaultCurrency,
//   requisitionAutoApproveLimit, poAutoApproveLimit, rfqMinQuotes }
const updateProcurementSettings = asyncHandler(async (req, res) => {
  const {
    defaultPaymentTermsDays, defaultVatRate, defaultCurrency,
    requisitionAutoApproveLimit, poAutoApproveLimit, rfqMinQuotes,
  } = req.body;

  if (defaultPaymentTermsDays !== undefined && Number(defaultPaymentTermsDays) < 0) {
    throw new ApiError(400, 'defaultPaymentTermsDays cannot be negative');
  }
  if (defaultVatRate !== undefined && (Number(defaultVatRate) < 0 || Number(defaultVatRate) > 100)) {
    throw new ApiError(400, 'defaultVatRate must be between 0 and 100');
  }
  if (defaultCurrency !== undefined) {
    const currencyResult = await db.query('SELECT currency_code FROM company_currencies WHERE company_id = $1 AND currency_code = $2', [req.user.companyId, defaultCurrency]);
    if (!currencyResult.rows.length) throw new ApiError(400, `${defaultCurrency} is not an enabled currency for this company — enable it under Currencies & Exchange Rates first`);
  }
  if (requisitionAutoApproveLimit !== undefined && Number(requisitionAutoApproveLimit) < 0) {
    throw new ApiError(400, 'requisitionAutoApproveLimit cannot be negative');
  }
  if (poAutoApproveLimit !== undefined && Number(poAutoApproveLimit) < 0) {
    throw new ApiError(400, 'poAutoApproveLimit cannot be negative');
  }
  if (rfqMinQuotes !== undefined && Number(rfqMinQuotes) < 0) {
    throw new ApiError(400, 'rfqMinQuotes cannot be negative');
  }

  // Ensure the row exists first (companies registered before this module
  // shipped, or any that skipped the migration backfill).
  await procurementSettingsService.getSettings(db, req.user.companyId);

  const { rows } = await db.query(
    `UPDATE procurement_settings SET
       default_payment_terms_days = COALESCE($1, default_payment_terms_days),
       default_vat_rate = COALESCE($2, default_vat_rate),
       default_currency = COALESCE($3, default_currency),
       requisition_auto_approve_limit = COALESCE($4, requisition_auto_approve_limit),
       po_auto_approve_limit = COALESCE($5, po_auto_approve_limit),
       rfq_min_quotes = COALESCE($6, rfq_min_quotes),
       updated_at = NOW()
     WHERE company_id = $7
     RETURNING *`,
    [defaultPaymentTermsDays, defaultVatRate, defaultCurrency, requisitionAutoApproveLimit, poAutoApproveLimit, rfqMinQuotes, req.user.companyId]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'procurement_settings', entityId: req.user.companyId, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { getProcurementSettings, updateProcurementSettings };
