const express = require('express');
const router = express.Router();
const pettyCashController = require('../controllers/pettyCashController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/petty-cash-accounts', requirePermission('accounting.petty_cash.manage'), pettyCashController.listPettyCashAccounts);
router.post('/petty-cash-accounts', requirePermission('accounting.petty_cash.manage'), pettyCashController.createPettyCashAccount);
router.get('/petty-cash-accounts/:id/vouchers', requirePermission('accounting.petty_cash.manage'), pettyCashController.listVouchers);
router.post('/petty-cash-accounts/:id/vouchers', requirePermission('accounting.petty_cash.manage'), pettyCashController.createVoucher);
router.get('/petty-cash-accounts/:id/receipts', requirePermission('accounting.petty_cash.manage'), pettyCashController.listReceipts);
router.post('/petty-cash-accounts/:id/receipts', requirePermission('accounting.petty_cash.manage'), pettyCashController.createReceipt);

module.exports = router;
