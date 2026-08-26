const express = require('express');
const router = express.Router();
const openingBalanceController = require('../controllers/openingBalanceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/opening-balances', requirePermission('accounting.coa.manage'), openingBalanceController.listOpeningBalances);
router.put('/opening-balances', requirePermission('accounting.coa.manage'), openingBalanceController.setOpeningBalances);

module.exports = router;
