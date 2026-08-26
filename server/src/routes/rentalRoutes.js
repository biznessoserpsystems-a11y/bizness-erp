const express = require('express');
const router = express.Router();
const rental = require('../controllers/rentalController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/rental/items', requirePermission('rental.items.manage'), rental.listRentalItems);
router.post('/rental/items', requirePermission('rental.items.manage'), rental.createRentalItem);
router.get('/rental/items/:id/maintenance', requirePermission('rental.items.manage'), rental.listMaintenanceForItem);
router.post('/rental/items/:id/maintenance', requirePermission('rental.items.manage'), rental.scheduleMaintenance);
router.post('/rental/maintenance/:id/start', requirePermission('rental.items.manage'), rental.startMaintenance);
router.post('/rental/maintenance/:id/complete', requirePermission('rental.items.manage'), rental.completeMaintenance);

router.get('/rental/agreements', requirePermission('rental.agreements.manage'), rental.listRentalAgreements);
router.get('/rental/agreements/:id', requirePermission('rental.agreements.manage'), rental.getRentalAgreement);
router.post('/rental/agreements', requirePermission('rental.agreements.manage'), rental.createRentalAgreement);
router.post('/rental/agreements/:id/check-out', requirePermission('rental.agreements.manage'), rental.checkOutAgreement);
router.post('/rental/agreements/:id/check-in', requirePermission('rental.agreements.manage'), rental.checkInAgreement);
router.post('/rental/agreements/:id/charges', requirePermission('rental.agreements.manage'), rental.billRentalCharge);
router.post('/rental/agreements/:id/payments', requirePermission('rental.agreements.manage'), rental.recordRentalPayment);
router.post('/rental/agreements/:id/deposit/collect', requirePermission('rental.agreements.manage'), rental.collectDeposit);
router.post('/rental/agreements/:id/deposit/refund', requirePermission('rental.agreements.manage'), rental.refundDeposit);
router.post('/rental/agreements/:id/deposit/forfeit', requirePermission('rental.agreements.manage'), rental.forfeitDeposit);

router.get('/rental/reports/summary', requirePermission('rental.reports.view'), rental.rentalSummaryReport);
router.get('/rental/reports/asset-utilization', requirePermission('rental.reports.view'), rental.assetUtilizationReport);
router.get('/rental/reports/workspace-dashboard', requirePermission('rental.reports.view'), rental.rentalWorkspaceDashboard);

module.exports = router;
