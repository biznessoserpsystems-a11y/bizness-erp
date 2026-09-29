const express = require('express');
const router = express.Router();
const pettyCashController = require('../controllers/pettyCashController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/petty-cash-accounts', requirePermission('accounting.petty_cash.manage'), pettyCashController.listPettyCashAccounts);
router.post('/petty-cash-accounts', requirePermission('accounting.petty_cash.manage'), pettyCashController.createPettyCashAccount);
router.put('/petty-cash-accounts/:id', requirePermission('accounting.petty_cash.edit'), pettyCashController.updatePettyCashAccount);
router.delete('/petty-cash-accounts/:id', requirePermission('accounting.petty_cash.delete'), pettyCashController.deletePettyCashAccount);

router.get('/petty-cash-accounts/:id/vouchers', requirePermission('accounting.petty_cash.manage'), pettyCashController.listVouchers);
router.post('/petty-cash-accounts/:id/vouchers', requirePermission('accounting.petty_cash.manage'), pettyCashController.createVoucher);
router.put('/petty-cash-accounts/:id/vouchers/:voucherId', requirePermission('accounting.petty_cash.edit'), pettyCashController.updateVoucher);
router.delete('/petty-cash-accounts/:id/vouchers/:voucherId', requirePermission('accounting.petty_cash.delete'), pettyCashController.deleteVoucher);

router.get('/petty-cash-accounts/:id/receipts', requirePermission('accounting.petty_cash.manage'), pettyCashController.listReceipts);
router.post('/petty-cash-accounts/:id/receipts', requirePermission('accounting.petty_cash.manage'), pettyCashController.createReceipt);
router.put('/petty-cash-accounts/:id/receipts/:receiptId', requirePermission('accounting.petty_cash.edit'), pettyCashController.updateReceipt);
router.delete('/petty-cash-accounts/:id/receipts/:receiptId', requirePermission('accounting.petty_cash.delete'), pettyCashController.deleteReceipt);

module.exports = router;
