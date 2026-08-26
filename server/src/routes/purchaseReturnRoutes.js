const express = require('express');
const router = express.Router();
const returnController = require('../controllers/purchaseReturnController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/purchase-returns', requirePermission('procurement.returns.manage'), returnController.listReturns);
router.post('/purchase-returns', requirePermission('procurement.returns.manage'), returnController.createReturn);
router.get('/debit-notes', requirePermission('procurement.returns.manage'), returnController.listDebitNotes);
router.post('/debit-notes/:id/apply', requirePermission('procurement.returns.manage'), returnController.applyDebitNote);

module.exports = router;
