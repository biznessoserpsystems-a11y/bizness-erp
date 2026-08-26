const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/returns', requirePermission('sales.returns.manage'), returnController.listReturns);
router.post('/returns', requirePermission('sales.returns.manage'), returnController.createReturn);
router.get('/credit-notes', requirePermission('sales.returns.manage'), returnController.listCreditNotes);
router.post('/credit-notes/:id/apply', requirePermission('sales.returns.manage'), returnController.applyCreditNote);

module.exports = router;
