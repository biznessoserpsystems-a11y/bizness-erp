const express = require('express');
const router = express.Router();
const taxReportController = require('../controllers/taxReportController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/tax-reports/vat-summary', requirePermission('accounting.tax_reports.view'), taxReportController.vatSummary);
router.get('/tax-reports/paye-summary', requirePermission('accounting.tax_reports.view'), taxReportController.payeSummary);

module.exports = router;
