const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/ledgerController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/ledger/:accountId', requirePermission('accounting.ledger.view'), ledgerController.accountLedger);
router.get('/trial-balance', requirePermission('accounting.ledger.view'), ledgerController.trialBalance);

module.exports = router;
