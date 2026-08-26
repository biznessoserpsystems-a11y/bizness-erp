const express = require('express');
const router = express.Router();
const reportController = require('../controllers/salesReportController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/sales-reports/summary', requirePermission('sales.reports.view'), reportController.salesSummary);
router.get('/sales-reports/receivables-aging', requirePermission('sales.reports.view'), reportController.receivablesAging);
router.get('/sales-reports/register', requirePermission('sales.reports.view'), reportController.salesRegister);
router.get('/sales-reports/by-branch', requirePermission('sales.reports.view'), reportController.salesByBranch);
router.get('/sales-reports/by-category', requirePermission('sales.reports.view'), reportController.salesByCategory);

module.exports = router;
