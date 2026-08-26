const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bankController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/bank-accounts', requirePermission('accounting.banking.manage'), bankController.listBankAccounts);
router.post('/bank-accounts', requirePermission('accounting.banking.manage'), bankController.createBankAccount);
router.get('/bank-accounts/:id/statement-lines', requirePermission('accounting.banking.manage'), bankController.listStatementLines);
router.post('/bank-accounts/:id/statement-lines', requirePermission('accounting.banking.manage'), bankController.importStatementLines);
router.get('/bank-accounts/:id/reconciliation', requirePermission('accounting.banking.manage'), bankController.getReconciliationView);
router.get('/bank-accounts/:id/reconciliation-statement', requirePermission('accounting.banking.manage'), bankController.getReconciliationStatement);
router.post('/bank-accounts/:id/auto-reconcile', requirePermission('accounting.banking.manage'), bankController.autoReconcile);
router.patch('/bank-statement-lines/:id/reconcile', requirePermission('accounting.banking.manage'), bankController.reconcileLine);

module.exports = router;
