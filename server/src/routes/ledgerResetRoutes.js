const express = require('express');
const router = express.Router();
const controller = require('../controllers/ledgerResetController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/ledger-reset/accounts', requirePermission('accounting.ledger.reset'), controller.listAccounts);
router.post('/ledger-reset', requirePermission('accounting.ledger.reset'), controller.resetLedgers);

module.exports = router;
