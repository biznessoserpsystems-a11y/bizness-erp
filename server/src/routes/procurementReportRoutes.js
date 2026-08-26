const express = require('express');
const router = express.Router();
const reportController = require('../controllers/procurementReportController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/procurement-reports/summary', requirePermission('procurement.reports.view'), reportController.purchaseSummary);
router.get('/procurement-reports/payables-aging', requirePermission('procurement.reports.view'), reportController.payablesAging);
router.get('/procurement-reports/register', requirePermission('procurement.reports.view'), reportController.purchaseRegister);

module.exports = router;
