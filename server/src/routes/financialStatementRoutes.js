const express = require('express');
const router = express.Router();
const fsController = require('../controllers/financialStatementController');
const managementAccountController = require('../controllers/managementAccountController');
const ifrsAdditionalController = require('../controllers/ifrsAdditionalStatementsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/financial-statements/income-statement', requirePermission('accounting.ledger.view'), fsController.incomeStatement);
router.get('/financial-statements/balance-sheet', requirePermission('accounting.ledger.view'), fsController.balanceSheet);
router.get('/financial-statements/ratios', requirePermission('accounting.ledger.view'), fsController.financialRatios);
router.get('/financial-statements/management-accounts', requirePermission('accounting.management_reports.view'), managementAccountController.managementAccounts);
router.get('/financial-statements/management-accounts/commentary', requirePermission('accounting.management_reports.view'), managementAccountController.getCommentary);
router.put('/financial-statements/management-accounts/commentary', requirePermission('accounting.management_reports.view'), managementAccountController.saveCommentary);
router.get('/financial-statements/cash-flow', requirePermission('accounting.ledger.view'), ifrsAdditionalController.cashFlowStatement);
router.get('/financial-statements/changes-in-equity', requirePermission('accounting.ledger.view'), ifrsAdditionalController.changesInEquity);

module.exports = router;
