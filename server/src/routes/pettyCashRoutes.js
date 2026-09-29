const express = require('express');
const router = express.Router();
const pettyCashController = require('../controllers/pettyCashController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const pettyCashSettingsController = require('../controllers/pettyCashSettingsController');
const { requirePettyCashSetting } = require('../middleware/pettyCashSettings');

const editsAllowed = requirePettyCashSetting('allow_edit', 'Editing petty cash records is turned off. Enable it under Settings > Petty Cash Settings.');
const deletesAllowed = requirePettyCashSetting('allow_delete', 'Deleting petty cash records is turned off. Enable it under Settings > Petty Cash Settings.');

router.use(authenticate);

router.get('/petty-cash/settings', requirePermission('accounting.petty_cash.manage', 'accounting.petty_cash.settings'), pettyCashSettingsController.getSettings);
router.put('/petty-cash/settings', requirePermission('accounting.petty_cash.settings'), pettyCashSettingsController.updateSettings);

router.get('/petty-cash-accounts', requirePermission('accounting.petty_cash.manage'), pettyCashController.listPettyCashAccounts);
router.post('/petty-cash-accounts', requirePermission('accounting.petty_cash.manage'), pettyCashController.createPettyCashAccount);
router.put('/petty-cash-accounts/:id', requirePermission('accounting.petty_cash.edit'), editsAllowed, pettyCashController.updatePettyCashAccount);
router.delete('/petty-cash-accounts/:id', requirePermission('accounting.petty_cash.delete'), deletesAllowed, pettyCashController.deletePettyCashAccount);

router.get('/petty-cash-accounts/:id/vouchers', requirePermission('accounting.petty_cash.manage'), pettyCashController.listVouchers);
router.post('/petty-cash-accounts/:id/vouchers', requirePermission('accounting.petty_cash.manage'), pettyCashController.createVoucher);
router.put('/petty-cash-accounts/:id/vouchers/:voucherId', requirePermission('accounting.petty_cash.edit'), editsAllowed, pettyCashController.updateVoucher);
router.delete('/petty-cash-accounts/:id/vouchers/:voucherId', requirePermission('accounting.petty_cash.delete'), deletesAllowed, pettyCashController.deleteVoucher);

router.get('/petty-cash-accounts/:id/receipts', requirePermission('accounting.petty_cash.manage'), pettyCashController.listReceipts);
router.post('/petty-cash-accounts/:id/receipts', requirePermission('accounting.petty_cash.manage'), pettyCashController.createReceipt);
router.put('/petty-cash-accounts/:id/receipts/:receiptId', requirePermission('accounting.petty_cash.edit'), editsAllowed, pettyCashController.updateReceipt);
router.delete('/petty-cash-accounts/:id/receipts/:receiptId', requirePermission('accounting.petty_cash.delete'), deletesAllowed, pettyCashController.deleteReceipt);

module.exports = router;
