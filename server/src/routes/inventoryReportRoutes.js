const express = require('express');
const router = express.Router();
const reportController = require('../controllers/inventoryReportController');
const binCardController = require('../controllers/binCardController');
const dashboardController = require('../controllers/inventoryDashboardController');
const managementReportController = require('../controllers/inventoryManagementReportController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/inventory-reports/low-stock', requirePermission('inventory.reports.view'), reportController.lowStockReport);
router.get('/inventory-reports/valuation', requirePermission('inventory.reports.view'), reportController.valuationReport);
router.get('/inventory-reports/expiry', requirePermission('inventory.reports.view'), reportController.expiryReport);
router.get('/inventory-reports/bins', requirePermission('inventory.reports.view'), binCardController.listBins);
router.get('/inventory-reports/bin-card', requirePermission('inventory.reports.view'), binCardController.binCardReport);
router.get('/inventory-reports/workspace-dashboard', requirePermission('inventory.reports.view'), dashboardController.workspaceDashboard);
router.get('/inventory-reports/management-report', requirePermission('inventory.reports.view'), managementReportController.managementReport);

module.exports = router;
